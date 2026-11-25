import type { PageServerLoad } from './$types';
import { ensureSchema } from '$lib/server/db';

export interface CaixaResumo {
	id: number;
	nome: string;
	setor: string | null;
	total_bens: number;
}

export const load: PageServerLoad = async ({ platform }) => {
	const db = platform?.env?.DB;
	if (!db) {
		return { caixas: [] as CaixaResumo[] };
	}

	await ensureSchema(db);

	const { results: caixas } = await db
		.prepare(
			`SELECT c.id, c.nome, c.setor, COUNT(b.id) AS total_bens
			 FROM caixas c
			 LEFT JOIN bens b ON b.caixa_id = c.id
			 GROUP BY c.id
			 ORDER BY c.nome ASC`
		)
		.all<CaixaResumo>();

	return { caixas };
};
