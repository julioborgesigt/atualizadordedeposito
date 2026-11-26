import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ensureSchema, limparResquiciosOrfaos } from '$lib/server/db';

const STATUS_VALIDOS = new Set([
	'EM_DEPOSITO',
	'DEPOSITO_DP_IGT',
	'RESTITUIDO_PARCIAL',
	'RESTITUIDO',
	'PERICIA',
	'JUDICIARIO',
	'DESTRUIDO'
]);

export const PATCH: RequestHandler = async ({ request, platform }) => {
	const db = platform?.env?.DB;
	if (!db) throw error(500, 'Binding DB não configurado.');
	await ensureSchema(db);

	const body = (await request.json()) as {
		ids?: number[];
		caixa_id?: number | null;
		nova_caixa_nome?: string | null;
		status?: string;
	};

	const ids = Array.isArray(body.ids)
		? body.ids.map(Number).filter((n) => Number.isInteger(n) && n > 0)
		: [];
	if (ids.length === 0) {
		throw error(400, 'Selecione ao menos um item.');
	}

	if (body.status && !STATUS_VALIDOS.has(body.status)) {
		throw error(400, 'Status inválido.');
	}

	let destinoCaixaId: number | null | undefined = body.caixa_id;
	const nomeNovaCaixa = body.nova_caixa_nome?.trim();

	if (nomeNovaCaixa) {
		await db.prepare('INSERT OR IGNORE INTO caixas (nome) VALUES (?)').bind(nomeNovaCaixa).run();
		const rowCaixa = await db
			.prepare('SELECT id FROM caixas WHERE UPPER(nome) = UPPER(?)')
			.bind(nomeNovaCaixa)
			.first<{ id: number }>();
		destinoCaixaId = rowCaixa?.id ?? null;
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

export const DELETE: RequestHandler = async ({ request, platform }) => {
	const db = platform?.env?.DB;
	if (!db) throw error(500, 'Binding DB não configurado.');
	await ensureSchema(db);

	const body = (await request.json()) as { ids?: number[] };
	const ids = Array.isArray(body.ids)
		? body.ids.map(Number).filter((n) => Number.isInteger(n) && n > 0)
		: [];

	if (ids.length === 0) {
		throw error(400, 'Selecione ao menos um item para excluir.');
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
