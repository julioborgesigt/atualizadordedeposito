import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ensureSchema, limparResquiciosOrfaos } from '$lib/server/db';
import { exigirUnidade } from '$lib/server/auth';

const STATUS_VALIDOS = new Set([
	'EM_DEPOSITO',
	'DEPOSITO_DP_IGT',
	'EM_EXTRACAO',
	'RESTITUIDO_PARCIAL',
	'RESTITUIDO',
	'PERICIA',
	'JUDICIARIO',
	'DEPOSITO_JUDICIAL',
	'DESTRUIDO'
]);

export const PATCH: RequestHandler = async ({ request, platform, locals }) => {
	const db = platform?.env?.DB;
	if (!db) throw error(500, 'Binding DB não configurado.');
	await ensureSchema(db, platform.env.ADMIN_INITIAL_PASSWORD);
	const unidade = exigirUnidade(locals);

	const body = (await request.json()) as {
		ids?: number[];
		caixa_id?: number | null;
		nova_caixa_nome?: string | null;
		status?: string;
	};

	const idsInput = Array.isArray(body.ids)
		? body.ids.map(Number).filter((n) => Number.isInteger(n) && n > 0)
		: [];
	if (idsInput.length === 0) {
		throw error(400, 'Selecione ao menos um item.');
	}

	if (body.status && !STATUS_VALIDOS.has(body.status)) {
		throw error(400, 'Status inválido.');
	}

	const placeholdersInput = idsInput.map(() => '?').join(',');
	let ids = idsInput;

	if (unidade.role !== 'ADMIN') {
		const { results: permitidos } = await db
			.prepare(`SELECT id FROM bens WHERE id IN (${placeholdersInput}) AND unidade_id = ?`)
			.bind(...idsInput, unidade.id)
			.all<{ id: number }>();
		ids = (permitidos ?? []).map((r) => r.id);
		if (ids.length === 0) {
			throw error(403, 'Nenhum dos itens selecionados pertence à sua unidade.');
		}
	}

	let destinoCaixaId: number | null | undefined = body.caixa_id;
	const nomeNovaCaixa = body.nova_caixa_nome?.trim();

	if (nomeNovaCaixa) {
		const existenteMesma = await db
			.prepare('SELECT id FROM caixas WHERE UPPER(nome) = UPPER(?) AND unidade_id = ?')
			.bind(nomeNovaCaixa, unidade.id)
			.first<{ id: number }>();

		if (existenteMesma) {
			destinoCaixaId = existenteMesma.id;
		} else {
			const existenteOutra = await db
				.prepare('SELECT id FROM caixas WHERE UPPER(nome) = UPPER(?)')
				.bind(nomeNovaCaixa)
				.first<{ id: number }>();
			const nomeFinal = existenteOutra ? `${nomeNovaCaixa} (${unidade.nome})` : nomeNovaCaixa;
			await db
				.prepare('INSERT OR IGNORE INTO caixas (nome, unidade_id) VALUES (?, ?)')
				.bind(nomeFinal, unidade.id)
				.run();
			const rowCaixa = await db
				.prepare('SELECT id FROM caixas WHERE UPPER(nome) = UPPER(?) AND unidade_id = ?')
				.bind(nomeFinal, unidade.id)
				.first<{ id: number }>();
			destinoCaixaId = rowCaixa?.id ?? null;
		}
	} else if (destinoCaixaId !== undefined && destinoCaixaId !== null && unidade.role !== 'ADMIN') {
		const cx = await db
			.prepare('SELECT unidade_id FROM caixas WHERE id = ?')
			.bind(destinoCaixaId)
			.first<{ unidade_id: number | null }>();
		if (!cx || cx.unidade_id !== unidade.id) {
			throw error(403, 'Caixa de destino não pertence à sua unidade.');
		}
	}

	const placeholders = ids.map(() => '?').join(',');

	if (destinoCaixaId !== undefined) {
		await db
			.prepare(
				`UPDATE bens
				 SET caixa_id = ?, atualizado_em = datetime('now')
				 WHERE id IN (${placeholders})`
			)
			.bind(destinoCaixaId, ...ids)
			.run();
	}

	if (body.status) {
		await db
			.prepare(
				`UPDATE bens
				 SET status = ?, atualizado_em = datetime('now')
				 WHERE id IN (${placeholders})`
			)
			.bind(body.status, ...ids)
			.run();
	}

	const descMov = [
		destinoCaixaId !== undefined
			? `Movido em lote para caixa ${nomeNovaCaixa ? `"${nomeNovaCaixa}"` : (destinoCaixaId ?? 'Sem caixa')}`
			: null,
		body.status ? `Status alterado em lote para ${body.status}` : null
	]
		.filter(Boolean)
		.join(' | ');

	if (descMov) {
		const stmts = ids.map((bemId) =>
			db
				.prepare(
					`INSERT INTO movimentacoes (bem_id, tipo_evento, qtd_movimentada, data_evento, observacoes)
					 VALUES (?, 'AJUSTE_MANUAL', 0, date('now'), ?)`
				)
				.bind(bemId, descMov)
		);
		await db.batch(stmts);
	}

	return json({
		ok: true,
		atualizados: ids.length,
		caixa_id: destinoCaixaId ?? null
	});
};

export const DELETE: RequestHandler = async ({ request, platform, locals }) => {
	const db = platform?.env?.DB;
	if (!db) throw error(500, 'Binding DB não configurado.');
	await ensureSchema(db, platform.env.ADMIN_INITIAL_PASSWORD);
	const unidade = exigirUnidade(locals);

	const body = (await request.json()) as { ids?: number[] };
	const idsInput = Array.isArray(body.ids)
		? body.ids.map(Number).filter((n) => Number.isInteger(n) && n > 0)
		: [];

	if (idsInput.length === 0) {
		throw error(400, 'Selecione ao menos um item para excluir.');
	}

	const placeholdersInput = idsInput.map(() => '?').join(',');
	let ids = idsInput;

	if (unidade.role !== 'ADMIN') {
		const { results: permitidos } = await db
			.prepare(`SELECT id FROM bens WHERE id IN (${placeholdersInput}) AND unidade_id = ?`)
			.bind(...idsInput, unidade.id)
			.all<{ id: number }>();
		ids = (permitidos ?? []).map((r) => r.id);
		if (ids.length === 0) {
			throw error(403, 'Nenhum dos itens selecionados pertence à sua unidade.');
		}
	}

	const placeholders = ids.map(() => '?').join(',');

	await db
		.prepare(`DELETE FROM movimentacoes WHERE bem_id IN (${placeholders})`)
		.bind(...ids)
		.run();

	await db
		.prepare(`DELETE FROM bens WHERE id IN (${placeholders})`)
		.bind(...ids)
		.run();

	await limparResquiciosOrfaos(db);

	return json({ ok: true, excluidos: ids.length });
};
