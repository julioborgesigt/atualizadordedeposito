import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ensureSchema } from '$lib/server/db';
import { encerrarTodasSessoesUnidade, exigirAdmin, hashSenha } from '$lib/server/auth';

export const PATCH: RequestHandler = async ({ params, request, platform, locals }) => {
	const db = platform?.env?.DB;
	if (!db) throw error(500, 'Binding DB (Cloudflare D1) não configurado.');
	await ensureSchema(db, platform.env.ADMIN_INITIAL_PASSWORD);
	const admin = exigirAdmin(locals);

	const id = Number(params.id);
	if (!Number.isInteger(id) || id <= 0) throw error(400, 'ID de unidade inválido.');

	const alvo = await db
		.prepare('SELECT id, nome, email, role, ativo FROM unidades WHERE id = ?')
		.bind(id)
		.first<{ id: number; nome: string; email: string; role: 'ADMIN' | 'UNIDADE'; ativo: number }>();

	if (!alvo) throw error(404, 'Unidade não encontrada.');

	const body = (await request.json().catch(() => ({}))) as {
		acao?: 'RESETAR_SENHA' | 'ALTERAR_STATUS' | 'ATUALIZAR_DADOS';
		novaSenha?: string;
		ativo?: boolean;
		nome?: string;
		email?: string;
	};

	if (body.acao === 'RESETAR_SENHA') {
		const novaSenha = body.novaSenha ?? '';
		if (novaSenha.length < 6) {
			throw error(400, 'A nova senha provisória deve ter no mínimo 6 caracteres.');
		}
		const senhaHash = await hashSenha(novaSenha);
		await db
			.prepare(
				`UPDATE unidades
				 SET senha_hash = ?, deve_trocar_senha = 1, atualizado_em = datetime('now')
				 WHERE id = ?`
			)
			.bind(senhaHash, id)
			.run();

		// Encerra sessões ativas da unidade para forçar novo login com troca de senha
		if (id !== admin.id) {
			await encerrarTodasSessoesUnidade(db, id);
		}

		return json({
			ok: true,
			message: `Senha da unidade "${alvo.nome}" resetada com sucesso. Será exigida nova senha no próximo login.`
		});
	}

	if (body.acao === 'ALTERAR_STATUS') {
		if (id === admin.id) {
			throw error(400, 'Não é possível desativar a própria unidade administradora.');
		}
		const novoAtivo = body.ativo ? 1 : 0;
		await db
			.prepare(`UPDATE unidades SET ativo = ?, atualizado_em = datetime('now') WHERE id = ?`)
			.bind(novoAtivo, id)
			.run();

		if (novoAtivo === 0) {
			await encerrarTodasSessoesUnidade(db, id);
		}

		return json({ ok: true, ativo: novoAtivo === 1 });
	}

	if (body.acao === 'ATUALIZAR_DADOS') {
		const nome = body.nome?.trim() || alvo.nome;
		const email = body.email?.trim().toLowerCase() || alvo.email;
		if (!email.includes('@')) throw error(400, 'E-mail inválido.');

		const conflito = await db
			.prepare(
				`SELECT id FROM unidades
				 WHERE id != ? AND (LOWER(email) = ? OR LOWER(nome) = LOWER(?))`
			)
			.bind(id, email, nome)
			.first<{ id: number }>();

		if (conflito) {
			throw error(409, 'Já existe outra unidade com este nome ou e-mail.');
		}

		await db
			.prepare(
				`UPDATE unidades SET nome = ?, email = ?, atualizado_em = datetime('now') WHERE id = ?`
			)
			.bind(nome, email, id)
			.run();

		return json({ ok: true, nome, email });
	}

	throw error(400, 'Ação não reconhecida.');
};
