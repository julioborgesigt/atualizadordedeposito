<script lang="ts">
	import { confirmacaoStore } from '$lib/stores/confirmacao.svelte';

	function handleKeydown(e: KeyboardEvent) {
		if (confirmacaoStore.aberto && e.key === 'Escape') {
			e.preventDefault();
			confirmacaoStore.responder(false);
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if confirmacaoStore.aberto}
	<div
		class="confirm-backdrop"
		role="presentation"
		onclick={() => confirmacaoStore.responder(false)}
	>
		<div
			class="confirm-modal panel"
			role="alertdialog"
			aria-modal="true"
			aria-labelledby="confirm-modal-titulo"
			aria-describedby="confirm-modal-msg"
			tabindex="-1"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.key === 'Escape' && confirmacaoStore.responder(false)}
		>
			<div class="confirm-head">
				<span class="confirm-icon" class:perigoso={confirmacaoStore.perigoso} aria-hidden="true">
					{#if confirmacaoStore.perigoso}
						<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
							<path d="M12 9v4M12 17h.01" />
						</svg>
					{:else}
						<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
							<circle cx="12" cy="12" r="10" />
							<path d="M12 8v4M12 16h.01" />
						</svg>
					{/if}
				</span>
				<div class="confirm-text">
					<h2 id="confirm-modal-titulo">{confirmacaoStore.titulo}</h2>
					<p id="confirm-modal-msg">{confirmacaoStore.mensagem}</p>
				</div>
			</div>

			<div class="confirm-actions">
				<button
					type="button"
					class="btn btn-secondary"
					onclick={() => confirmacaoStore.responder(false)}
				>
					{confirmacaoStore.textoCancelar}
				</button>
				<button
					type="button"
					class="btn {confirmacaoStore.perigoso ? 'btn-danger-solid' : 'btn-primary'}"
					onclick={() => confirmacaoStore.responder(true)}
				>
					{confirmacaoStore.textoConfirmar}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.confirm-backdrop {
		position: fixed;
		inset: 0;
		z-index: 80;
		background: hsl(222 47% 10% / 0.52);
		backdrop-filter: blur(2px);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
		animation: fadeIn 0.14s ease-out;
	}

	.confirm-modal {
		width: 100%;
		max-width: 440px;
		padding: 1.4rem 1.45rem;
		box-shadow: var(--shadow-lg);
		animation: popIn 0.16s ease-out;
	}

	.confirm-head {
		display: flex;
		align-items: flex-start;
		gap: 0.85rem;
	}

	.confirm-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		border-radius: 12px;
		flex-shrink: 0;
		background: var(--primary-soft);
		color: var(--primary);
	}

	.confirm-icon.perigoso {
		background: var(--danger-soft);
		color: var(--danger);
	}

	.confirm-text {
		flex: 1;
		min-width: 0;
	}

	.confirm-text h2 {
		margin: 0.05rem 0 0.35rem;
		font-size: 1.05rem;
		font-weight: 700;
		color: var(--text);
	}

	.confirm-text p {
		margin: 0;
		font-size: 0.88rem;
		color: var(--text-2);
		line-height: 1.48;
		overflow-wrap: anywhere;
	}

	.confirm-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.55rem;
		margin-top: 1.35rem;
	}

	.confirm-actions .btn {
		min-height: 38px;
		padding: 0.5rem 1.05rem;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	@keyframes popIn {
		from {
			opacity: 0;
			transform: scale(0.96) translateY(4px);
		}
		to {
			opacity: 1;
			transform: scale(1) translateY(0);
		}
	}

	@media (max-width: 520px) {
		.confirm-actions {
			flex-direction: column-reverse;
		}
		.confirm-actions .btn {
			width: 100%;
			justify-content: center;
		}
	}
</style>
