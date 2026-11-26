import { error, type Cookies } from '@sveltejs/kit';
import type { RoleUnidade, UnidadeAutenticada } from '../../app.d.ts';

export const SESSION_COOKIE_NAME = 'custodia_session';
export const ADMIN_DEFAULT_EMAIL = '4sis@pc.ce.gov.br';
export const ADMIN_DEFAULT_NAME = '4ª Seccional';
export const ADMIN_FALLBACK_PASSWORD = 'Pcce@4sis2026';

const PBKDF2_ITERATIONS = 100_000;
const SESSION_DURATION_DAYS = 7;

function bytesToHex(bytes: Uint8Array): string {
	return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
	const bytes = new Uint8Array(hex.length / 2);
	for (let i = 0; i < bytes.length; i++) {
		bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	}
	return bytes;
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) {
		diff |= a[i] ^ b[i];
	}
	return diff === 0;
}

export async function hashSenha(senha: string): Promise<string> {
	const salt = new Uint8Array(16);
	crypto.getRandomValues(salt);

	const keyMaterial = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(senha),
		'PBKDF2',
		false,
		['deriveBits']
	);

	const derivedBits = await crypto.subtle.deriveBits(
		{
			name: 'PBKDF2',
			salt: salt as BufferSource,
			iterations: PBKDF2_ITERATIONS,
			hash: 'SHA-256'
		},
		keyMaterial,
		256
	);

	return `pbkdf2_sha256$${PBKDF2_ITERATIONS}$${bytesToHex(salt)}$${bytesToHex(new Uint8Array(derivedBits))}`;
}

export async function verificarSenha(senha: string, hashArmazenado: string): Promise<boolean> {
	const partes = hashArmazenado.split('$');
	if (partes.length !== 4 || partes[0] !== 'pbkdf2_sha256') return false;

	const iterations = Number(partes[1]);
	if (!Number.isInteger(iterations) || iterations <= 0) return false;

	const salt = hexToBytes(partes[2]);
	const expected = hexToBytes(partes[3]);

	const keyMaterial = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(senha),
		'PBKDF2',
		false,
		['deriveBits']
	);

	const derivedBits = await crypto.subtle.deriveBits(
		{
			name: 'PBKDF2',
			salt: salt as BufferSource,
			iterations,
			hash: 'SHA-256'
		},
		keyMaterial,
		expected.length * 8
	);

	return constantTimeEqual(new Uint8Array(derivedBits), expected);
}

export function gerarTokenSessao(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	return bytesToHex(bytes);
}

export async function hashToken(token: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
	return bytesToHex(new Uint8Array(digest));
}

export async function criarSessao(db: D1Database, unidadeId: number): Promise<string> {
	const token = gerarTokenSessao();
	const tokenHash = await hashToken(token);

	await db
		.prepare(
			`INSERT INTO sessoes (token_hash, unidade_id, expira_em)
			 VALUES (?, ?, datetime('now', '+${SESSION_DURATION_DAYS} days'))`
		)
		.bind(tokenHash, unidadeId)
		.run();

	// Limpeza oportunista de sessões expiradas
	await db.prepare(`DELETE FROM sessoes WHERE expira_em <= datetime('now')`).run().catch(() => {});

	return token;
}

export async function obterUnidadePorToken(
	db: D1Database,
	token: string
): Promise<UnidadeAutenticada | null> {
	const tokenHash = await hashToken(token);

	const row = await db
		.prepare(
			`SELECT u.id, u.nome, u.email, u.role, u.deve_trocar_senha
			 FROM sessoes s
			 JOIN unidades u ON u.id = s.unidade_id
			 WHERE s.token_hash = ?
			   AND s.expira_em > datetime('now')
			   AND u.ativo = 1`
		)
		.bind(tokenHash)
		.first<{
			id: number;
			nome: string;
			email: string;
			role: RoleUnidade;
			deve_trocar_senha: number;
		}>();

	if (!row) return null;

	return {
		id: row.id,
		nome: row.nome,
		email: row.email,
		role: row.role,
		deve_trocar_senha: row.deve_trocar_senha === 1
	};
}

export async function encerrarSessao(db: D1Database, token: string): Promise<void> {
	const tokenHash = await hashToken(token);
	await db.prepare('DELETE FROM sessoes WHERE token_hash = ?').bind(tokenHash).run();
}

export async function encerrarTodasSessoesUnidade(db: D1Database, unidadeId: number): Promise<void> {
	await db.prepare('DELETE FROM sessoes WHERE unidade_id = ?').bind(unidadeId).run();
}

export function definirCookieSessao(cookies: Cookies, token: string, isSecure: boolean): void {
	cookies.set(SESSION_COOKIE_NAME, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: isSecure,
		maxAge: SESSION_DURATION_DAYS * 24 * 60 * 60
	});
}

export function limparCookieSessao(cookies: Cookies): void {
	cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
}

export function exigirUnidade(locals: App.Locals): UnidadeAutenticada {
	if (!locals.unidade) {
		throw error(401, 'Não autenticado.');
	}
	return locals.unidade;
}

export function exigirAdmin(locals: App.Locals): UnidadeAutenticada {
	const u = exigirUnidade(locals);
	if (u.role !== 'ADMIN') {
		throw error(403, 'Acesso restrito ao administrador.');
	}
	return u;
}
