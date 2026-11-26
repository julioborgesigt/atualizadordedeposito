import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ensureSchema, limparResquiciosOrfaos } from '$lib/server/db';

export const GET: RequestHandler = async ({ platform }) => {
	const db = platform?.env?.DB;
	if (!db) throw error(500, 'Binding DB não configurado.');
	await ensureSchema(db);

	const { results: caixas } = await db
		.prepare(
			`SELECT c.id, c.nome, c.setor, c.observacoes, c.criado_em,
			        COUNT(b.id) AS total_bens,
			        SUM(CASE WHEN b.status IN ('EM_DEPOSITO', 'DEPOSITO_DP_IGT', 'RESTITUIDO_PARCIAL') THEN 1 ELSE 0 END) AS em_deposito
			 FROM caixas c
			 LEFT JOIN bens b ON b.caixa_id = c.id
			 GROUP BY c.id
			 ORDER BY c.nome ASC`
		)
		.all<{
			id: number;
			nome: string;
			setor: string | null;
			observacoes: string | null;
			criado_em: string;
			total_bens: number;
			em_deposito: number | null;
		}>();

	return json({ caixas });
};

export const POST: RequestHandler = async ({ request, platform }) => {
	const db = platform?.env?.DB;
	if (!db) throw error(500, 'Binding DB não configurado.');
	await ensureSchema(db);

	const body = (await request.json()) as {
		nome?: string;
		setor?: string;
		observacoes?: string;
	};

	const nome = body.nome?.trim();
	if (!nome) throw error(400, 'Informe o nome da caixa.');

	const existente = await db
		.prepare('SELECT id, nome FROM caixas WHERE UPPER(nome) = UPPER(?)')
		.bind(nome)
		.first<{ id: number; nome: string }>();

	if (existente) {
		throw error(409, `Já existe uma caixa chamada "${existente.nome}".`);
	}

	const res = await db
		.prepare('INSERT INTO caixas (nome, setor, observacoes) VALUES (?, ?, ?)')
		.bind(nome, body.setor?.trim() || 'Depósito', body.observacoes?.trim() || null)
		.run();

	return json({
		ok: true,
		caixa: {
			id: Number(res.meta.last_row_id),
			nome
		}
	});
};

export const PATCH: RequestHandler = async ({ request, platform }) => {
	const db = platform?.env?.DB;
	if (!db) throw error(500, 'Binding DB não configurado.');
	await ensureSchema(db);

	const body = (await request.json()) as {
		id?: number;
		nome?: string;
		setor?: string;
		observacoes?: string | null;
	};

	const id = Number(body.id);
	const nome = body.nome?.trim();
	if (!Number.isInteger(id) || !nome) {
		throw error(400, 'ID e novo nome da caixa são obrigatórios.');
	}

	const duplicada = await db
		.prepare('SELECT id FROM caixas WHERE UPPER(nome) = UPPER(?) AND id != ?')
		.bind(nome, id)
		.first<{ id: number }>();

	if (duplicada) {
		throw error(409, `Já existe outra caixa com o nome "${nome}".`);
	}

	await db
		.prepare('UPDATE caixas SET nome = ?, setor = COALESCE(?, setor), observacoes = COALESCE(?, observacoes) WHERE id = ?')
		.bind(nome, body.setor?.trim() || null, body.observacoes ?? null, id)
		.run();

	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ request, platform }) => {
	const db = platform?.env?.DB;
	if (!db) throw error(500, 'Binding DB não configurado.');
	await ensureSchema(db);

	const body = (await request.json()) as {
		id?: number;
		acaoBens?: 'DESVINCULAR' | 'MOVER' | 'EXCLUIR';
		destinoCaixaId?: number | null;
	};

	const id = Number(body.id);
	if (!Number.isInteger(id)) throw error(400, 'ID da caixa inválido.');

	const acao = body.acaoBens ?? 'DESVINCULAR';

	if (acao === 'EXCLUIR') {
		await db
			.prepare('DELETE FROM movimentacoes WHERE bem_id IN (SELECT id FROM bens WHERE caixa_id = ?)')
			.bind(id)
			.run();
		await db.prepare('DELETE FROM bens WHERE caixa_id = ?').bind(id).run();
	} else if (acao === 'MOVER') {
		const destino = body.destinoCaixaId ? Number(body.destinoCaixaId) : null;
		if (destino === id) {
			throw error(400, 'A caixa de destino deve ser diferente da caixa excluída.');
		}
		await db
			.prepare("UPDATE bens SET caixa_id = ?, atualizado_em = datetime('now') WHERE caixa_id = ?")
			.bind(destino, id)
			.run();
	} else {
		await db
			.prepare("UPDATE bens SET caixa_id = NULL, atualizado_em = datetime('now') WHERE caixa_id = ?")
			.bind(id)
			.run();
	}

	await db.prepare('DELETE FROM caixas WHERE id = ?').bind(id).run();
	await limparResquiciosOrfaos(db);

	return json({ ok: true });
};
