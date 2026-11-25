import type { PageServerLoad } from './$types';
import type { StatusBem } from '$lib/types';
import { ensureSchema, limparResquiciosOrfaos } from '$lib/server/db';

export interface BemLista {
	id: number;
	categoria: string;
	descricao_original: string;
	identificador_unico: string | null;
	qtd_total: number;
	qtd_disponivel: number;
	unidade: string;
	status: StatusBem;
	caixa_id: number | null;
	proc_tipo: string;
	proc_numero: string;
	operacao: string | null;
	caixa_nome: string | null;
}

export interface CaixaDashboard {
	id: number;
	nome: string;
	setor: string | null;
	total_bens: number;
	em_deposito: number;
}

export interface ApreensaoDashboard {
	id: number;
	doc_tipo: string;
	nome_arquivo: string;
	data_ato: string | null;
	parte_nome: string | null;
	proc_tipo: string;
	proc_numero: string;
	operacao: string | null;
	qtd_bens: number;
	caixas_nomes: string | null;
}

export interface ProcedimentoDashboard {
	id: number;
	tipo: string;
	numero_normalizado: string;
	operacao: string | null;
	total_bens: number;
}

export const load: PageServerLoad = async ({ url, platform }) => {
	const db = platform?.env?.DB;
	if (!db) {
		return {
			bens: [] as BemLista[],
			caixas: [] as CaixaDashboard[],
			procedimentos: [] as ProcedimentoDashboard[],
			apreensoes: [] as ApreensaoDashboard[],
			contadores: { total: 0, emDeposito: 0, restituidos: 0, semCaixa: 0 },
			filtros: { q: '', status: '', caixa: '', procedimento: '' }
		};
	}

	await ensureSchema(db);
	await limparResquiciosOrfaos(db);

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
			 ORDER BY b.atualizado_em DESC, b.id DESC
			 LIMIT 300`
		)
		.bind(...binds)
		.all<BemLista>();

	const { results: caixasRaw } = await db
		.prepare(
			`SELECT c.id, c.nome, c.setor,
			        COUNT(b.id) AS total_bens,
			        SUM(CASE WHEN b.status IN ('EM_DEPOSITO', 'RESTITUIDO_PARCIAL') THEN 1 ELSE 0 END) AS em_deposito
			 FROM caixas c
			 LEFT JOIN bens b ON b.caixa_id = c.id
			 GROUP BY c.id
			 ORDER BY c.nome ASC`
		)
		.all<{
			id: number;
			nome: string;
			setor: string | null;
			total_bens: number;
			em_deposito: number | null;
		}>();

	const caixas: CaixaDashboard[] = caixasRaw.map((c) => ({
		id: c.id,
		nome: c.nome,
		setor: c.setor,
		total_bens: c.total_bens ?? 0,
		em_deposito: c.em_deposito ?? 0
	}));

	const { results: procedimentos } = await db
		.prepare(
			`SELECT p.id, p.tipo, p.numero_normalizado, p.operacao,
			        COUNT(b.id) AS total_bens
			 FROM procedimentos p
			 JOIN bens b ON b.procedimento_id = p.id
			 GROUP BY p.id
			 ORDER BY p.numero_normalizado ASC`
		)
		.all<ProcedimentoDashboard>();

	const stats = await db
		.prepare(
			`SELECT
			   COUNT(*) AS total,
			   SUM(CASE WHEN status IN ('EM_DEPOSITO', 'RESTITUIDO_PARCIAL') THEN 1 ELSE 0 END) AS emDeposito,
			   SUM(CASE WHEN status = 'RESTITUIDO' THEN 1 ELSE 0 END) AS restituidos,
			   SUM(CASE WHEN caixa_id IS NULL THEN 1 ELSE 0 END) AS semCaixa
			 FROM bens`
		)
		.first<{
			total: number;
			emDeposito: number | null;
			restituidos: number | null;
			semCaixa: number | null;
		}>();

	return {
		bens,
		caixas,
		procedimentos,
		contadores: {
			total: stats?.total ?? 0,
			emDeposito: stats?.emDeposito ?? 0,
			restituidos: stats?.restituidos ?? 0,
			semCaixa: stats?.semCaixa ?? 0
		},
		filtros: { q, status, caixa, procedimento }
	};
};
