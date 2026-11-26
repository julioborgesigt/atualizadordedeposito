<script lang="ts">
	export interface OpcaoCaixa {
		value: string;
		label: string;
	}

	let {
		opcoes,
		value = $bindable(''),
		name = undefined,
		placeholder = 'Selecione uma caixa...',
		buscaPlaceholder = 'Buscar caixa pelo nome...',
		onchange = undefined
	}: {
		opcoes: OpcaoCaixa[];
		value: string;
		name?: string;
		placeholder?: string;
		buscaPlaceholder?: string;
		onchange?: (novoValor: string) => void;
	} = $props();

	let aberto = $state(false);
	let termoBusca = $state('');
	let containerEl = $state<HTMLDivElement | null>(null);
	let inputBuscaEl = $state<HTMLInputElement | null>(null);

	function normalizar(str: string): string {
		return str
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.toLowerCase();
	}

	const opcaoSelecionada = $derived(opcoes.find((o) => o.value === value));

	const opcoesFiltradas = $derived.by(() => {
		const q = normalizar(termoBusca.trim());
		if (!q) return opcoes;
		return opcoes.filter((o) => normalizar(o.label).includes(q));
	});

	function alternarMenu() {
		aberto = !aberto;
		if (aberto) {
			termoBusca = '';
			queueMicrotask(() => inputBuscaEl?.focus());
		}
	}

	function selecionar(op: OpcaoCaixa) {
		value = op.value;
		aberto = false;
		termoBusca = '';
		onchange?.(op.value);
	}

	function handleWindowClick(e: MouseEvent) {
		if (!aberto || !containerEl) return;
		if (!containerEl.contains(e.target as Node)) {
			aberto = false;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && aberto) {
			aberto = false;
		}
	}
</script>

<svelte:window onclick={handleWindowClick} onkeydown={handleKeydown} />

<div class="caixa-select" bind:this={containerEl}>
	{#if name}
		<input type="hidden" {name} {value} />
	{/if}

	<button
		type="button"
		class="trigger"
		class:open={aberto}
		onclick={alternarMenu}
		aria-haspopup="listbox"
		aria-expanded={aberto}
	>
		<span class="trigger-label">{opcaoSelecionada ? opcaoSelecionada.label : placeholder}</span>
		<span class="chevron">▾</span>
	</button>

	{#if aberto}
		<div class="dropdown">
			<div class="search-box">
				<input
					bind:this={inputBuscaEl}
					type="text"
					bind:value={termoBusca}
					placeholder={buscaPlaceholder}
					onkeydown={(e) => {
						if (e.key === 'Enter') {
							e.preventDefault();
							if (opcoesFiltradas.length > 0) {
								selecionar(opcoesFiltradas[0]);
							}
						}
					}}
				/>
			</div>
			<ul class="options-list" role="listbox">
				{#if opcoesFiltradas.length === 0}
					<li class="no-results">Nenhuma caixa encontrada para "{termoBusca}"</li>
				{:else}
					{#each opcoesFiltradas as op (op.value)}
						<li>
							<button
								type="button"
								class="option-btn"
								class:active={op.value === value}
								onclick={() => selecionar(op)}
							>
								{op.label}
							</button>
						</li>
					{/each}
				{/if}
			</ul>
		</div>
	{/if}
</div>

<style>
	.caixa-select {
		position: relative;
		min-width: min(220px, 100%);
	}
	.trigger {
		width: 100%;
		min-height: 40px;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.6rem;
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-sm);
		background: var(--surface);
		color: var(--text);
		font-size: 0.9rem;
		cursor: pointer;
		text-align: left;
		transition:
			border-color 0.15s,
			box-shadow 0.15s;
	}
	.trigger:hover {
		border-color: hsl(220 14% 70%);
	}
	.trigger.open,
	.trigger:focus-visible {
		border-color: var(--primary);
		box-shadow: var(--ring);
		outline: none;
	}
	.trigger-label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.chevron {
		font-size: 0.78rem;
		color: var(--text-3);
		flex-shrink: 0;
		transition: transform 0.15s;
	}
	.trigger.open .chevron {
		transform: rotate(180deg);
	}
	.dropdown {
		position: absolute;
		top: calc(100% + 6px);
		left: 0;
		right: 0;
		min-width: min(260px, calc(100vw - 2rem));
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		box-shadow: var(--shadow-lg);
		z-index: 50;
		overflow: hidden;
		animation: dd-in 0.14s ease-out;
	}
	@keyframes dd-in {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}
	.search-box {
		padding: 0.5rem;
		border-bottom: 1px solid var(--border);
		background: var(--surface-2);
	}
	.search-box input {
		width: 100%;
		min-height: 36px;
		font-size: 0.86rem;
	}
	.options-list {
		list-style: none;
		margin: 0;
		padding: 0.3rem;
		max-height: 260px;
		overflow-y: auto;
		overscroll-behavior: contain;
	}
	.option-btn {
		width: 100%;
		text-align: left;
		background: transparent;
		border: none;
		border-radius: 6px;
		padding: 0.55rem 0.65rem;
		font-size: 0.86rem;
		color: var(--text);
		cursor: pointer;
		display: block;
	}
	.option-btn:hover {
		background: var(--primary-soft);
		color: var(--primary-text);
	}
	.option-btn.active {
		background: var(--primary);
		color: #fff;
		font-weight: 600;
	}
	.no-results {
		padding: 0.8rem 0.75rem;
		font-size: 0.84rem;
		color: var(--text-3);
		text-align: center;
	}

	@media (max-width: 720px) {
		.caixa-select {
			width: 100%;
		}
		.trigger {
			min-height: 44px;
			font-size: 16px;
		}
		.search-box input {
			font-size: 16px;
			min-height: 42px;
		}
		.option-btn {
			padding: 0.75rem 0.7rem;
			font-size: 0.95rem;
		}
		.options-list {
			max-height: min(320px, 50vh);
		}
	}
</style>
