import { json, redirect, type Handle, type HandleServerError } from '@sveltejs/kit';
import { ensureSchema } from '$lib/server/db';
import {
	limparCookieSessao,
	obterUnidadePorToken,
	SESSION_COOKIE_NAME
} from '$lib/server/auth';

const ROTAS_PUBLICAS = ['/login', '/api/auth/login', '/api/auth/logout'];
const ROTAS_TROCA_SENHA = ['/trocar-senha', '/api/auth/trocar-senha', '/api/auth/logout'];

function correspondeRota(pathname: string, lista: string[]): boolean {
	return lista.some((r) => pathname === r || pathname.startsWith(`${r}/`));
}

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.unidade = null;

	const db = event.platform?.env?.DB;
	const { pathname } = event.url;

	if (db) {
		await ensureSchema(db, event.platform?.env?.ADMIN_INITIAL_PASSWORD);

		const token = event.cookies.get(SESSION_COOKIE_NAME);
		if (token) {
			const unidade = await obterUnidadePorToken(db, token);
			if (unidade) {
				event.locals.unidade = unidade;
			} else {
				limparCookieSessao(event.cookies);
			}
		}
	}

	const ehApi = pathname.startsWith('/api/');
	const ehPublica = correspondeRota(pathname, ROTAS_PUBLICAS);
	const ehTrocaSenha = correspondeRota(pathname, ROTAS_TROCA_SENHA);

	if (!event.locals.unidade) {
		if (!ehPublica) {
			if (ehApi) {
				return json({ message: 'Autenticação obrigatória.' }, { status: 401 });
			}
			throw redirect(303, '/login');
		}
		return resolve(event);
	}

	// Autenticado, mas precisa trocar a senha padrão no primeiro acesso / após reset
	if (event.locals.unidade.deve_trocar_senha) {
		if (!ehTrocaSenha) {
			if (ehApi) {
				return json(
					{ message: 'Troca de senha obrigatória antes de continuar.' },
					{ status: 403 }
				);
			}
			throw redirect(303, '/trocar-senha');
		}
		return resolve(event);
	}

	// Já autenticado tentando acessar /login
	if (pathname === '/login') {
		throw redirect(303, '/');
	}

	// Rotas exclusivas de administrador
	if (
		(pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) &&
		event.locals.unidade.role !== 'ADMIN'
	) {
		if (ehApi) {
			return json({ message: 'Acesso restrito ao administrador.' }, { status: 403 });
		}
		throw redirect(303, '/');
	}

	return resolve(event);
};

export const handleError: HandleServerError = ({ error, event }) => {
	console.error('SERVER ERROR on', event.url.pathname, error);
	const err = error as Error;
	return {
		message: err?.message || 'Erro interno do servidor.'
	};
};
