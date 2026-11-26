<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { tarefaStore } from '$lib/stores/tarefa.svelte';
	import type { UnidadeAdminItem } from './+page.server';

	let { data } = $props();

	let nome = $state('');
	let email = $state('');
	let senhaInicial = $state('');
	let cadastrando = $state(false);
	let erroCadastro = $state<string | null>(null);

	// Modal de reset de senha
	let unidadeReset = $state<UnidadeAdminItem | null>(null);
	let novaSenhaReset = $state('');
	let salvandoReset = $state(false);
	let erroReset = $state<string | null>(null);

	let processandoId = $state<number | null>(null);

	async function cadastrarUnidade(e: SubmitEvent) {
		e.preventDefault();
		if (cadastrando) return;
		erroCadastro = null;
		cadastrando = true;
		tarefaStore.iniciar('Cadastrando nova unidade...', nome.trim());

		try {
			const res = await fetch('/api/admin/unidades', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					nome: nome.trim(),
					email: email.trim(),
					senhaInicial
				})
			});

			const body = (await res.json().catch(() => ({}))) as { message?: string };
			if (!res.ok) {
				throw new Error(body.message || 'Erro ao cadastrar unidade.');
			}

			const nomeSalvo = nome.trim();
			nome = '';
			email = '';
			senhaInicial = '';
			await invalidateAll();
			tarefaStore.concluir(
				'Unidade cadastrada com sucesso!',
				`"${nomeSalvo}" já pode fazer login com a senha inicial e deverá trocá-la no primeiro acesso.`,
				{ autoFecharMs: 6000 }
			);
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : 'Erro ao cadastrar unidade.';
			erroCadastro = msg;
			tarefaStore.falhar('Erro ao cadastrar unidade', msg);
		} finally {
			cadastrando = false;
		}
	}

	function abrirReset(u: UnidadeAdminItem) {
		unidadeReset = u;
		novaSenhaReset = '';
		erroReset = null;
	}

	async function confirmarReset(e: SubmitEvent) {
		e.preventDefault();
		if (!unidadeReset || salvandoReset) return;
		erroReset = null;
		salvandoReset = true;
		tarefaStore.iniciar('Resetando senha...', unidadeReset.nome);

		try {
			const res = await fetch(`/api/admin/unidades/${unidadeReset.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					acao: 'RESETAR_SENHA',
					novaSenha: novaSenhaReset
				})
			});

			const body = (await res.json().catch(() => ({}))) as { message?: string };
			if (!res.ok) {
				throw new Error(body.message || 'Erro ao resetar senha.');
			}

			const nomeUnidade = unidadeReset.nome;
			unidadeReset = null;
			novaSenhaReset = '';
			await invalidateAll();
			tarefaStore.concluir(
				'Senha resetada com sucesso!',
				`A unidade "${nomeUnidade}" precisará definir uma nova senha no próximo login.`,
				{ autoFecharMs: 6000 }
			);
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : 'Erro ao resetar senha.';
			erroReset = msg;
			tarefaStore.falhar('Erro ao resetar senha', msg);
		} finally {
			salvandoReset = false;
		}
	}

	async function alternarStatus(u: UnidadeAdminItem) {
		if (processandoId !== null) return;
		const novoAtivo = u.ativo !== 1;
		processandoId = u.id;
		tarefaStore.iniciar(
			novoAtivo ? 'Ativando unidade...' : 'Desativando unidade...',
			u.nome
		);

		try {
			const res = await fetch(`/api/admin/unidades/${u.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					acao: 'ALTERAR_STATUS',
					ativo: novoAtivo
				})
			});

			const body = (await res.json().catch(() => ({}))) as { message?: string };
			if (!res.ok) {
				throw new Error(body.message || 'Erro ao atualizar status da unidade.');
			}

			await invalidateAll();
			tarefaStore.concluir(
				novoAtivo ? 'Unidade reativada' : 'Unidade desativada',
				`"${u.nome}" foi ${novoAtivo ? 'reativada' : 'desativada'} com sucesso.`,
				{ autoFecharMs: 4000 }
			);
		} catch (err: unknown) {
			tarefaStore.falhar(
				'Erro ao atualizar unidade',
				err instanceof Error ? err.message : 'Falha na operação.'
			);
		} finally {
			processandoId = null;
		}
	}
</script>

<svelte:head>
	<title>Unidades / Delegacias — Custódia PCCE</title>
</svelte:head>

<div class="page-head">
	<div>
		<h1>Unidades e Delegacias</h1>
		<p class="sub">
			Cadastre novas unidades com e-mail e senha padrão, acompanhe os acessos e realize reset de senhas.
		</p>
	</div>
</div>

<section class="panel form-card">
	<h2>Cadastrar nova unidade</h2>
	<p class="hint">
		No primeiro acesso, a unidade será direcionada automaticamente para trocar a senha padrão.
	</p>

	{#if erroCadastro}
		<div class="alert error" role="alert">{erroCadastro}</div>
	{/if}

	<form class="form-grid" onsubmit={cadastrarUnidade}>
		<div class="field">
			<label for="u-nome">Nome da delegacia / unidade *</label>
			<input
				id="u-nome"
				type="text"
				bind:value={nome}
				placeholder="Ex: 1ª Delegacia Regional de Iguatu"
				required
				disabled={cadastrando}
			/>
		</div>

		<div class="field">
			<label for="u-email">E-mail de acesso *</label>
			<input
				id="u-email"
				type="email"
				bind:value={email}
				placeholder="delegacia@pc.ce.gov.br"
				required
				disabled={cadastrando}
			/>
		</div>

		<div class="field">
			<label for="u-senha">Senha provisória inicial *</label>
			<input
				id="u-senha"
				type="text"
				bind:value={senhaInicial}
				placeholder="Mínimo 6 caracteres"
				minlength={6}
				required
				disabled={cadastrando}
			/>
		</div>

		<div class="field-submit">
			<button type="submit" class="btn btn-primary" disabled={cadastrando}>
				{cadastrando ? 'Cadastrando...' : '+ Cadastrar unidade'}
			</button>
		</div>
	</form>
</section>

<section class="panel list-card">
	<div class="list-head">
		<h2>Unidades cadastradas <span class="count-pill">{data.unidades.length}</span></h2>
	</div>

	<div class="units-grid">
		{#each data.unidades as u (u.id)}
			<article class="unit-card" class:inativa={u.ativo !== 1}>
				<div class="unit-top">
					<div>
						<div class="unit-badges">
							<span class="badge {u.role === 'ADMIN' ? 'purple' : 'blue'}">
								{u.role === 'ADMIN' ? 'Administrador' : 'Unidade'}
							</span>
							{#if u.ativo !== 1}
								<span class="badge danger">Inativa</span>
							{:else if u.deve_trocar_senha === 1}
								<span class="badge warn">Aguardando troca de senha</span>
							{:else}
								<span class="badge green">Ativa</span>
							{/if}
						</div>
						<h3 class="unit-name">{u.nome}</h3>
						<p class="unit-email">{u.email}</p>
					</div>

					<div class="unit-stats">
						<span><strong>{u.total_caixas}</strong> caixa(s)</span>
						<span><strong>{u.total_bens}</strong> bem(ns)</span>
					</div>
				</div>

				<div class="unit-actions">
					<a href="/?unidade={u.id}" class="btn btn-secondary btn-sm">Ver apreensões</a>
					<button
						type="button"
						class="btn btn-secondary btn-sm"
						onclick={() => abrirReset(u)}
					>
						Resetar senha
					</button>
					{#if u.id !== data.unidade?.id}
						<button
							type="button"
							class="btn btn-sm {u.ativo === 1 ? 'btn-danger-outline' : 'btn-primary'}"
							disabled={processandoId === u.id}
							onclick={() => alternarStatus(u)}
						>
							{u.ativo === 1 ? 'Desativar' : 'Reativar'}
						</button>
					{/if}
				</div>
			</article>
		{/each}
	</div>
</section>

{#if unidadeReset}
	<div class="modal-backdrop" role="presentation" onclick={() => !salvandoReset && (unidadeReset = null)}>
		<div
			class="modal panel"
			role="dialog"
			aria-modal="true"
			aria-labelledby="modal-reset-titulo"
			tabindex="-1"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.key === 'Escape' && !salvandoReset && (unidadeReset = null)}
		>
			<h2 id="modal-reset-titulo">Resetar senha da unidade</h2>
			<p class="hint">
				Defina uma nova senha provisória para <strong>{unidadeReset.nome}</strong> ({unidadeReset.email}).
				Qualquer sessão ativa será encerrada e a unidade deverá criar uma nova senha no próximo login.
			</p>

			{#if erroReset}
				<div class="alert error" role="alert">{erroReset}</div>
			{/if}

			<form onsubmit={confirmarReset} class="modal-form">
				<div class="field">
					<label for="reset-senha">Nova senha provisória *</label>
					<input
						id="reset-senha"
						type="text"
						bind:value={novaSenhaReset}
						placeholder="Mínimo 6 caracteres"
						minlength={6}
						required
						disabled={salvandoReset}
					/>
				</div>

				<div class="modal-actions">
					<button
						type="button"
						class="btn btn-secondary"
						disabled={salvandoReset}
						onclick={() => (unidadeReset = null)}
					>
						Cancelar
					</button>
					<button type="submit" class="btn btn-primary" disabled={salvandoReset}>
						{salvandoReset ? 'Resetando...' : 'Confirmar reset'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<style>
	.form-card {
		margin-bottom: 1.25rem;
	}
	.form-card h2,
	.list-head h2 {
		margin: 0 0 0.25rem;
		font-size: 1.05rem;
		font-weight: 700;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.hint {
		margin: 0 0 1rem;
		font-size: 0.85rem;
		color: var(--text-2);
	}
	.form-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: 0.85rem;
		align-items: end;
	}
	.field label {
		display: block;
		font-size: 0.8rem;
		font-weight: 600;
		margin-bottom: 0.35rem;
	}
	.field input {
		width: 100%;
	}
	.field-submit {
		display: flex;
	}
	.field-submit .btn {
		width: 100%;
		min-height: 40px;
		justify-content: center;
	}

	.units-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(310px, 1fr));
		gap: 0.9rem;
		margin-top: 0.9rem;
	}
	.unit-card {
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 1rem;
		background: var(--surface-2);
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		gap: 0.85rem;
	}
	.unit-card.inativa {
		opacity: 0.72;
	}
	.unit-top {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 0.75rem;
	}
	.unit-badges {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		margin-bottom: 0.45rem;
	}
	.unit-name {
		margin: 0;
		font-size: 0.98rem;
		font-weight: 700;
	}
	.unit-email {
		margin: 0.15rem 0 0;
		font-size: 0.82rem;
		color: var(--text-2);
		overflow-wrap: anywhere;
	}
	.unit-stats {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.15rem;
		font-size: 0.78rem;
		color: var(--text-2);
		white-space: nowrap;
	}
	.unit-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
		padding-top: 0.65rem;
		border-top: 1px solid var(--border);
	}
	.btn-danger-outline {
		background: transparent;
		border: 1px solid var(--danger-border);
		color: var(--danger);
	}
	.btn-danger-outline:hover {
		background: var(--danger-soft);
	}

	.modal-backdrop {
		position: fixed;
		inset: 0;
		z-index: 70;
		background: hsl(222 47% 10% / 0.55);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
	}
	.modal {
		width: 100%;
		max-width: 440px;
		padding: 1.5rem;
		box-shadow: var(--shadow-lg);
	}
	.modal h2 {
		margin: 0 0 0.4rem;
		font-size: 1.1rem;
	}
	.modal-form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	.modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
	}
</style>
