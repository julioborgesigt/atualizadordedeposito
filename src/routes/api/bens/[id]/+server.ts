import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ensureSchema } from '$lib/server/db';
import { exigirUnidade } from '$lib/server/auth';

const STATUS_VALIDOS = new Set([
	'EM_DEPOSITO',
	'DEPOSITO_DP_IGT',
	'EM_EXTRACAO',
	'RESTITUIDO_PARCIAL',
	'RESTITUIDO',
	'PERICIA',
	'PERICIA_PARCIAL',
	'JUDICIARIO',
	'DEPOSITO_JUDICIAL',
	'DESTRUIDO'
]);

export const PATCH: RequestHandler = async ({ params, request, platform, locals }) => {
	const db = platform?.env?.DB;
	if (!db) throw error(500, 'Binding DB não configurado.');
	await ensureSchema(db, platform.env.ADMIN_INITIAL_PASSWORD);
	const unidade = exigirUnidade(locals);

	const id = Number(params.id);
	if (!Number.isInteger(id)) throw error(400, 'ID inválido.');

	const body = (await request.json()) as {
		status?: string;
		caixa_id?: number | null;
		observacoes?: string | null;
		qtd_movimentada?: number;
		detalhe_parcial?: string;
	};

	if (body.status && !STATUS_VALIDOS.has(body.status)) {
		throw error(400, 'Status inválido.');
	}

	const atual = await db
		.prepare(
			'SELECT status, caixa_id, observacoes, unidade_id, qtd_total, qtd_disponivel, unidade FROM bens WHERE id = ?'
		)
		.bind(id)
		.first<{
			status: string;
			caixa_id: number | null;
			observacoes: string | null;
			unidade_id: number | null;
			qtd_total: number;
			qtd_disponivel: number;
			unidade: string;
		}>();

	if (!atual) throw error(404, 'Bem não encontrado.');
	if (unidade.role !== 'ADMIN' && atual.unidade_id !== unidade.id) {
		throw error(403, 'Sem permissão para alterar este item.');
	}

	if (body.caixa_id !== undefined && body.caixa_id !== null && unidade.role !== 'ADMIN') {
		const cx = await db
			.prepare('SELECT unidade_id FROM caixas WHERE id = ?')
			.bind(body.caixa_id)
			.first<{ unidade_id: number | null }>();
		if (!cx || cx.unidade_id !== unidade.id) {
			throw error(403, 'Caixa de destino não pertence à sua unidade.');
		}
	}

	const novoStatus = body.status ?? atual.status;
	const novaCaixa = body.caixa_id !== undefined ? body.caixa_id : atual.caixa_id;
	let novaQtdDisponivel = atual.qtd_disponivel;
	let novasObs = body.observacoes !== undefined ? body.observacoes : atual.observacoes;

	const ehParcial = novoStatus === 'PERICIA_PARCIAL' || novoStatus === 'RESTITUIDO_PARCIAL';
	let qtdMovRegistrada = 0;
	let tipoEventoMov: 'AJUSTE_MANUAL' | 'PERICIA' | 'RESTITUICAO' = 'AJUSTE_MANUAL';
	let detalheParcialLimpo = '';

	if (ehParcial && body.status) {
		const qtdMov = Number(body.qtd_movimentada);
		detalheParcialLimpo = body.detalhe_parcial?.trim() ?? '';

		if (!Number.isFinite(qtdMov) || qtdMov <= 0) {
			throw error(
				400,
				novoStatus === 'PERICIA_PARCIAL'
					? 'Informe a quantidade retirada para envio à PEFOCE (maior que zero).'
					: 'Informe a quantidade restituída parcialmente (maior que zero).'
			);
		}
		if (atual.qtd_disponivel > 0 && qtdMov > atual.qtd_disponivel) {
			throw error(
				400,
				`A quantidade informada (${qtdMov}) excede o saldo disponível atual (${atual.qtd_disponivel} ${atual.unidade}).`
			);
		}
		if (!detalheParcialLimpo) {
			throw error(
				400,
				novoStatus === 'PERICIA_PARCIAL'
					? 'Especifique o que foi encaminhado à PEFOCE.'
					: 'Especifique o que foi restituído parcialmente.'
			);
		}

		qtdMovRegistrada = qtdMov;
		novaQtdDisponivel = Math.max(0, Number((atual.qtd_disponivel - qtdMov).toFixed(4)));
		tipoEventoMov = novoStatus === 'PERICIA_PARCIAL' ? 'PERICIA' : 'RESTITUICAO';

		const prefixo = novoStatus === 'PERICIA_PARCIAL' ? 'Pefoce - Parcial' : 'Restituído parcial';
		const entradaObs = `[${prefixo}: -${qtdMov} ${atual.unidade} — ${detalheParcialLimpo}]`;
		novasObs = atual.observacoes ? `${atual.observacoes} | ${entradaObs}` : entradaObs;
	}

	await db
		.prepare(
			`UPDATE bens
			 SET status = ?, caixa_id = ?, qtd_disponivel = ?, observacoes = ?, atualizado_em = datetime('now')
			 WHERE id = ?`
		)
		.bind(novoStatus, novaCaixa, novaQtdDisponivel, novasObs, id)
		.run();

	if (ehParcial && body.status && qtdMovRegistrada > 0) {
		const rotulo =
			novoStatus === 'PERICIA_PARCIAL'
				? `Encaminhado parcialmente à PEFOCE (-${qtdMovRegistrada} ${atual.unidade}): ${detalheParcialLimpo}`
				: `Restituído parcialmente (-${qtdMovRegistrada} ${atual.unidade}): ${detalheParcialLimpo}`;
		await db
			.prepare(
				`INSERT INTO movimentacoes (bem_id, tipo_evento, qtd_movimentada, data_evento, observacoes)
				 VALUES (?, ?, ?, date('now'), ?)`
			)
			.bind(id, tipoEventoMov, qtdMovRegistrada, rotulo)
			.run();
	} else {
		const alteracoes: string[] = [];
		if (novoStatus !== atual.status) {
			alteracoes.push(`Status alterado manualmente de ${atual.status} para ${novoStatus}`);
		}
		if (novaCaixa !== atual.caixa_id) {
			alteracoes.push(
				`Caixa alterada de ${atual.caixa_id ?? 'nenhuma'} para ${novaCaixa ?? 'nenhuma'}`
			);
		}
		if (novasObs !== atual.observacoes) {
			alteracoes.push(`Observações atualizadas: ${novasObs || '(vazio)'}`);
		}

		if (alteracoes.length > 0) {
			await db
				.prepare(
					`INSERT INTO movimentacoes (bem_id, tipo_evento, qtd_movimentada, data_evento, observacoes)
					 VALUES (?, 'AJUSTE_MANUAL', 0, date('now'), ?)`
				)
				.bind(id, alteracoes.join(' | '))
				.run();
		}
	}

	return json({ ok: true, qtd_disponivel: novaQtdDisponivel, observacoes: novasObs });
};
