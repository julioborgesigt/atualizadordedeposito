<script lang="ts">
	import { tarefaStore } from '$lib/stores/tarefa.svelte';
</script>

{#if tarefaStore.status !== 'ociosa'}
	<aside
		class="task-toast {tarefaStore.status}"
		role={tarefaStore.status === 'erro' ? 'alert' : 'status'}
		aria-live={tarefaStore.status === 'erro' ? 'assertive' : 'polite'}
	>
		<div class="task-body">
			<div class="task-icon" aria-hidden="true">
				{#if tarefaStore.status === 'executando'}
					<span class="task-spinner"></span>
				{:else if tarefaStore.status === 'concluida'}
					<svg
						width="18"
						height="18"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2.6"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<path d="M20 6 9 17l-5-5" />
					</svg>
				{:else}
					<svg
						width="18"
						height="18"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2.4"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<circle cx="12" cy="12" r="10" />
						<path d="M12 8v4M12 16h.01" />
					</svg>
				{/if}
			</div>

			<div class="task-content">
				<div class="task-head">
					<span class="task-pill">
						{#if tarefaStore.status === 'executando'}
							Em andamento
						{:else if tarefaStore.status === 'concluida'}
							Concluída
						{:else}
							Erro
						{/if}
					</span>
					{#if tarefaStore.status === 'executando' && tarefaStore.progresso !== null}
						<span class="task-pct">{Math.round(tarefaStore.progresso)}%</span>
					{/if}
				</div>

				<strong class="task-title">{tarefaStore.titulo}</strong>

				{#if tarefaStore.detalhe}
					<p class="task-detail">{tarefaStore.detalhe}</p>
				{/if}

				{#if tarefaStore.acao && tarefaStore.status === 'concluida'}
					<div class="task-actions">
						<a href={tarefaStore.acao.href} class="task-link" onclick={() => tarefaStore.fechar()}>
							{tarefaStore.acao.label}
						</a>
					</div>
				{/if}
			</div>

			{#if tarefaStore.status !== 'executando'}
				<button
					type="button"
					class="task-close"
					aria-label="Fechar aviso"
					onclick={() => tarefaStore.fechar()}
				>
					<svg
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2.2"
						stroke-linecap="round"
					>
						<path d="M18 6 6 18M6 6l12 12" />
					</svg>
				</button>
			{/if}
		</div>

		{#if tarefaStore.status === 'executando'}
			<div class="task-progress-track" aria-hidden="true">
				{#if tarefaStore.progresso !== null}
					<div
						class="task-progress-bar determinate"
						style="width: {Math.min(100, Math.max(4, tarefaStore.progresso))}%"
					></div>
				{:else}
					<div class="task-progress-bar indeterminate"></div>
				{/if}
			</div>
		{/if}
	</aside>
{/if}

<style>
	.task-toast {
		position: fixed;
		top: calc(var(--header-h) + 0.75rem);
		right: 1rem;
		z-index: 60;
		width: min(420px, calc(100vw - 1.5rem));
		background: var(--surface);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-lg);
		overflow: hidden;
		animation: taskSlideIn 0.22s ease-out;
	}

	.task-toast.executando {
		border-color: hsl(221 76% 74%);
	}

	.task-toast.concluida {
		border-color: var(--success-border);
	}

	.task-toast.erro {
		border-color: var(--danger-border);
	}

	.task-body {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
		padding: 0.9rem 1rem;
	}

	.task-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border-radius: 10px;
		flex-shrink: 0;
	}

	.executando .task-icon {
		background: var(--primary-soft);
		color: var(--primary);
	}

	.concluida .task-icon {
		background: var(--success-soft);
		color: var(--success);
	}

	.erro .task-icon {
		background: var(--danger-soft);
		color: var(--danger);
	}

	.task-spinner {
		width: 18px;
		height: 18px;
		border: 2.5px solid var(--primary-soft-2);
		border-top-color: var(--primary);
		border-radius: 50%;
		animation: taskSpin 0.75s linear infinite;
	}

	.task-content {
		flex: 1;
		min-width: 0;
	}

	.task-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		margin-bottom: 0.2rem;
	}

	.task-pill {
		display: inline-flex;
		align-items: center;
		padding: 0.1rem 0.48rem;
		border-radius: var(--radius-pill);
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.executando .task-pill {
		background: var(--primary-soft);
		color: var(--primary-text);
	}

	.concluida .task-pill {
		background: var(--success-soft);
		color: var(--success);
	}

	.erro .task-pill {
		background: var(--danger-soft);
		color: var(--danger);
	}

	.task-pct {
		font-size: 0.74rem;
		font-weight: 700;
		color: var(--primary);
		font-variant-numeric: tabular-nums;
	}

	.task-title {
		display: block;
		font-size: 0.9rem;
		font-weight: 700;
		color: var(--text);
		line-height: 1.3;
	}

	.task-detail {
		margin: 0.2rem 0 0;
		font-size: 0.8rem;
		color: var(--text-2);
		line-height: 1.4;
		overflow-wrap: anywhere;
	}

	.task-actions {
		margin-top: 0.5rem;
	}

	.task-link {
		display: inline-flex;
		align-items: center;
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--primary);
		text-decoration: none;
	}

	.task-link:hover {
		text-decoration: underline;
	}

	.task-close {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		flex-shrink: 0;
		border: none;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text-3);
		cursor: pointer;
		transition:
			background 0.15s,
			color 0.15s;
	}

	.task-close:hover {
		background: var(--surface-3);
		color: var(--text);
	}

	.task-progress-track {
		width: 100%;
		height: 4px;
		background: var(--primary-soft);
		overflow: hidden;
		position: relative;
	}

	.task-progress-bar {
		height: 100%;
		background: var(--primary);
		border-radius: 0 2px 2px 0;
	}

	.task-progress-bar.determinate {
		transition: width 0.25s ease-out;
	}

	.task-progress-bar.indeterminate {
		width: 40%;
		position: absolute;
		left: 0;
		top: 0;
		animation: taskIndeterminate 1.2s ease-in-out infinite;
	}

	@keyframes taskSpin {
		to {
			transform: rotate(360deg);
		}
	}

	@keyframes taskSlideIn {
		from {
			opacity: 0;
			transform: translateY(-8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@keyframes taskIndeterminate {
		0% {
			transform: translateX(-100%);
		}
		50% {
			transform: translateX(120%);
		}
		100% {
			transform: translateX(260%);
		}
	}

	@media (max-width: 720px) {
		.task-toast {
			top: calc(var(--header-h) + 0.5rem + env(safe-area-inset-top));
			left: 0.75rem;
			right: 0.75rem;
			width: auto;
		}
	}
</style>
