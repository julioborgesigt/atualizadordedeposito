<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import CaixaSelect from '$lib/components/CaixaSelect.svelte';

	let { data } = $props();

	const STATUS_OPCOES = [
		{ value: 'EM_DEPOSITO', label: 'Em depósito' },
		{ value: 'RESTITUIDO', label: 'Restituído' },
		{ value: 'RESTITUIDO_PARCIAL', label: 'Restituído parcial' },
		{ value: 'PERICIA', label: 'Perícia (PEFOCE)' },
		{ value: 'JUDICIARIO', label: 'Judiciário' },
		{ value: 'DESTRUIDO', label: 'Destruído' }
	];

	let selecionados = $state<number[]>([]);
	let processandoLote = $state(false);
	let feedback = $state<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

	// Estados da barra de ação em lote
	let destinoLoteCaixa = $state<string>('');
	let nomeNovaCaixaLote = $state('');
	let statusLote = $state('');

	const opcoesFiltroCaixa = $derived([
		{ value: '', label: `Todas as caixas (${data.contadores.total})` },
		{ value: '__SEM_CAIXA__', label: `Sem caixa (${data.contadores.semCaixa})` },
		...data.caixas.map((cx) => ({
			value: String(cx.id),
			label: `${cx.nome} (${cx.total_bens})`
		}))
	]);

	const opcoesFiltroProcedimento = $derived([
		{ value: '', label: 'Todos os procedimentos' },
		...data.procedimentos.map((proc) => ({
			value: String(proc.id),
			label: `${proc.tipo} ${proc.numero_normalizado} (${proc.total_bens})`
		}))
	]);

	const opcoesMoverLoteCaixa = $derived([
		{ value: '', label: 'Mover selecionados para caixa...' },
		{ value: '__NOVA__', label: '+ Criar nova caixa e mover...' },
		{ value: '__SEM_CAIXA__', label: '-- Remover da caixa (Sem caixa) --' },
		...data.caixas.map((cx) => ({
			value: String(cx.id),
			label: `Caixa: ${cx.nome} (${cx.total_bens})`
		}))
	]);

	const todosSelecionados = $derived(
		data.bens.length > 0 && data.bens.every((b) => selecionados.includes(b.id))
	);

	const caixaVisualizadaLabel = $derived.by(() => {
		if (!data.filtros.caixa) return 'Todas as caixas';
		if (data.filtros.caixa === '__SEM_CAIXA__') return 'Itens sem caixa';
		const encontrada = data.caixas.find((c) => String(c.id) === data.filtros.caixa);
		return encontrada ? `Caixa "${encontrada.nome}"` : 'Caixa selecionada';
	});

	const procedimentoVisualizadoLabel = $derived.by(() => {
		if (!data.filtros.procedimento) return 'Todos os procedimentos';
		const encontrado = data.procedimentos.find((p) => String(p.id) === data.filtros.procedimento);
		return encontrado
			? `${encontrado.tipo} ${encontrado.numero_normalizado}`
			: 'Procedimento selecionado';
	});

	function alternarTodos(marcar: boolean) {
		if (marcar) {
			selecionados = data.bens.map((b) => b.id);
		} else {
			selecionados = [];
		}
	}

	function alternarItem(id: number, marcar: boolean) {
		if (marcar) {
			if (!selecionados.includes(id)) selecionados = [...selecionados, id];
		} else {
			selecionados = selecionados.filter((item) => item !== id);
		}
	}

	function aplicarFiltros(novos: { caixa?: string; procedimento?: string }) {
		const params = new URLSearchParams();
		const caixaVal = novos.caixa !== undefined ? novos.caixa : data.filtros.caixa;
		const procVal =
			novos.procedimento !== undefined ? novos.procedimento : data.filtros.procedimento;

		if (data.filtros.q) params.set('q', data.filtros.q);
		if (data.filtros.status) params.set('status', data.filtros.status);
		if (caixaVal) params.set('caixa', caixaVal);
		if (procVal) params.set('procedimento', procVal);

		selecionados = [];
		const qs = params.toString();
		goto(qs ? `/?${qs}` : '/');
	}

	function filtrarPorCaixa(valorCaixa: string) {
		aplicarFiltros({ caixa: valorCaixa });
	}

	function filtrarPorProcedimento(valorProc: string) {
		aplicarFiltros({ procedimento: valorProc });
	}

	async function atualizarBem(id: number, patch: Record<string, unknown>) {
		await fetch(`/api/bens/${id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(patch)
		});
		await invalidateAll();
	}

	async function moverSelecionadosParaCaixa() {
		if (selecionados.length === 0) return;
		if (!destinoLoteCaixa) {
			feedback = { tipo: 'erro', texto: 'Escolha a caixa de destino para mover os itens.' };
			return;
		}
		if (destinoLoteCaixa === '__NOVA__' && !nomeNovaCaixaLote.trim()) {
			feedback = { tipo: 'erro', texto: 'Digite o nome da nova caixa.' };
			return;
		}

		processandoLote = true;
		feedback = null;
		try {
			const payload: Record<string, unknown> = { ids: selecionados };
			if (destinoLoteCaixa === '__NOVA__') {
				payload.nova_caixa_nome = nomeNovaCaixaLote.trim();
			} else if (destinoLoteCaixa === '__SEM_CAIXA__') {
				payload.caixa_id = null;
			} else {
				payload.caixa_id = Number(destinoLoteCaixa);
			}

			const res = await fetch('/api/bens/lote', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});

			if (!res.ok) {
				const err = (await res.json().catch(() => ({}))) as { message?: string };
				throw new Error(err.message || 'Erro ao mover itens.');
			}

			const qtd = selecionados.length;
			selecionados = [];
			destinoLoteCaixa = '';
			nomeNovaCaixaLote = '';
			feedback = { tipo: 'ok', texto: `${qtd} item(ns) movido(s) de caixa com sucesso.` };
			await invalidateAll();
		} catch (e: unknown) {
			feedback = {
				tipo: 'erro',
				texto: e instanceof Error ? e.message : 'Erro ao mover itens.'
			};
		} finally {
			processandoLote = false;
		}
	}

	async function alterarStatusEmLote() {
		if (selecionados.length === 0 || !statusLote) return;
		processandoLote = true;
		feedback = null;
		try {
			const res = await fetch('/api/bens/lote', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ ids: selecionados, status: statusLote })
			});
			if (!res.ok) throw new Error('Falha ao atualizar status em lote.');

			const qtd = selecionados.length;
			selecionados = [];
			statusLote = '';
			feedback = { tipo: 'ok', texto: `Status atualizado para ${qtd} item(ns).` };
			await invalidateAll();
		} catch (e: unknown) {
			feedback = {
				tipo: 'erro',
				texto: e instanceof Error ? e.message : 'Erro ao atualizar status.'
			};
		} finally {
			processandoLote = false;
		}
	}

	async function excluirItens(idsParaExcluir: number[]) {
		if (idsParaExcluir.length === 0) return;
		const confirmar = confirm(
			`Confirma a exclusão de ${idsParaExcluir.length} item(ns) selecionado(s)? Esta ação não pode ser desfeita.`
		);
		if (!confirmar) return;

		processandoLote = true;
		feedback = null;
		try {
			const res = await fetch('/api/bens/lote', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ ids: idsParaExcluir })
			});
			if (!res.ok) throw new Error('Erro ao excluir itens.');

			selecionados = selecionados.filter((id) => !idsParaExcluir.includes(id));
			feedback = {
				tipo: 'ok',
				texto: `${idsParaExcluir.length} item(ns) excluído(s) com sucesso.`
			};
			await invalidateAll();
		} catch (e: unknown) {
			feedback = {
				tipo: 'erro',
				texto: e instanceof Error ? e.message : 'Erro ao excluir itens.'
			};
		} finally {
			processandoLote = false;
		}
	}
</script>

<div class="kpis">
	<div class="kpi">
		<span>Total de Bens</span>
		<strong>{data.contadores.total}</strong>
	</div>
	<div class="kpi amber">
		<span>Em Depósito</span>
		<strong>{data.contadores.emDeposito}</strong>
	</div>
	<div class="kpi green">
		<span>Restituídos</span>
		<strong>{data.contadores.restituidos}</strong>
	</div>
	<div class="kpi purple">
		<span>Caixas Físicas</span>
		<strong>{data.caixas.length}</strong>
	</div>
</div>

{#if feedback}
	<div class="alert {feedback.tipo === 'ok' ? 'success' : 'error'}">
		<span>{feedback.texto}</span>
		<button type="button" class="close-btn" onclick={() => (feedback = null)}>×</button>
	</div>
{/if}

<form method="GET" class="filtros">
	<input
		type="search"
		name="q"
		value={data.filtros.q}
		placeholder="Buscar por BO/IP, IMEI, placa, cartão, descrição, caixa ou operação..."
	/>
	<select name="status" value={data.filtros.status} onchange={(e) => e.currentTarget.form?.requestSubmit()}>
		<option value="">Todos os status</option>
		{#each STATUS_OPCOES as st}
			<option value={st.value}>{st.label}</option>
		{/each}
	</select>
	<CaixaSelect
		name="procedimento"
		opcoes={opcoesFiltroProcedimento}
		value={data.filtros.procedimento}
		placeholder="Todos os procedimentos"
		buscaPlaceholder="Pesquisar BO / IP / TCO..."
		onchange={(val) => filtrarPorProcedimento(val)}
	/>
	<CaixaSelect
		name="caixa"
		opcoes={opcoesFiltroCaixa}
		value={data.filtros.caixa}
		placeholder="Todas as caixas"
		buscaPlaceholder="Pesquisar nome da caixa..."
		onchange={(val) => filtrarPorCaixa(val)}
	/>
	<button type="submit">Filtrar</button>
	{#if data.filtros.q || data.filtros.status || data.filtros.caixa || data.filtros.procedimento}
		<a href="/" class="btn-clear">Limpar filtros</a>
	{/if}
</form>

{#if selecionados.length > 0}
	<div class="bulk-bar">
		<div class="bulk-count">
			<strong>{selecionados.length}</strong> item(ns) selecionado(s)
		</div>

		<div class="bulk-actions">
			<div class="bulk-group">
				<CaixaSelect
					opcoes={opcoesMoverLoteCaixa}
					bind:value={destinoLoteCaixa}
					placeholder="Mover selecionados para caixa..."
					buscaPlaceholder="Pesquisar caixa de destino..."
				/>
				{#if destinoLoteCaixa === '__NOVA__'}
					<input
						type="text"
						bind:value={nomeNovaCaixaLote}
						placeholder="Nome da nova caixa..."
					/>
				{/if}
				<button
					type="button"
					class="btn-bulk primary"
					disabled={processandoLote || !destinoLoteCaixa}
					onclick={moverSelecionadosParaCaixa}
				>
					Mover para Caixa
				</button>
			</div>

			<span class="bulk-sep">Ou</span>

			<div class="bulk-group">
				<select bind:value={statusLote}>
					<option value="">Alterar status...</option>
					{#each STATUS_OPCOES as st}
						<option value={st.value}>{st.label}</option>
					{/each}
				</select>
				<button
					type="button"
					class="btn-bulk"
					disabled={processandoLote || !statusLote}
					onclick={alterarStatusEmLote}
				>
					Aplicar Status
				</button>
			</div>

			<span class="bulk-sep">Ou</span>

			<button
				type="button"
				class="btn-bulk danger"
				disabled={processandoLote}
				onclick={() => excluirItens(selecionados)}
			>
				Excluir Selecionados ({selecionados.length})
			</button>
		</div>
	</div>
{/if}

<div class="visao-atual-banner">
	<div class="visao-titulo">
		<span class="visao-tag">Visualizando agora</span>
		<h2>{caixaVisualizadaLabel} • {procedimentoVisualizadoLabel}</h2>
	</div>
	<div class="visao-meta">
		<span><strong>{data.bens.length}</strong> item(ns) exibido(s)</span>
	</div>
</div>

<div class="table-wrap">
	<table>
		<thead>
			<tr>
				<th style="width: 36px">
					<input
						type="checkbox"
						checked={todosSelecionados}
						onchange={(e) => alternarTodos(e.currentTarget.checked)}
						title="Selecionar todos desta lista"
					/>
				</th>
				<th>Procedimento</th>
				<th>Bem / Descrição</th>
				<th>Saldo</th>
				<th>Caixa</th>
				<th>Status</th>
				<th style="width: 70px">Ações</th>
			</tr>
		</thead>
		<tbody>
			{#if data.bens.length === 0}
				<tr>
					<td colspan="7" class="empty">
						Nenhum bem encontrado para este filtro. <a href="/importar">Importar lote de PDFs</a>.
					</td>
				</tr>
			{/if}
			{#each data.bens as bem (bem.id)}
				<tr class:row-selected={selecionados.includes(bem.id)}>
					<td>
						<input
							type="checkbox"
							checked={selecionados.includes(bem.id)}
							onchange={(e) => alternarItem(bem.id, e.currentTarget.checked)}
						/>
					</td>
					<td>
						<strong>{bem.proc_tipo} {bem.proc_numero}</strong>
						{#if bem.operacao}
							<div class="muted">{bem.operacao}</div>
						{/if}
					</td>
					<td>
						<div class="cat">{bem.categoria}</div>
						<div>{bem.descricao_original}</div>
					</td>
					<td>{bem.qtd_disponivel} / {bem.qtd_total} {bem.unidade}</td>
					<td>
						<select
							value={bem.caixa_id ? String(bem.caixa_id) : ''}
							onchange={(e) =>
								atualizarBem(bem.id, {
									caixa_id: e.currentTarget.value ? Number(e.currentTarget.value) : null
								})}
						>
							<option value="">Sem caixa</option>
							{#each data.caixas as cx}
								<option value={String(cx.id)}>{cx.nome}</option>
							{/each}
						</select>
					</td>
					<td>
						<select
							class="status-select {bem.status.toLowerCase()}"
							value={bem.status}
							onchange={(e) => atualizarBem(bem.id, { status: e.currentTarget.value })}
						>
							{#each STATUS_OPCOES as st}
								<option value={st.value}>{st.label}</option>
							{/each}
						</select>
					</td>
					<td>
						<button
							type="button"
							class="btn-row-del"
							title="Excluir este item"
							onclick={() => excluirItens([bem.id])}
						>
							Excluir
						</button>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	.kpis {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
		gap: 0.85rem;
		margin-bottom: 1rem;
	}
	.kpi {
		background: #fff;
		border: 1px solid #e2e8f0;
		border-left: 4px solid #2563eb;
		border-radius: 8px;
		padding: 0.85rem 1rem;
	}
	.kpi.amber {
		border-left-color: #d97706;
	}
	.kpi.green {
		border-left-color: #16a34a;
	}
	.kpi.purple {
		border-left-color: #7c3aed;
	}
	.kpi span {
		display: block;
		font-size: 0.82rem;
		color: #64748b;
	}
	.kpi strong {
		font-size: 1.65rem;
	}
	.alert {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.75rem 1rem;
		border-radius: 8px;
		margin-bottom: 1rem;
		font-weight: 500;
		font-size: 0.9rem;
	}
	.alert.success {
		background: #dcfce7;
		color: #166534;
	}
	.alert.error {
		background: #fee2e2;
		color: #991b1b;
	}
	.close-btn {
		background: transparent;
		border: none;
		font-size: 1.2rem;
		cursor: pointer;
		color: inherit;
	}
	.filtros {
		display: flex;
		gap: 0.6rem;
		flex-wrap: wrap;
		margin-bottom: 1rem;
		align-items: center;
	}
	.filtros input {
		flex: 1;
		min-width: 240px;
		padding: 0.55rem 0.75rem;
		border: 1px solid #cbd5e1;
		border-radius: 6px;
	}
	.filtros select,
	.filtros button {
		padding: 0.55rem 0.85rem;
		border: 1px solid #cbd5e1;
		border-radius: 6px;
		background: #fff;
	}
	.filtros button {
		background: #0f172a;
		color: #fff;
		border-color: #0f172a;
		cursor: pointer;
		font-weight: 600;
	}
	.btn-clear {
		font-size: 0.84rem;
		color: #475569;
		text-decoration: underline;
	}
	.bulk-bar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		flex-wrap: wrap;
		background: #1e293b;
		color: #fff;
		padding: 0.75rem 1rem;
		border-radius: 8px;
		margin-bottom: 0.85rem;
	}
	.bulk-count {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		font-size: 0.9rem;
	}
	.bulk-sep {
		font-size: 0.8rem;
		font-weight: 700;
		color: #94a3b8;
		padding: 0 0.15rem;
	}
	.bulk-actions {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-wrap: wrap;
	}
	.bulk-group {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-wrap: wrap;
	}
	.bulk-group select,
	.bulk-group input {
		padding: 0.42rem 0.6rem;
		border-radius: 6px;
		border: 1px solid #475569;
		font-size: 0.83rem;
	}
	.btn-bulk {
		padding: 0.45rem 0.8rem;
		border-radius: 6px;
		border: none;
		font-weight: 600;
		font-size: 0.83rem;
		cursor: pointer;
		background: #334155;
		color: #fff;
	}
	.btn-bulk.primary {
		background: #2563eb;
	}
	.btn-bulk.danger {
		background: #dc2626;
	}
	.btn-bulk:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.visao-atual-banner {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		flex-wrap: wrap;
		background: #eff6ff;
		border: 1px solid #bfdbfe;
		border-left: 4px solid #2563eb;
		border-radius: 8px;
		padding: 0.75rem 1rem;
		margin-bottom: 0.75rem;
	}
	.visao-titulo {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		flex-wrap: wrap;
	}
	.visao-tag {
		background: #2563eb;
		color: #fff;
		font-size: 0.72rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		padding: 0.22rem 0.55rem;
		border-radius: 999px;
	}
	.visao-titulo h2 {
		margin: 0;
		font-size: 1.05rem;
		color: #1e3a8a;
	}
	.visao-meta {
		font-size: 0.85rem;
		color: #1e40af;
	}
	.table-wrap {
		background: #fff;
		border: 1px solid #e2e8f0;
		border-radius: 8px;
		overflow-x: auto;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.88rem;
	}
	th,
	td {
		text-align: left;
		padding: 0.65rem 0.75rem;
		border-top: 1px solid #e2e8f0;
		vertical-align: top;
	}
	th {
		background: #f8fafc;
		font-weight: 600;
		border-top: none;
	}
	tr.row-selected {
		background: #eff6ff;
	}
	.cat {
		font-size: 0.72rem;
		font-weight: 700;
		color: #475569;
		text-transform: uppercase;
	}
	.muted {
		font-size: 0.78rem;
		color: #64748b;
	}
	.empty {
		text-align: center;
		padding: 2rem;
		color: #64748b;
	}
	select {
		padding: 0.35rem 0.5rem;
		border: 1px solid #cbd5e1;
		border-radius: 6px;
		font-size: 0.82rem;
	}
	.status-select.em_deposito {
		background: #fef3c7;
		color: #92400e;
		font-weight: 600;
	}
	.status-select.restituido {
		background: #dcfce7;
		color: #166534;
		font-weight: 600;
	}
	.status-select.restituido_parcial {
		background: #e0f2fe;
		color: #075985;
		font-weight: 600;
	}
	.btn-row-del {
		background: #fee2e2;
		color: #b91c1c;
		border: 1px solid #fecaca;
		border-radius: 5px;
		padding: 0.28rem 0.5rem;
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
	}
	.btn-row-del:hover {
		background: #fecaca;
	}
</style>
