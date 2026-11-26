import type { PageServerLoad } from './$types';
import { ensureSchema } from '$lib/server/db';

export interface CaixaResumo {
	id: number;
	nome: string;
	setor: string | null;
	total_bens: number;
}

export const load: PageServerLoad = async ({ platform, locals }) => {
	const db = platform?.env?.DB;
	const unidade = locals.unidade;
	if (!db || !unidade) {
		return { caixas: [] as CaixaResumo[] };
	}

	await ensureSchema(db, platform.env.ADMIN_INITIAL_PASSWORD);

	// Sempre carrega apenas as caixas da própria unidade (inclusive para o admin)
	const { results: caixas } = await db
		.prepare(
			`SELECT c.id, c.nome, c.setor, COUNT(b.id) AS total_bens
			 FROM caixas c
			 LEFT JOIN bens b ON b.caixa_id = c.id
			 WHERE c.unidade_id = ?
			 GROUP BY c.id
			 ORDER BY c.nome ASC`
		)
		.bind(unidade.id)
		.all<CaixaResumo>();

	return { caixas };
};
