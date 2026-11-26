<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { tarefaStore } from '$lib/stores/tarefa.svelte';

	let { data } = $props();

	const obrigatoria = $derived(data.unidade?.deve_trocar_senha ?? true);

	let senhaAtual = $state('');
	let novaSenha = $state('');
	let confirmarSenha = $state('');
	let salvando = $state(false);
	let erro = $state<string | null>(null);

	async function salvarNovaSenha(e: SubmitEvent) {
		e.preventDefault();
		if (salvando) return;
		erro = null;

		if (novaSenha.length < 6) {
			erro = 'A nova senha deve ter pelo menos 6 caracteres.';
			return;
		}
		if (novaSenha !== confirmarSenha) {
			erro = 'A confirmação da nova senha não confere.';
			return;
		}

		salvando = true;
		try {
			const res = await fetch('/api/auth/trocar-senha', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					senhaAtual: obrigatoria ? undefined : senhaAtual,
					novaSenha,
					confirmarSenha
				})
			});

			const payload = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
			if (!res.ok) {
				throw new Error(payload.message || 'Erro ao atualizar a senha.');
			}

			tarefaStore.concluir('Senha atualizada com sucesso!', 'Seu acesso está liberado.', {
				autoFecharMs: 4000
			});
			await invalidateAll();
			await goto('/');
		} catch (err: unknown) {
			erro = err instanceof Error ? err.message : 'Erro ao trocar a senha.';
		} finally {
			salvando = false;
		}
	}

	async function sair() {
		await fetch('/api/auth/logout', { method: 'POST' });
		await invalidateAll();
		await goto('/login');
	}
</script>

<svelte:head>
	<title>Definir Nova Senha — Custódia PCCE</title>
</svelte:head>

<div class="auth-wrap">
	<section class="auth-card panel">
		<div class="auth-head">
			<span class="badge {obrigatoria ? 'warn' : 'blue'}">
				{obrigatoria ? 'Primeiro acesso / Senha resetada' : 'Segurança da conta'}
			</span>
			<h1>Definir nova senha</h1>
			<p>
				{#if obrigatoria}
					Unidade <strong>{data.unidade?.nome}</strong> ({data.unidade?.email}): por segurança, altere a senha padrão antes de acessar o sistema.
				{:else}
					Altere a senha de acesso da unidade <strong>{data.unidade?.nome}</strong>.
				{/if}
			</p>
		</div>

		{#if erro}
			<div class="alert error" role="alert">{erro}</div>
		{/if}

		<form class="auth-form" onsubmit={salvarNovaSenha}>
			{#if !obrigatoria}
				<div class="field">
					<label for="senha-atual">Senha atual</label>
					<input
						id="senha-atual"
						type="password"
						bind:value={senhaAtual}
						autocomplete="current-password"
						required
						disabled={salvando}
					/>
				</div>
			{/if}

			<div class="field">
				<label for="nova-senha">Nova senha <span class="opt">(mínimo 6 caracteres)</span></label>
				<input
					id="nova-senha"
					type="password"
					bind:value={novaSenha}
					minlength={6}
					autocomplete="new-password"
					required
					disabled={salvando}
				/>
			</div>

			<div class="field">
				<label for="confirmar-senha">Confirmar nova senha</label>
				<input
					id="confirmar-senha"
					type="password"
					bind:value={confirmarSenha}
					minlength={6}
					autocomplete="new-password"
					required
					disabled={salvando}
				/>
			</div>

			<button type="submit" class="btn btn-primary btn-submit" disabled={salvando}>
				{salvando ? 'Salvando nova senha...' : 'Salvar senha e continuar'}
			</button>

			{#if obrigatoria}
				<button type="button" class="btn btn-secondary btn-submit" onclick={sair} disabled={salvando}>
					Sair e voltar ao login
				</button>
			{:else}
				<a href="/" class="btn btn-secondary btn-submit">Cancelar</a>
			{/if}
		</form>
	</section>
</div>

<style>
	.auth-wrap {
		min-height: calc(100dvh - 5rem);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1.5rem 0.5rem;
	}

	.auth-card {
		width: 100%;
		max-width: 440px;
		padding: 2rem 1.75rem;
		box-shadow: var(--shadow);
	}

	.auth-head h1 {
		margin: 0.65rem 0 0.35rem;
		font-size: 1.3rem;
		font-weight: 800;
	}

	.auth-head p {
		margin: 0 0 1.1rem;
		font-size: 0.86rem;
		color: var(--text-2);
		line-height: 1.45;
	}

	.auth-form {
		display: flex;
		flex-direction: column;
		gap: 0.95rem;
	}

	.field label {
		display: block;
		font-size: 0.82rem;
		font-weight: 600;
		margin-bottom: 0.35rem;
	}

	.opt {
		font-weight: 400;
		color: var(--text-3);
	}

	.field input {
		width: 100%;
	}

	.btn-submit {
		width: 100%;
		min-height: 42px;
		justify-content: center;
		text-decoration: none;
	}
</style>
