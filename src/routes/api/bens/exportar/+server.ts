import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ensureSchema } from '$lib/server/db';
import type { BemLista } from '../../../+page.server';

export const GET: RequestHandler = async ({ url, platform }) => {
	const db = platform?.env?.DB;
	if (!db) throw error(500, 'Binding DB não configurado.');
	await ensureSchema(db);

	const q = url.searchParams.get('q')?.trim() ?? '';
	const status = url.searchParams.get('status')?.trim() ?? '';
	const caixa = url.searchParams.get('caixa')?.trim() ?? '';
	const procedimento = url.searchParams.get('procedimento')?.trim() ?? '';

	const where: string[] = [];
	const binds: unknown[] = [];

	if (q) {
		where.push(
			`(p.numero_normalizado LIKE ? OR b.descricao_original LIKE ? OR b.identificador_unico LIKE ? OR p.operacao LIKE ? OR c.nome LIKE ?)`
		);
		const termo = `%${q}%`;
		binds.push(termo, termo, termo, termo, termo);
	}

	if (status) {
		where.push('b.status = ?');
		binds.push(status);
	}

	if (caixa === '__SEM_CAIXA__') {
		where.push('b.caixa_id IS NULL');
	} else if (caixa) {
		where.push('b.caixa_id = ?');
		binds.push(Number(caixa));
	}

	if (procedimento) {
		where.push('b.procedimento_id = ?');
		binds.push(Number(procedimento));
	}

	const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

	const { results: bens } = await db
		.prepare(
			`SELECT b.id, b.categoria, b.descricao_original, b.identificador_unico,
			        b.qtd_total, b.qtd_disponivel, b.unidade, b.status, b.caixa_id,
			        p.tipo AS proc_tipo, p.numero_normalizado AS proc_numero, p.operacao,
			        c.nome AS caixa_nome
			 FROM bens b
			 JOIN procedimentos p ON p.id = b.procedimento_id
			 LEFT JOIN caixas c ON c.id = b.caixa_id
			 ${whereSql}
			 ORDER BY c.nome ASC, p.numero_normalizado ASC, b.id ASC`
		)
		.bind(...binds)
		.all<BemLista>();

	return json({ bens });
};
