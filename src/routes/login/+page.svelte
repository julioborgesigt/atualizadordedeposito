<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';

	let email = $state('');
	let senha = $state('');
	let mostrarSenha = $state(false);
	let carregando = $state(false);
	let erro = $state<string | null>(null);

	async function entrar(e: SubmitEvent) {
		e.preventDefault();
		if (carregando) return;
		erro = null;
		carregando = true;

		try {
			const res = await fetch('/api/auth/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email: email.trim(), senha })
			});

			const data = (await res.json().catch(() => ({}))) as {
				ok?: boolean;
				deveTrocarSenha?: boolean;
				message?: string;
			};

			if (!res.ok) {
				throw new Error(data.message || 'Falha ao realizar login.');
			}

			await invalidateAll();
			if (data.deveTrocarSenha) {
				await goto('/trocar-senha');
			} else {
				await goto('/');
			}
		} catch (err: unknown) {
			erro = err instanceof Error ? err.message : 'Erro ao autenticar.';
		} finally {
			carregando = false;
		}
	}
</script>

<svelte:head>
	<title>Acesso Restrito — Custódia PCCE</title>
</svelte:head>

<div class="auth-wrap">
	<section class="auth-card panel">
		<div class="auth-brand">
			<span class="auth-mark" aria-hidden="true">
				<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
					<path d="m9 12 2 2 4-4" />
				</svg>
			</span>
			<h1>Custódia PCCE</h1>
			<p>Sistema de Controle de Apreensões e Restituições</p>
		</div>

		{#if erro}
			<div class="alert error" role="alert">{erro}</div>
		{/if}

		<form class="auth-form" onsubmit={entrar}>
			<div class="field">
				<label for="login-email">E-mail da unidade</label>
				<input
					id="login-email"
					type="email"
					bind:value={email}
					placeholder="unidade@pc.ce.gov.br"
					autocomplete="username"
					required
					disabled={carregando}
				/>
			</div>

			<div class="field">
				<label for="login-senha">Senha</label>
				<div class="pass-wrap">
					<input
						id="login-senha"
						type={mostrarSenha ? 'text' : 'password'}
						bind:value={senha}
						placeholder="Digite sua senha"
						autocomplete="current-password"
						required
						disabled={carregando}
					/>
					<button
						type="button"
						class="pass-toggle"
						onclick={() => (mostrarSenha = !mostrarSenha)}
						aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
					>
						{mostrarSenha ? 'Ocultar' : 'Mostrar'}
					</button>
				</div>
			</div>

			<button type="submit" class="btn btn-primary btn-submit" disabled={carregando}>
				{carregando ? 'Verificando credenciais...' : 'Entrar no sistema'}
			</button>
		</form>

		<p class="auth-foot">
			Acesso exclusivo para delegacias cadastradas. Caso tenha esquecido sua senha, solicite o reset à <strong>4ª Seccional</strong>.
		</p>
	</section>
</div>

<style>
	.auth-wrap {
		min-height: calc(100dvh - 4rem);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1.5rem 0.5rem;
	}

	.auth-card {
		width: 100%;
		max-width: 420px;
		padding: 2rem 1.75rem;
		box-shadow: var(--shadow);
	}

	.auth-brand {
		text-align: center;
		margin-bottom: 1.5rem;
	}

	.auth-mark {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 52px;
		height: 52px;
		border-radius: 14px;
		background: linear-gradient(135deg, hsl(221 82% 54%), hsl(221 76% 40%));
		color: #fff;
		box-shadow: 0 6px 18px hsl(221 76% 48% / 0.35);
		margin-bottom: 0.85rem;
	}

	.auth-brand h1 {
		margin: 0;
		font-size: 1.35rem;
		font-weight: 800;
	}

	.auth-brand p {
		margin: 0.25rem 0 0;
		font-size: 0.84rem;
		color: var(--text-2);
	}

	.auth-form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		margin-top: 1rem;
	}

	.field label {
		display: block;
		font-size: 0.82rem;
		font-weight: 600;
		margin-bottom: 0.35rem;
		color: var(--text);
	}

	.field input {
		width: 100%;
	}

	.pass-wrap {
		position: relative;
		display: flex;
		align-items: center;
	}

	.pass-wrap input {
		padding-right: 4.5rem;
	}

	.pass-toggle {
		position: absolute;
		right: 0.45rem;
		border: none;
		background: transparent;
		color: var(--primary);
		font-size: 0.76rem;
		font-weight: 600;
		padding: 0.3rem 0.45rem;
		border-radius: var(--radius-sm);
		cursor: pointer;
	}

	.pass-toggle:hover {
		background: var(--primary-soft);
	}

	.btn-submit {
		width: 100%;
		min-height: 44px;
		margin-top: 0.35rem;
		font-size: 0.94rem;
	}

	.auth-foot {
		margin: 1.35rem 0 0;
		padding-top: 1rem;
		border-top: 1px solid var(--border);
		font-size: 0.78rem;
		color: var(--text-3);
		text-align: center;
		line-height: 1.45;
	}
</style>
