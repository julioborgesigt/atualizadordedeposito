import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ensureSchema } from '$lib/server/db';
import { exigirAdmin, hashSenha } from '$lib/server/auth';

export const GET: RequestHandler = async ({ platform, locals }) => {
	const db = platform?.env?.DB;
	if (!db) throw error(500, 'Binding DB (Cloudflare D1) não configurado.');
	await ensureSchema(db, platform.env.ADMIN_INITIAL_PASSWORD);
	exigirAdmin(locals);

	const { results } = await db
		.prepare(
			`SELECT u.id, u.nome, u.email, u.role, u.deve_trocar_senha, u.ativo, u.criado_em,
			        (SELECT COUNT(*) FROM caixas c WHERE c.unidade_id = u.id) AS total_caixas,
			        (SELECT COUNT(*) FROM bens b WHERE b.unidade_id = u.id) AS total_bens
			 FROM unidades u
			 ORDER BY CASE WHEN u.role = 'ADMIN' THEN 0 ELSE 1 END, u.nome ASC`
		)
		.all<{
			id: number;
			nome: string;
			email: string;
			role: 'ADMIN' | 'UNIDADE';
			deve_trocar_senha: number;
			ativo: number;
			criado_em: string;
			total_caixas: number;
			total_bens: number;
		}>();

	return json({ unidades: results ?? [] });
};

export const POST: RequestHandler = async ({ request, platform, locals }) => {
	const db = platform?.env?.DB;
	if (!db) throw error(500, 'Binding DB (Cloudflare D1) não configurado.');
	await ensureSchema(db, platform.env.ADMIN_INITIAL_PASSWORD);
	exigirAdmin(locals);

	const body = (await request.json().catch(() => ({}))) as {
		nome?: string;
		email?: string;
		senhaInicial?: string;
	};

	const nome = body.nome?.trim() ?? '';
	const email = body.email?.trim().toLowerCase() ?? '';
	const senhaInicial = body.senhaInicial ?? '';

	if (!nome) throw error(400, 'Informe o nome da unidade (delegacia).');
	if (!email || !email.includes('@')) throw error(400, 'Informe um e-mail válido para a unidade.');
	if (senhaInicial.length < 6) {
		throw error(400, 'A senha inicial deve ter no mínimo 6 caracteres.');
	}

	const existente = await db
		.prepare('SELECT id, nome, email FROM unidades WHERE LOWER(email) = ? OR LOWER(nome) = LOWER(?)')
		.bind(email, nome)
		.first<{ id: number; nome: string; email: string }>();

	if (existente) {
		if (existente.email.toLowerCase() === email) {
			throw error(409, `Já existe uma unidade cadastrada com o e-mail "${email}".`);
		}
		throw error(409, `Já existe uma unidade cadastrada com o nome "${nome}".`);
	}

	const senhaHash = await hashSenha(senhaInicial);
	const res = await db
		.prepare(
			`INSERT INTO unidades (nome, email, senha_hash, role, deve_trocar_senha, ativo)
			 VALUES (?, ?, ?, 'UNIDADE', 1, 1)`
		)
		.bind(nome, email, senhaHash)
		.run();

	return json(
		{
			ok: true,
			unidade: {
				id: Number(res.meta.last_row_id),
				nome,
				email,
				role: 'UNIDADE',
				deve_trocar_senha: 1,
				ativo: 1
			}
		},
		{ status: 201 }
	);
};
