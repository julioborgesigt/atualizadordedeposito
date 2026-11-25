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
		min-width: 220px;
	}
	.trigger {
		width: 100%;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.6rem;
		padding: 0.55rem 0.8rem;
		border: 1px solid #cbd5e1;
		border-radius: 6px;
		background: #fff;
		color: #1e293b;
		font-size: 0.88rem;
		cursor: pointer;
		text-align: left;
	}
	.trigger.open,
	.trigger:focus {
		border-color: #2563eb;
		outline: none;
	}
	.trigger-label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.chevron {
		font-size: 0.78rem;
		color: #64748b;
		flex-shrink: 0;
	}
	.dropdown {
		position: absolute;
		top: calc(100% + 4px);
		left: 0;
		right: 0;
		min-width: 250px;
		background: #fff;
		border: 1px solid #cbd5e1;
		border-radius: 8px;
		box-shadow: 0 10px 25px rgba(15, 23, 42, 0.14);
		z-index: 50;
		overflow: hidden;
	}
	.search-box {
		padding: 0.5rem;
		border-bottom: 1px solid #e2e8f0;
		background: #f8fafc;
	}
	.search-box input {
		width: 100%;
		box-sizing: border-box;
		padding: 0.45rem 0.6rem;
		border: 1px solid #cbd5e1;
		border-radius: 6px;
		font-size: 0.84rem;
		background: #fff;
	}
	.search-box input:focus {
		border-color: #2563eb;
		outline: none;
	}
	.options-list {
		list-style: none;
		margin: 0;
		padding: 0.25rem 0;
		max-height: 230px;
		overflow-y: auto;
	}
	.option-btn {
		width: 100%;
		text-align: left;
		background: transparent;
		border: none;
		padding: 0.5rem 0.75rem;
		font-size: 0.85rem;
		color: #1e293b;
		cursor: pointer;
		display: block;
	}
	.option-btn:hover {
		background: #eff6ff;
		color: #1d4ed8;
	}
	.option-btn.active {
		background: #2563eb;
		color: #fff;
		font-weight: 600;
	}
	.no-results {
		padding: 0.7rem 0.75rem;
		font-size: 0.82rem;
		color: #64748b;
		text-align: center;
	}
</style>
