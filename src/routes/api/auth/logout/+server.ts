import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { encerrarSessao, limparCookieSessao, SESSION_COOKIE_NAME } from '$lib/server/auth';

export const POST: RequestHandler = async ({ platform, cookies }) => {
	const db = platform?.env?.DB;
	const token = cookies.get(SESSION_COOKIE_NAME);

	if (db && token) {
		await encerrarSessao(db, token).catch(() => {});
	}

	limparCookieSessao(cookies);
	return json({ ok: true });
};
