import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ensureSchema } from '$lib/server/db';

const STATUS_VALIDOS = new Set([
	'EM_DEPOSITO',
	'DEPOSITO_DP_IGT',
	'EM_EXTRACAO',
	'RESTITUIDO_PARCIAL',
	'RESTITUIDO',
	'PERICIA',
	'JUDICIARIO',
	'DESTRUIDO'
]);

export const PATCH: RequestHandler = async ({ params, request, platform }) => {
	const db = platform?.env?.DB;
	if (!db) throw error(500, 'Binding DB não configurado.');
	await ensureSchema(db);

	const id = Number(params.id);
	if (!Number.isInteger(id)) throw error(400, 'ID inválido.');

	const body = (await request.json()) as {
		status?: string;
		caixa_id?: number | null;
		observacoes?: string | null;
	};

	if (body.status && !STATUS_VALIDOS.has(body.status)) {
		throw error(400, 'Status inválido.');
	}

	const atual = await db
		.prepare('SELECT status, caixa_id, observacoes FROM bens WHERE id = ?')
		.bind(id)
		.first<{ status: string; caixa_id: number | null; observacoes: string | null }>();

	if (!atual) throw error(404, 'Bem não encontrado.');

	const novoStatus = body.status ?? atual.status;
	const novaCaixa = body.caixa_id !== undefined ? body.caixa_id : atual.caixa_id;
	const novasObs = body.observacoes !== undefined ? body.observacoes : atual.observacoes;

	await db
		.prepare(
			`UPDATE bens
			 SET status = ?, caixa_id = ?, observacoes = ?, atualizado_em = datetime('now')
			 WHERE id = ?`
		)
		.bind(novoStatus, novaCaixa, novasObs, id)
		.run();

	const alteracoes: string[] = [];
	if (novoStatus !== atual.status) {
		alteracoes.push(`Status alterado manualmente de ${atual.status} para ${novoStatus}`);
	}
	if (novaCaixa !== atual.caixa_id) {
		alteracoes.push(`Caixa alterada de ${atual.caixa_id ?? 'nenhuma'} para ${novaCaixa ?? 'nenhuma'}`);
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

	return json({ ok: true });
};
