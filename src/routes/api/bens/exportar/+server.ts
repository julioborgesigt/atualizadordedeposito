import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ensureSchema } from '$lib/server/db';
import { exigirUnidade } from '$lib/server/auth';
import { construirFiltroBusca } from '$lib/server/busca';
import type { BemLista } from '../../../+page.server';

export const GET: RequestHandler = async ({ url, platform, locals }) => {
	const db = platform?.env?.DB;
	if (!db) throw error(500, 'Binding DB não configurado.');
	await ensureSchema(db, platform.env.ADMIN_INITIAL_PASSWORD);
	const unidade = exigirUnidade(locals);

	const q = url.searchParams.get('q')?.trim() ?? '';
	const status = url.searchParams.get('status')?.trim() ?? '';
	const caixa = url.searchParams.get('caixa')?.trim() ?? '';
	const procedimento = url.searchParams.get('procedimento')?.trim() ?? '';
	const unidadeFiltro = url.searchParams.get('unidade')?.trim() ?? '';

	const where: string[] = [];
	const binds: unknown[] = [];

	if (unidade.role !== 'ADMIN') {
		where.push('b.unidade_id = ?');
		binds.push(unidade.id);
	} else if (unidadeFiltro !== 'todas') {
		const idAlvo = unidadeFiltro ? Number(unidadeFiltro) : unidade.id;
		if (Number.isInteger(idAlvo) && idAlvo > 0) {
			where.push('b.unidade_id = ?');
			binds.push(idAlvo);
		}
	}

	if (q) {
		const filtroBusca = construirFiltroBusca(q);
		if (filtroBusca) {
			where.push(filtroBusca.sql);
			binds.push(...filtroBusca.binds);
		}
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
			        b.qtd_total, b.qtd_disponivel, b.unidade, b.status, b.caixa_id, b.observacoes,
			        p.tipo AS proc_tipo, p.numero_normalizado AS proc_numero, p.operacao,
			        c.nome AS caixa_nome, u.nome AS unidade_nome
			 FROM bens b
			 JOIN procedimentos p ON p.id = b.procedimento_id
			 LEFT JOIN caixas c ON c.id = b.caixa_id
			 LEFT JOIN unidades u ON u.id = b.unidade_id
			 ${whereSql}
			 ORDER BY c.nome ASC, p.numero_normalizado ASC, b.id ASC`
		)
		.bind(...binds)
		.all<BemLista>();

	return json({ bens });
};
