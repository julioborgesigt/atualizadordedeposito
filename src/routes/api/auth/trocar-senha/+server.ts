import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ensureSchema } from '$lib/server/db';
import { exigirUnidade, hashSenha, verificarSenha } from '$lib/server/auth';

export const POST: RequestHandler = async ({ request, platform, locals }) => {
	const db = platform?.env?.DB;
	if (!db) throw error(500, 'Binding DB (Cloudflare D1) não configurado.');
	await ensureSchema(db, platform.env.ADMIN_INITIAL_PASSWORD);

	const unidade = exigirUnidade(locals);

	const body = (await request.json().catch(() => ({}))) as {
		senhaAtual?: string;
		novaSenha?: string;
		confirmarSenha?: string;
	};

	const novaSenha = body.novaSenha ?? '';
	const confirmarSenha = body.confirmarSenha ?? '';

	if (novaSenha.length < 6) {
		throw error(400, 'A nova senha deve ter no mínimo 6 caracteres.');
	}

	if (novaSenha !== confirmarSenha) {
		throw error(400, 'A confirmação da nova senha não confere.');
	}

	const atual = await db
		.prepare('SELECT senha_hash FROM unidades WHERE id = ?')
		.bind(unidade.id)
		.first<{ senha_hash: string }>();

	if (!atual) {
		throw error(404, 'Unidade não encontrada.');
	}

	// Se não é troca obrigatória de primeiro login, exige verificação da senha atual
	if (!unidade.deve_trocar_senha) {
		const senhaAtual = body.senhaAtual ?? '';
		if (!senhaAtual) {
			throw error(400, 'Informe sua senha atual.');
		}
		const okAtual = await verificarSenha(senhaAtual, atual.senha_hash);
		if (!okAtual) {
			throw error(401, 'A senha atual informada está incorreta.');
		}
	}

	const igualAnterior = await verificarSenha(novaSenha, atual.senha_hash);
	if (igualAnterior) {
		throw error(400, 'A nova senha deve ser diferente da senha anterior.');
	}

	const novoHash = await hashSenha(novaSenha);
	await db
		.prepare(
			`UPDATE unidades
			 SET senha_hash = ?, deve_trocar_senha = 0, atualizado_em = datetime('now')
			 WHERE id = ?`
		)
		.bind(novoHash, unidade.id)
		.run();

	return json({ ok: true });
};
