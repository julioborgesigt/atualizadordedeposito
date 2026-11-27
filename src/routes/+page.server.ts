import type { PageServerLoad } from './$types';
import type { StatusBem } from '$lib/types';
import { ensureSchema, limparResquiciosOrfaos } from '$lib/server/db';
import { construirFiltroBusca } from '$lib/server/busca';

export type PorPaginaOpcao = '10' | '20' | '50' | '100' | 'todos';

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
	unidade_nome?: string | null;
}

export interface CaixaDashboard {
	id: number;
	nome: string;
	setor: string | null;
	total_bens: number;
	em_deposito: number;
	unidade_nome?: string | null;
}

export interface ProcedimentoDashboard {
	id: number;
	tipo: string;
	numero_normalizado: string;
	operacao: string | null;
	total_bens: number;
	unidade_nome?: string | null;
}

export interface UnidadeFiltroItem {
	id: number;
	nome: string;
	total_bens: number;
}

export interface PaginacaoDashboard {
	paginaAtual: number;
	porPagina: number;
	porPaginaOpcao: PorPaginaOpcao;
	totalItens: number;
	totalProcedimentos: number;
	totalPaginas: number;
}

export const load: PageServerLoad = async ({ url, platform, locals }) => {
	const db = platform?.env?.DB;
	const unidadeAtual = locals.unidade;
	if (!db || !unidadeAtual) {
		return {
			bens: [] as BemLista[],
			caixas: [] as CaixaDashboard[],
			procedimentos: [] as ProcedimentoDashboard[],
			unidades: [] as UnidadeFiltroItem[],
			contadores: { total: 0, emDeposito: 0, restituidos: 0, semCaixa: 0 },
			filtros: { q: '', status: '', caixa: '', procedimento: '', unidade: '' },
			paginacao: {
				paginaAtual: 1,
				porPagina: 10,
				porPaginaOpcao: '10' as PorPaginaOpcao,
				totalItens: 0,
				totalProcedimentos: 0,
				totalPaginas: 1
			}
		};
	}

	await ensureSchema(db, platform.env.ADMIN_INITIAL_PASSWORD);
	await limparResquiciosOrfaos(db);

	const ehAdmin = unidadeAtual.role === 'ADMIN';

	const q = url.searchParams.get('q')?.trim() ?? '';
	const status = url.searchParams.get('status')?.trim() ?? '';
	const caixa = url.searchParams.get('caixa')?.trim() ?? '';
	const procedimento = url.searchParams.get('procedimento')?.trim() ?? '';
	const unidadeParamBruto = url.searchParams.get('unidade')?.trim();
	const unidadeFiltro = ehAdmin
		? unidadeParamBruto !== undefined && unidadeParamBruto !== ''
			? unidadeParamBruto
			: String(unidadeAtual.id)
		: '';
	const paginaParam = Number(url.searchParams.get('pagina') ?? '1');
	const porPaginaParam = url.searchParams.get('porPagina')?.trim().toLowerCase() ?? '10';

	let porPaginaOpcao: PorPaginaOpcao = '10';
	let porPagina = 10;

	if (porPaginaParam === 'todos') {
		porPaginaOpcao = 'todos';
		porPagina = 999999;
	} else if (['10', '20', '50', '100'].includes(porPaginaParam)) {
		porPaginaOpcao = porPaginaParam as PorPaginaOpcao;
		porPagina = Number(porPaginaParam);
	}

	const unidadeEscopoId: number | null = !ehAdmin
		? unidadeAtual.id
		: unidadeFiltro === 'todas'
			? null
			: Number(unidadeFiltro);

	const where: string[] = [];
	const binds: unknown[] = [];

	if (unidadeEscopoId !== null && Number.isInteger(unidadeEscopoId)) {
		where.push('b.unidade_id = ?');
		binds.push(unidadeEscopoId);
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

	const rowCount = await db
		.prepare(
			`SELECT COUNT(DISTINCT p.id) AS total
			 FROM procedimentos p
			 JOIN bens b ON b.procedimento_id = p.id
			 LEFT JOIN caixas c ON c.id = b.caixa_id
			 ${whereSql}`
		)
		.bind(...binds)
		.first<{ total: number }>();

	const totalProcedimentos = rowCount?.total ?? 0;
	const totalPaginas = Math.max(1, Math.ceil(totalProcedimentos / porPagina));
	const paginaAtual = Math.min(
		Math.max(1, Number.isInteger(paginaParam) ? paginaParam : 1),
		totalPaginas
	);
	const offset = (paginaAtual - 1) * porPagina;

	let bens: BemLista[] = [];

	if (totalProcedimentos > 0) {
		const { results: procRows } = await db
			.prepare(
				`SELECT DISTINCT p.id, p.numero_normalizado
				 FROM procedimentos p
				 JOIN bens b ON b.procedimento_id = p.id
				 LEFT JOIN caixas c ON c.id = b.caixa_id
				 ${whereSql}
				 ORDER BY p.numero_normalizado ASC
				 LIMIT ? OFFSET ?`
			)
			.bind(...binds, porPagina, offset)
			.all<{ id: number; numero_normalizado: string }>();

		if (procRows && procRows.length > 0) {
			const procIds = procRows.map((r) => r.id);
			const placeholders = procIds.map(() => '?').join(',');

			const { results: bensResult } = await db
				.prepare(
					`SELECT b.id, b.categoria, b.descricao_original, b.identificador_unico,
					        b.qtd_total, b.qtd_disponivel, b.unidade, b.status, b.caixa_id,
					        p.tipo AS proc_tipo, p.numero_normalizado AS proc_numero, p.operacao,
					        c.nome AS caixa_nome, u.nome AS unidade_nome
					 FROM bens b
					 JOIN procedimentos p ON p.id = b.procedimento_id
					 LEFT JOIN caixas c ON c.id = b.caixa_id
					 LEFT JOIN unidades u ON u.id = b.unidade_id
					 WHERE b.procedimento_id IN (${placeholders})
					 ${where.length ? `AND (${where.join(' AND ')})` : ''}
					 ORDER BY p.numero_normalizado ASC, b.id ASC`
				)
				.bind(...procIds, ...binds)
				.all<BemLista>();

			bens = bensResult ?? [];
		}
	}

	const whereEscopoCaixas =
		unidadeEscopoId !== null && Number.isInteger(unidadeEscopoId) ? 'WHERE c.unidade_id = ?' : '';
	const bindsEscopo =
		unidadeEscopoId !== null && Number.isInteger(unidadeEscopoId) ? [unidadeEscopoId] : [];

	const { results: caixasRaw } = await db
		.prepare(
			`SELECT c.id, c.nome, c.setor, u.nome AS unidade_nome,
			        COUNT(b.id) AS total_bens,
			        SUM(CASE WHEN b.status IN ('EM_DEPOSITO', 'DEPOSITO_DP_IGT', 'EM_EXTRACAO', 'RESTITUIDO_PARCIAL') THEN 1 ELSE 0 END) AS em_deposito
			 FROM caixas c
			 LEFT JOIN unidades u ON u.id = c.unidade_id
			 LEFT JOIN bens b ON b.caixa_id = c.id
			 ${whereEscopoCaixas}
			 GROUP BY c.id
			 ORDER BY c.nome ASC`
		)
		.bind(...bindsEscopo)
		.all<{
			id: number;
			nome: string;
			setor: string | null;
			unidade_nome: string | null;
			total_bens: number;
			em_deposito: number | null;
		}>();

	const caixas: CaixaDashboard[] = caixasRaw.map((c) => ({
		id: c.id,
		nome: c.nome,
		setor: c.setor,
		unidade_nome: c.unidade_nome ?? null,
		total_bens: c.total_bens ?? 0,
		em_deposito: c.em_deposito ?? 0
	}));

	const whereEscopoProc =
		unidadeEscopoId !== null && Number.isInteger(unidadeEscopoId) ? 'WHERE b.unidade_id = ?' : '';

	const { results: procedimentos } = await db
		.prepare(
			`SELECT p.id, p.tipo, p.numero_normalizado, p.operacao, u.nome AS unidade_nome,
			        COUNT(b.id) AS total_bens
			 FROM procedimentos p
			 JOIN bens b ON b.procedimento_id = p.id
			 LEFT JOIN unidades u ON u.id = p.unidade_id
			 ${whereEscopoProc}
			 GROUP BY p.id
			 ORDER BY p.numero_normalizado ASC`
		)
		.bind(...bindsEscopo)
		.all<ProcedimentoDashboard>();

	const whereEscopoBens =
		unidadeEscopoId !== null && Number.isInteger(unidadeEscopoId) ? 'WHERE unidade_id = ?' : '';

	const stats = await db
		.prepare(
			`SELECT
			   COUNT(*) AS total,
			   SUM(CASE WHEN status IN ('EM_DEPOSITO', 'DEPOSITO_DP_IGT', 'EM_EXTRACAO', 'RESTITUIDO_PARCIAL') THEN 1 ELSE 0 END) AS emDeposito,
			   SUM(CASE WHEN status = 'RESTITUIDO' THEN 1 ELSE 0 END) AS restituidos,
			   SUM(CASE WHEN caixa_id IS NULL THEN 1 ELSE 0 END) AS semCaixa
			 FROM bens
			 ${whereEscopoBens}`
		)
		.bind(...bindsEscopo)
		.first<{
			total: number;
			emDeposito: number | null;
			restituidos: number | null;
			semCaixa: number | null;
		}>();

	let unidades: UnidadeFiltroItem[] = [];
	if (ehAdmin) {
		const { results: unidadesRes } = await db
			.prepare(
				`SELECT u.id, u.nome, COUNT(b.id) AS total_bens
				 FROM unidades u
				 LEFT JOIN bens b ON b.unidade_id = u.id
				 GROUP BY u.id
				 ORDER BY CASE WHEN u.role = 'ADMIN' THEN 0 ELSE 1 END, u.nome ASC`
			)
			.all<UnidadeFiltroItem>();
		unidades = unidadesRes ?? [];
	}

	return {
		bens,
		caixas,
		procedimentos,
		unidades,
		contadores: {
			total: stats?.total ?? 0,
			emDeposito: stats?.emDeposito ?? 0,
			restituidos: stats?.restituidos ?? 0,
			semCaixa: stats?.semCaixa ?? 0
		},
		filtros: { q, status, caixa, procedimento, unidade: unidadeFiltro },
		paginacao: {
			paginaAtual,
			porPagina,
			porPaginaOpcao,
			totalItens: totalProcedimentos,
			totalProcedimentos,
			totalPaginas
		}
	};
};
