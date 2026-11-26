import { describe, it, expect } from 'vitest';
import { hashSenha, verificarSenha, gerarTokenSessao, hashToken } from './auth';

describe('autenticação e hashing PBKDF2', () => {
	it('gera hash seguro com salt único e valida senha correta', async () => {
		const h1 = await hashSenha('SenhaForte@2026');
		const h2 = await hashSenha('SenhaForte@2026');

		expect(h1).toMatch(/^pbkdf2_sha256\$100000\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
		expect(h1).not.toBe(h2);

		expect(await verificarSenha('SenhaForte@2026', h1)).toBe(true);
		expect(await verificarSenha('SenhaForte@2026', h2)).toBe(true);
		expect(await verificarSenha('SenhaErrada', h1)).toBe(false);
		expect(await verificarSenha('SenhaForte@2026', 'formato-invalido')).toBe(false);
	});

	it('gera tokens de sessão únicos e hash SHA-256 determinístico', async () => {
		const t1 = gerarTokenSessao();
		const t2 = gerarTokenSessao();

		expect(t1).toMatch(/^[0-9a-f]{64}$/);
		expect(t1).not.toBe(t2);

		const hashA = await hashToken(t1);
		const hashB = await hashToken(t1);
		expect(hashA).toBe(hashB);
		expect(hashA).toMatch(/^[0-9a-f]{64}$/);
	});
});
