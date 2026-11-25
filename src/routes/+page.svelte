<script lang="ts">
	import { invalidateAll } from '$app/navigation';

	let { data } = $props();

	const STATUS_OPCOES = [
		{ value: 'EM_DEPOSITO', label: 'Em depósito' },
		{ value: 'RESTITUIDO', label: 'Restituído' },
		{ value: 'RESTITUIDO_PARCIAL', label: 'Restituído parcial' },
		{ value: 'PERICIA', label: 'Perícia (PEFOCE)' },
		{ value: 'JUDICIARIO', label: 'Judiciário' },
		{ value: 'DESTRUIDO', label: 'Destruído' }
	];

	async function atualizarBem(id: number, patch: Record<string, unknown>) {
		await fetch(`/api/bens/${id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(patch)
		});
		await invalidateAll();
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
</div>

<form method="GET" class="filtros">
	<input
		type="search"
		name="q"
		value={data.filtros.q}
		placeholder="Buscar por BO/IP, IMEI, placa, cartão, descrição ou operação..."
	/>
	<select name="status" value={data.filtros.status}>
		<option value="">Todos os status</option>
		{#each STATUS_OPCOES as st}
			<option value={st.value}>{st.label}</option>
		{/each}
	</select>
	<select name="caixa" value={data.filtros.caixa}>
		<option value="">Todas as caixas</option>
		{#each data.caixas as cx}
			<option value={String(cx.id)}>{cx.nome}</option>
		{/each}
	</select>
	<button type="submit">Filtrar</button>
</form>

<div class="table-wrap">
	<table>
		<thead>
			<tr>
				<th>Procedimento</th>
				<th>Bem / Descrição</th>
				<th>ID Único</th>
				<th>Saldo</th>
				<th>Caixa</th>
				<th>Status</th>
			</tr>
		</thead>
		<tbody>
			{#if data.bens.length === 0}
				<tr>
					<td colspan="6" class="empty">
						Nenhum bem encontrado. <a href="/importar">Importe seu primeiro lote de PDFs</a>.
					</td>
				</tr>
			{/if}
			{#each data.bens as bem (bem.id)}
				<tr>
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
					<td><code>{bem.identificador_unico ?? '-'}</code></td>
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
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	.kpis {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: 1rem;
		margin-bottom: 1.2rem;
	}
	.kpi {
		background: #fff;
		border: 1px solid #e2e8f0;
		border-left: 4px solid #2563eb;
		border-radius: 8px;
		padding: 1rem;
	}
	.kpi.amber {
		border-left-color: #d97706;
	}
	.kpi.green {
		border-left-color: #16a34a;
	}
	.kpi span {
		display: block;
		font-size: 0.85rem;
		color: #64748b;
	}
	.kpi strong {
		font-size: 1.8rem;
	}
	.filtros {
		display: flex;
		gap: 0.6rem;
		flex-wrap: wrap;
		margin-bottom: 1rem;
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
</style>
