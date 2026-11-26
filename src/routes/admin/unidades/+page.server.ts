import type { PageServerLoad } from './$types';
import { ensureSchema } from '$lib/server/db';
import { exigirAdmin } from '$lib/server/auth';

export interface UnidadeAdminItem {
	id: number;
	nome: string;
	email: string;
	role: 'ADMIN' | 'UNIDADE';
	deve_trocar_senha: number;
	ativo: number;
	criado_em: string;
	total_caixas: number;
	total_bens: number;
}

export const load: PageServerLoad = async ({ platform, locals }) => {
	const db = platform?.env?.DB;
	exigirAdmin(locals);

	if (!db) {
		return { unidades: [] as UnidadeAdminItem[] };
	}

	await ensureSchema(db, platform.env.ADMIN_INITIAL_PASSWORD);

	const { results } = await db
		.prepare(
			`SELECT u.id, u.nome, u.email, u.role, u.deve_trocar_senha, u.ativo, u.criado_em,
			        (SELECT COUNT(*) FROM caixas c WHERE c.unidade_id = u.id) AS total_caixas,
			        (SELECT COUNT(*) FROM bens b WHERE b.unidade_id = u.id) AS total_bens
			 FROM unidades u
			 ORDER BY CASE WHEN u.role = 'ADMIN' THEN 0 ELSE 1 END, u.nome ASC`
		)
		.all<UnidadeAdminItem>();

	return {
		unidades: results ?? []
	};
};
