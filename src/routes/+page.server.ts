import type { PageServerLoad } from './$types';
import type { StatusBem } from '$lib/types';
import { ensureSchema } from '$lib/server/db';

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

export const load: PageServerLoad = async ({ url, platform }) => {
	const db = platform?.env?.DB;
	if (!db) {
		return {
			bens: [] as BemLista[],
			caixas: [] as Array<{ id: number; nome: string }>,
			contadores: { total: 0, emDeposito: 0, restituidos: 0 },
			filtros: { q: '', status: '', caixa: '' }
		};
	}

	await ensureSchema(db);

	const q = url.searchParams.get('q')?.trim() ?? '';
	const status = url.searchParams.get('status')?.trim() ?? '';
	const caixa = url.searchParams.get('caixa')?.trim() ?? '';

	const where: string[] = [];
	const binds: unknown[] = [];

	if (q) {
		where.push(
			`(p.numero_normalizado LIKE ? OR b.descricao_original LIKE ? OR b.identificador_unico LIKE ? OR p.operacao LIKE ?)`
		);
		const termo = `%${q}%`;
		binds.push(termo, termo, termo, termo);
	}

	if (status) {
		where.push('b.status = ?');
		binds.push(status);
	}

	if (caixa) {
		where.push('b.caixa_id = ?');
		binds.push(Number(caixa));
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

	const { results: caixas } = await db
		.prepare('SELECT id, nome FROM caixas ORDER BY nome ASC')
		.all<{ id: number; nome: string }>();

	const stats = await db
		.prepare(
			`SELECT
			   COUNT(*) AS total,
			   SUM(CASE WHEN status IN ('EM_DEPOSITO', 'RESTITUIDO_PARCIAL') THEN 1 ELSE 0 END) AS emDeposito,
			   SUM(CASE WHEN status = 'RESTITUIDO' THEN 1 ELSE 0 END) AS restituidos
			 FROM bens`
		)
		.first<{ total: number; emDeposito: number | null; restituidos: number | null }>();

	return {
		bens,
		caixas,
		contadores: {
			total: stats?.total ?? 0,
			emDeposito: stats?.emDeposito ?? 0,
			restituidos: stats?.restituidos ?? 0
		},
		filtros: { q, status, caixa }
	};
};
