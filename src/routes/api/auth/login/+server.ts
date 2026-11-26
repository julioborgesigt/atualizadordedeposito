import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ensureSchema } from '$lib/server/db';
import { criarSessao, definirCookieSessao, verificarSenha } from '$lib/server/auth';
import type { RoleUnidade } from '../../../../app.d.ts';

export const POST: RequestHandler = async ({ request, platform, cookies, url }) => {
	const db = platform?.env?.DB;
	if (!db) throw error(500, 'Binding DB (Cloudflare D1) não configurado.');
	await ensureSchema(db, platform.env.ADMIN_INITIAL_PASSWORD);

	const body = (await request.json().catch(() => ({}))) as {
		email?: string;
		senha?: string;
	};

	const email = body.email?.trim().toLowerCase() ?? '';
	const senha = body.senha ?? '';

	if (!email || !senha) {
		throw error(400, 'Informe o e-mail e a senha.');
	}

	const unidade = await db
		.prepare(
			`SELECT id, nome, email, senha_hash, role, deve_trocar_senha, ativo
			 FROM unidades
			 WHERE LOWER(email) = ?`
		)
		.bind(email)
		.first<{
			id: number;
			nome: string;
			email: string;
			senha_hash: string;
			role: RoleUnidade;
			deve_trocar_senha: number;
			ativo: number;
		}>();

	if (!unidade) {
		throw error(401, 'E-mail ou senha inválidos.');
	}

	if (unidade.ativo !== 1) {
		throw error(403, 'Esta unidade está desativada. Contate o administrador.');
	}

	const senhaValida = await verificarSenha(senha, unidade.senha_hash);
	if (!senhaValida) {
		throw error(401, 'E-mail ou senha inválidos.');
	}

	const token = await criarSessao(db, unidade.id);
	definirCookieSessao(cookies, token, url.protocol === 'https:');

	return json({
		ok: true,
		deveTrocarSenha: unidade.deve_trocar_senha === 1,
		unidade: {
			id: unidade.id,
			nome: unidade.nome,
			email: unidade.email,
			role: unidade.role
		}
	});
};
