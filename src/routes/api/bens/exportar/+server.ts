import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ensureSchema } from '$lib/server/db';
import { exigirUnidade } from '$lib/server/auth';
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
		const qLimpo = q.trim();
		const termo = `%${qLimpo}%`;
		const ehIpOuInquerito = /^(IP|INQU[EÉ]RITO(\s+POLICIAL)?)$/i.test(qLimpo);
		const ehBo = /^(BO|BOLETIM(\s+DE\s+OCORR[EÊ]NCIA)?)$/i.test(qLimpo);
		const ehTco = /^(TCO|TERMO\s+CIRCUNSTANCIADO)$/i.test(qLimpo);
		const ehBocOuAi = /^(BOC|ATO\s+INFRACIONAL|AI)$/i.test(qLimpo);

		let condTipoExtra = '';
		if (ehIpOuInquerito) {
			condTipoExtra = ` OR p.tipo IN ('IP', 'INQUÉRITO', 'INQUERITO')`;
		} else if (ehBo) {
			condTipoExtra = ` OR p.tipo IN ('BO')`;
		} else if (ehTco) {
			condTipoExtra = ` OR p.tipo IN ('TCO')`;
		} else if (ehBocOuAi) {
			condTipoExtra = ` OR p.tipo IN ('BOC', 'ATO INFRACIONAL')`;
		}

		where.push(
			`(p.numero_normalizado LIKE ? OR p.tipo LIKE ? OR b.descricao_original LIKE ? OR b.identificador_unico LIKE ? OR p.operacao LIKE ? OR c.nome LIKE ?${condTipoExtra})`
		);
		binds.push(termo, termo, termo, termo, termo, termo);
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
