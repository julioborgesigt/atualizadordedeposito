import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ensureSchema, limparResquiciosOrfaos } from '$lib/server/db';
import { exigirUnidade } from '$lib/server/auth';

export const GET: RequestHandler = async ({ platform, locals }) => {
	const db = platform?.env?.DB;
	if (!db) throw error(500, 'Binding DB não configurado.');
	await ensureSchema(db, platform.env.ADMIN_INITIAL_PASSWORD);
	const unidade = exigirUnidade(locals);

	const whereSql = unidade.role === 'ADMIN' ? '' : 'WHERE c.unidade_id = ?';
	const binds = unidade.role === 'ADMIN' ? [] : [unidade.id];

	const { results: caixas } = await db
		.prepare(
			`SELECT c.id, c.nome, c.setor, c.observacoes, c.criado_em, c.unidade_id, u.nome AS unidade_nome,
			        COUNT(b.id) AS total_bens,
			        SUM(CASE WHEN b.status IN ('EM_DEPOSITO', 'DEPOSITO_DP_IGT', 'EM_EXTRACAO', 'PERICIA_PARCIAL', 'RESTITUIDO_PARCIAL') THEN 1 ELSE 0 END) AS em_deposito
			 FROM caixas c
			 LEFT JOIN unidades u ON u.id = c.unidade_id
			 LEFT JOIN bens b ON b.caixa_id = c.id
			 ${whereSql}
			 GROUP BY c.id
			 ORDER BY c.nome ASC`
		)
		.bind(...binds)
		.all<{
			id: number;
			nome: string;
			setor: string | null;
			observacoes: string | null;
			criado_em: string;
			unidade_id: number | null;
			unidade_nome: string | null;
			total_bens: number;
			em_deposito: number | null;
		}>();

	return json({ caixas });
};

export const POST: RequestHandler = async ({ request, platform, locals }) => {
	const db = platform?.env?.DB;
	if (!db) throw error(500, 'Binding DB não configurado.');
	await ensureSchema(db, platform.env.ADMIN_INITIAL_PASSWORD);
	const unidade = exigirUnidade(locals);

	const body = (await request.json()) as {
		nome?: string;
		setor?: string;
		observacoes?: string;
	};

	const nome = body.nome?.trim();
	if (!nome) throw error(400, 'Informe o nome da caixa.');

	const existenteMesmaUnidade = await db
		.prepare('SELECT id, nome FROM caixas WHERE UPPER(nome) = UPPER(?) AND unidade_id = ?')
		.bind(nome, unidade.id)
		.first<{ id: number; nome: string }>();

	if (existenteMesmaUnidade) {
		throw error(409, `Já existe uma caixa chamada "${existenteMesmaUnidade.nome}" na sua unidade.`);
	}

	const existenteOutraUnidade = await db
		.prepare('SELECT id FROM caixas WHERE UPPER(nome) = UPPER(?)')
		.bind(nome)
		.first<{ id: number }>();

	const nomeFinal = existenteOutraUnidade ? `${nome} (${unidade.nome})` : nome;

	const res = await db
		.prepare('INSERT INTO caixas (nome, setor, observacoes, unidade_id) VALUES (?, ?, ?, ?)')
		.bind(nomeFinal, body.setor?.trim() || 'Depósito', body.observacoes?.trim() || null, unidade.id)
		.run();

	return json({
		ok: true,
		caixa: {
			id: Number(res.meta.last_row_id),
			nome: nomeFinal
		}
	});
};

export const PATCH: RequestHandler = async ({ request, platform, locals }) => {
	const db = platform?.env?.DB;
	if (!db) throw error(500, 'Binding DB não configurado.');
	await ensureSchema(db, platform.env.ADMIN_INITIAL_PASSWORD);
	const unidade = exigirUnidade(locals);

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

	const atual = await db
		.prepare('SELECT id, unidade_id FROM caixas WHERE id = ?')
		.bind(id)
		.first<{ id: number; unidade_id: number | null }>();

	if (!atual) throw error(404, 'Caixa não encontrada.');
	if (unidade.role !== 'ADMIN' && atual.unidade_id !== unidade.id) {
		throw error(403, 'Sem permissão para editar esta caixa.');
	}

	const duplicada = await db
		.prepare('SELECT id FROM caixas WHERE UPPER(nome) = UPPER(?) AND id != ?')
		.bind(nome, id)
		.first<{ id: number }>();

	if (duplicada) {
		throw error(409, `Já existe outra caixa com o nome "${nome}".`);
	}

	await db
		.prepare(
			'UPDATE caixas SET nome = ?, setor = COALESCE(?, setor), observacoes = COALESCE(?, observacoes) WHERE id = ?'
		)
		.bind(nome, body.setor?.trim() || null, body.observacoes ?? null, id)
		.run();

	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ request, platform, locals }) => {
	const db = platform?.env?.DB;
	if (!db) throw error(500, 'Binding DB não configurado.');
	await ensureSchema(db, platform.env.ADMIN_INITIAL_PASSWORD);
	const unidade = exigirUnidade(locals);

	const body = (await request.json()) as {
		id?: number;
		acaoBens?: 'DESVINCULAR' | 'MOVER' | 'EXCLUIR';
		destinoCaixaId?: number | null;
	};

	const id = Number(body.id);
	if (!Number.isInteger(id)) throw error(400, 'ID da caixa inválido.');

	const atual = await db
		.prepare('SELECT id, unidade_id FROM caixas WHERE id = ?')
		.bind(id)
		.first<{ id: number; unidade_id: number | null }>();

	if (!atual) throw error(404, 'Caixa não encontrada.');
	if (unidade.role !== 'ADMIN' && atual.unidade_id !== unidade.id) {
		throw error(403, 'Sem permissão para excluir esta caixa.');
	}

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
		if (destino && unidade.role !== 'ADMIN') {
			const cxDest = await db
				.prepare('SELECT unidade_id FROM caixas WHERE id = ?')
				.bind(destino)
				.first<{ unidade_id: number | null }>();
			if (!cxDest || cxDest.unidade_id !== unidade.id) {
				throw error(403, 'A caixa de destino não pertence à sua unidade.');
			}
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
