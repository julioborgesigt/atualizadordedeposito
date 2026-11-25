<script lang="ts">
	import { invalidateAll } from '$app/navigation';

	let { data } = $props();

	const POR_PAGINA = 5;

	let feedback = $state<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
	let novaCaixaNome = $state('');
	let buscaCaixa = $state('');
	let buscaDoc = $state('');

	let paginaCaixas = $state(1);
	let paginaDocs = $state(1);

	let editandoCaixaId = $state<number | null>(null);
	let editandoCaixaNome = $state('');
	let confirmandoExclusaoCaixaId = $state<number | null>(null);

	function normalizar(str: string): string {
		return str
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.toLowerCase();
	}

	const caixasFiltradas = $derived.by(() => {
		const q = normalizar(buscaCaixa.trim());
		if (!q) return data.caixas;
		return data.caixas.filter((c) => normalizar(c.nome).includes(q));
	});

	const totalPaginasCaixas = $derived(
		Math.max(1, Math.ceil(caixasFiltradas.length / POR_PAGINA))
	);
	const paginaCaixasSegura = $derived(Math.min(Math.max(1, paginaCaixas), totalPaginasCaixas));
	const caixasPaginadas = $derived(
		caixasFiltradas.slice(
			(paginaCaixasSegura - 1) * POR_PAGINA,
			paginaCaixasSegura * POR_PAGINA
		)
	);

	const documentosFiltrados = $derived.by(() => {
		const q = normalizar(buscaDoc.trim());
		if (!q) return data.documentos;
		return data.documentos.filter(
			(d) =>
				normalizar(`${d.proc_tipo} ${d.proc_numero}`).includes(q) ||
				normalizar(d.nome_arquivo).includes(q) ||
				normalizar(d.caixas_nomes ?? '').includes(q) ||
				normalizar(d.parte_nome ?? '').includes(q)
		);
	});

	const totalPaginasDocs = $derived(
		Math.max(1, Math.ceil(documentosFiltrados.length / POR_PAGINA))
	);
	const paginaDocsSegura = $derived(Math.min(Math.max(1, paginaDocs), totalPaginasDocs));
	const documentosPaginados = $derived(
		documentosFiltrados.slice(
			(paginaDocsSegura - 1) * POR_PAGINA,
			paginaDocsSegura * POR_PAGINA
		)
	);

	function gerarPaginas(atual: number, total: number): number[] {
		const lista: number[] = [];
		const ini = Math.max(1, atual - 2);
		const fim = Math.min(total, atual + 2);
		for (let p = ini; p <= fim; p++) lista.push(p);
		return lista;
	}

	async function criarNovaCaixa() {
		const nome = novaCaixaNome.trim();
		if (!nome) return;
		feedback = null;
		try {
			const res = await fetch('/api/caixas', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ nome })
			});
			if (!res.ok) {
				const err = (await res.json().catch(() => ({}))) as { message?: string };
				throw new Error(err.message || 'Erro ao criar caixa.');
			}
			novaCaixaNome = '';
			feedback = { tipo: 'ok', texto: `Caixa "${nome}" criada com sucesso.` };
			await invalidateAll();
		} catch (e: unknown) {
			feedback = {
				tipo: 'erro',
				texto: e instanceof Error ? e.message : 'Erro ao criar caixa.'
			};
		}
	}

	async function salvarRenomearCaixa(id: number) {
		const nome = editandoCaixaNome.trim();
		if (!nome) return;
		feedback = null;
		try {
			const res = await fetch('/api/caixas', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id, nome })
			});
			if (!res.ok) {
				const err = (await res.json().catch(() => ({}))) as { message?: string };
				throw new Error(err.message || 'Erro ao renomear caixa.');
			}
			editandoCaixaId = null;
			editandoCaixaNome = '';
			feedback = { tipo: 'ok', texto: 'Nome da caixa atualizado com sucesso.' };
			await invalidateAll();
		} catch (e: unknown) {
			feedback = {
				tipo: 'erro',
				texto: e instanceof Error ? e.message : 'Erro ao renomear caixa.'
			};
		}
	}

	async function excluirCaixa(
		id: number,
		nome: string,
		totalBens: number,
		excluirBensJunto: boolean
	) {
		const msg = excluirBensJunto
			? `ATENÇÃO: Confirma excluir a caixa "${nome}" E TAMBÉM EXCLUIR os ${totalBens} bem(ns) dentro dela?`
			: totalBens > 0
				? `Confirma excluir a caixa "${nome}"? Os ${totalBens} bem(ns) serão mantidos no sistema como "Sem caixa".`
				: `Confirma excluir a caixa vazia "${nome}"?`;

		if (!confirm(msg)) return;

		feedback = null;
		try {
			const res = await fetch('/api/caixas', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					id,
					acaoBens: excluirBensJunto ? 'EXCLUIR' : 'DESVINCULAR'
				})
			});
			if (!res.ok) throw new Error('Erro ao excluir caixa.');

			confirmandoExclusaoCaixaId = null;
			feedback = { tipo: 'ok', texto: `Caixa "${nome}" excluída com sucesso.` };
			await invalidateAll();
		} catch (e: unknown) {
			feedback = {
				tipo: 'erro',
				texto: e instanceof Error ? e.message : 'Erro ao excluir caixa.'
			};
		}
	}

	async function excluirDocumento(
		docId: number,
		docTipo: string,
		procLabel: string,
		nomeArquivo: string,
		qtdBens: number
	) {
		const labelTipo = docTipo === 'APREENSAO' ? 'apreensão' : 'restituição';
		const msg =
			docTipo === 'APREENSAO'
				? `Confirma a exclusão da apreensão "${procLabel}" (${nomeArquivo}) e de seus ${qtdBens} bem(ns)? O PDF poderá ser importado novamente depois.`
				: `Confirma a exclusão do termo de restituição "${procLabel}" (${nomeArquivo})? Os bens restituídos por ele voltarão ao status "Em depósito".`;

		if (!confirm(msg)) return;

		feedback = null;
		try {
			const res = await fetch(`/api/documentos/${docId}`, {
				method: 'DELETE'
			});
			if (!res.ok) throw new Error(`Falha ao excluir ${labelTipo}.`);

			feedback = {
				tipo: 'ok',
				texto: `Documento de ${labelTipo} ${procLabel} (${nomeArquivo}) excluído com sucesso.`
			};
			await invalidateAll();
		} catch (e: unknown) {
			feedback = {
				tipo: 'erro',
				texto: e instanceof Error ? e.message : `Erro ao excluir ${labelTipo}.`
			};
		}
	}
</script>

<div class="page-head">
	<h1>Gerenciar Caixas e Apreensões</h1>
	<p class="sub">
		Crie, renomeie ou exclua caixas físicas do depósito e gerencie os documentos de apreensão e restituição importados.
	</p>
</div>

{#if feedback}
	<div class="alert {feedback.tipo === 'ok' ? 'success' : 'error'}">
		<span>{feedback.texto}</span>
		<button type="button" class="close-btn" onclick={() => (feedback = null)}>×</button>
	</div>
{/if}

<section class="panel">
	<div class="panel-top">
		<div class="panel-title">
			<div class="title-row">
				<h2>Caixas Físicas</h2>
				<span class="count-pill">{data.caixas.length}</span>
			</div>
			<p>Organize os locais físicos de armazenamento dos bens apreendidos.</p>
		</div>

		<div class="toolbar">
			<input
				type="search"
				class="search-input"
				bind:value={buscaCaixa}
				oninput={() => (paginaCaixas = 1)}
				placeholder="Pesquisar caixa pelo nome..."
			/>

			<div class="criar-caixa-bar">
				<input
					type="text"
					bind:value={novaCaixaNome}
					placeholder="Nova caixa (ex: Caixa 02 - Operação X)"
					onkeydown={(e) => e.key === 'Enter' && criarNovaCaixa()}
				/>
				<button type="button" onclick={criarNovaCaixa}>+ Criar Caixa</button>
			</div>
		</div>
	</div>

	<div class="table-wrap">
		<table>
			<thead>
				<tr>
					<th>Nome da Caixa</th>
					<th class="col-metric">Total de Bens</th>
					<th class="col-metric">Em Depósito</th>
					<th class="col-metric">Restituídos</th>
					<th class="col-actions">Ações</th>
				</tr>
			</thead>
			<tbody>
				{#if caixasPaginadas.length === 0}
					<tr>
						<td colspan="5" class="empty">Nenhuma caixa encontrada.</td>
					</tr>
				{/if}
				{#each caixasPaginadas as cx (cx.id)}
					<tr>
						<td>
							{#if editandoCaixaId === cx.id}
								<div class="inline-edit">
									<input
										type="text"
										bind:value={editandoCaixaNome}
										onkeydown={(e) => e.key === 'Enter' && salvarRenomearCaixa(cx.id)}
									/>
									<button
										type="button"
										class="btn-action primary"
										onclick={() => salvarRenomearCaixa(cx.id)}
									>
										Salvar
									</button>
									<button
										type="button"
										class="btn-action"
										onclick={() => (editandoCaixaId = null)}
									>
										Cancelar
									</button>
								</div>
							{:else}
								<div class="caixa-name-cell">
									<span class="box-icon">📦</span>
									<div>
										<strong class="caixa-title">{cx.nome}</strong>
										<span class="caixa-sub">{cx.setor ?? 'Depósito'}</span>
									</div>
								</div>
							{/if}
						</td>
						<td class="col-metric">
							<span class="metric-pill slate">{cx.total_bens}</span>
						</td>
						<td class="col-metric">
							<span class="metric-pill {cx.em_deposito > 0 ? 'amber' : 'muted-pill'}">
								{cx.em_deposito}
							</span>
						</td>
						<td class="col-metric">
							<span class="metric-pill {cx.restituidos > 0 ? 'green' : 'muted-pill'}">
								{cx.restituidos}
							</span>
						</td>
						<td class="col-actions">
							{#if confirmandoExclusaoCaixaId === cx.id}
								<div class="confirm-delete-row">
									<span class="confirm-label">Excluir:</span>
									<button
										type="button"
										class="btn-action warn"
										onclick={() => excluirCaixa(cx.id, cx.nome, cx.total_bens, false)}
										title="Exclui apenas a caixa e mantém os bens sem caixa"
									>
										Só a caixa (manter bens)
									</button>
									<button
										type="button"
										class="btn-action danger"
										onclick={() => excluirCaixa(cx.id, cx.nome, cx.total_bens, true)}
										title="Exclui a caixa e todos os bens dentro dela"
									>
										Caixa + {cx.total_bens} bem(ns)
									</button>
									<button
										type="button"
										class="btn-action"
										onclick={() => (confirmandoExclusaoCaixaId = null)}
									>
										Cancelar
									</button>
								</div>
							{:else}
								<div class="actions-row">
									<a href="/?caixa={cx.id}" class="btn-action link">Ver itens</a>
									<button
										type="button"
										class="btn-action"
										onclick={() => {
											confirmandoExclusaoCaixaId = null;
											editandoCaixaId = cx.id;
											editandoCaixaNome = cx.nome;
										}}
									>
										Renomear
									</button>
									{#if cx.total_bens === 0}
										<button
											type="button"
											class="btn-action danger"
											onclick={() => excluirCaixa(cx.id, cx.nome, 0, false)}
										>
											Excluir
										</button>
									{:else}
										<button
											type="button"
											class="btn-action danger"
											onclick={() => {
												editandoCaixaId = null;
												confirmandoExclusaoCaixaId = cx.id;
											}}
										>
											Excluir...
										</button>
									{/if}
								</div>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	{#if caixasFiltradas.length > POR_PAGINA}
		<nav class="paginacao" aria-label="Paginação de caixas">
			<span class="paginacao-info">
				Exibindo
				<strong>{(paginaCaixasSegura - 1) * POR_PAGINA + 1}–{Math.min(paginaCaixasSegura * POR_PAGINA, caixasFiltradas.length)}</strong>
				de <strong>{caixasFiltradas.length}</strong> caixas (Página {paginaCaixasSegura} de {totalPaginasCaixas})
			</span>
			<div class="paginacao-botoes">
				<button
					type="button"
					class="page-btn"
					disabled={paginaCaixasSegura <= 1}
					onclick={() => (paginaCaixas = paginaCaixasSegura - 1)}
				>
					← Anterior
				</button>
				{#each gerarPaginas(paginaCaixasSegura, totalPaginasCaixas) as p}
					<button
						type="button"
						class="page-btn"
						class:active={p === paginaCaixasSegura}
						onclick={() => (paginaCaixas = p)}
					>
						{p}
					</button>
				{/each}
				<button
					type="button"
					class="page-btn"
					disabled={paginaCaixasSegura >= totalPaginasCaixas}
					onclick={() => (paginaCaixas = paginaCaixasSegura + 1)}
				>
					Próxima →
				</button>
			</div>
		</nav>
	{/if}
</section>

<section class="panel">
	<div class="panel-top">
		<div class="panel-title">
			<div class="title-row">
				<h2>Documentos Importados — Apreensões e Restituições</h2>
				<span class="count-pill">{data.documentos.length}</span>
			</div>
			<p>
				Ao excluir uma apreensão, os bens vinculados a ela são removidos e o arquivo PDF fica liberado para reimportação.
			</p>
		</div>

		{#if data.documentos.length > 0}
			<div class="toolbar">
				<input
					type="search"
					class="search-input"
					bind:value={buscaDoc}
					oninput={() => (paginaDocs = 1)}
					placeholder="Pesquisar por BO/IP, arquivo PDF, caixa ou parte..."
				/>
			</div>
		{/if}
	</div>

	<div class="table-wrap">
		<table>
			<thead>
				<tr>
					<th>Tipo</th>
					<th>Procedimento</th>
					<th>Arquivo PDF</th>
					<th>Data do Ato</th>
					<th>Caixa(s)</th>
					<th class="col-metric">Bens</th>
					<th class="col-actions">Ações</th>
				</tr>
			</thead>
			<tbody>
				{#if documentosPaginados.length === 0}
					<tr>
						<td colspan="7" class="empty">Nenhum documento importado encontrado.</td>
					</tr>
				{/if}
				{#each documentosPaginados as doc (doc.id)}
					<tr>
						<td>
							<span class="badge {doc.doc_tipo === 'APREENSAO' ? 'blue' : 'green'}">
								{doc.doc_tipo === 'APREENSAO' ? 'APREENSÃO' : 'RESTITUIÇÃO'}
							</span>
						</td>
						<td>
							<strong>{doc.proc_tipo} {doc.proc_numero}</strong>
							{#if doc.operacao}
								<div class="muted">{doc.operacao}</div>
							{/if}
						</td>
						<td>
							<div class="file-name">{doc.nome_arquivo}</div>
							{#if doc.parte_nome}
								<div class="muted">{doc.parte_nome}</div>
							{/if}
						</td>
						<td>{doc.data_ato ?? '-'}</td>
						<td>
							{#if doc.caixas_nomes}
								<span class="caixa-badge">{doc.caixas_nomes}</span>
							{:else}
								<span class="muted">Sem caixa</span>
							{/if}
						</td>
						<td class="col-metric">
							<span class="metric-pill slate">{doc.qtd_bens}</span>
						</td>
						<td class="col-actions">
							<div class="actions-row">
								<a
									href="/?procedimento={doc.proc_id}"
									class="btn-action icon-btn link"
									title="Ver procedimento ({doc.proc_tipo} {doc.proc_numero})"
									aria-label="Ver procedimento"
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="16"
										height="16"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									>
										<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
										<circle cx="12" cy="12" r="3" />
									</svg>
								</a>
								<button
									type="button"
									class="btn-action danger"
									onclick={() =>
										excluirDocumento(
											doc.id,
											doc.doc_tipo,
											`${doc.proc_tipo} ${doc.proc_numero}`,
											doc.nome_arquivo,
											doc.qtd_bens
										)}
								>
									Excluir {doc.doc_tipo === 'APREENSAO' ? 'Apreensão' : 'Restituição'}
								</button>
							</div>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	{#if documentosFiltrados.length > POR_PAGINA}
		<nav class="paginacao" aria-label="Paginação de documentos">
			<span class="paginacao-info">
				Exibindo
				<strong>{(paginaDocsSegura - 1) * POR_PAGINA + 1}–{Math.min(paginaDocsSegura * POR_PAGINA, documentosFiltrados.length)}</strong>
				de <strong>{documentosFiltrados.length}</strong> documentos (Página {paginaDocsSegura} de {totalPaginasDocs})
			</span>
			<div class="paginacao-botoes">
				<button
					type="button"
					class="page-btn"
					disabled={paginaDocsSegura <= 1}
					onclick={() => (paginaDocs = paginaDocsSegura - 1)}
				>
					← Anterior
				</button>
				{#each gerarPaginas(paginaDocsSegura, totalPaginasDocs) as p}
					<button
						type="button"
						class="page-btn"
						class:active={p === paginaDocsSegura}
						onclick={() => (paginaDocs = p)}
					>
						{p}
					</button>
				{/each}
				<button
					type="button"
					class="page-btn"
					disabled={paginaDocsSegura >= totalPaginasDocs}
					onclick={() => (paginaDocs = paginaDocsSegura + 1)}
				>
					Próxima →
				</button>
			</div>
		</nav>
	{/if}
</section>

<style>
	.page-head {
		margin-bottom: 1.25rem;
	}
	h1 {
		margin: 0 0 0.25rem;
		font-size: 1.5rem;
		color: #0f172a;
	}
	.sub {
		margin: 0;
		color: #475569;
		font-size: 0.95rem;
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
	.panel {
		background: #fff;
		border: 1px solid #e2e8f0;
		border-radius: 12px;
		padding: 1.35rem;
		margin-bottom: 1.5rem;
		box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
	}
	.panel-top {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		margin-bottom: 1.1rem;
	}
	.title-row {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		margin-bottom: 0.2rem;
	}
	.panel-title h2 {
		margin: 0;
		font-size: 1.15rem;
		color: #0f172a;
	}
	.count-pill {
		background: #e2e8f0;
		color: #334155;
		font-size: 0.78rem;
		font-weight: 700;
		padding: 0.15rem 0.55rem;
		border-radius: 999px;
	}
	.panel-title p {
		margin: 0;
		font-size: 0.87rem;
		color: #64748b;
	}
	.toolbar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.85rem;
		flex-wrap: wrap;
		background: #f8fafc;
		padding: 0.75rem;
		border-radius: 8px;
		border: 1px solid #e2e8f0;
	}
	.search-input {
		flex: 1;
		min-width: 240px;
		max-width: 380px;
		padding: 0.55rem 0.75rem;
		border: 1px solid #cbd5e1;
		border-radius: 6px;
		font-size: 0.88rem;
		background: #fff;
	}
	.criar-caixa-bar {
		display: flex;
		gap: 0.5rem;
		flex: 1;
		min-width: 280px;
		max-width: 440px;
	}
	.criar-caixa-bar input {
		flex: 1;
		padding: 0.55rem 0.75rem;
		border: 1px solid #cbd5e1;
		border-radius: 6px;
		font-size: 0.88rem;
		background: #fff;
	}
	.criar-caixa-bar button {
		background: #2563eb;
		color: #fff;
		border: none;
		padding: 0.55rem 1rem;
		border-radius: 6px;
		font-weight: 600;
		font-size: 0.88rem;
		cursor: pointer;
		white-space: nowrap;
	}
	.criar-caixa-bar button:hover {
		background: #1d4ed8;
	}
	.table-wrap {
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
		padding: 0.8rem 1rem;
		border-top: 1px solid #e2e8f0;
		vertical-align: middle;
	}
	th {
		background: #f8fafc;
		color: #475569;
		font-weight: 600;
		font-size: 0.82rem;
		text-transform: uppercase;
		letter-spacing: 0.02em;
		border-top: none;
	}
	tbody tr:hover {
		background: #f8fafc;
	}
	.col-metric {
		text-align: center;
		width: 130px;
	}
	.col-actions {
		text-align: right;
		white-space: nowrap;
		width: 1%;
	}
	.caixa-name-cell {
		display: flex;
		align-items: center;
		gap: 0.65rem;
	}
	.box-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 34px;
		height: 34px;
		background: #eff6ff;
		border: 1px solid #bfdbfe;
		border-radius: 8px;
		font-size: 1rem;
		flex-shrink: 0;
	}
	.caixa-title {
		display: block;
		font-size: 0.94rem;
		color: #0f172a;
	}
	.caixa-sub {
		display: block;
		font-size: 0.76rem;
		color: #64748b;
	}
	.metric-pill {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 32px;
		padding: 0.22rem 0.65rem;
		border-radius: 999px;
		font-weight: 700;
		font-size: 0.83rem;
	}
	.metric-pill.slate {
		background: #f1f5f9;
		color: #0f172a;
		border: 1px solid #cbd5e1;
	}
	.metric-pill.amber {
		background: #fef3c7;
		color: #92400e;
		border: 1px solid #fde68a;
	}
	.metric-pill.green {
		background: #dcfce7;
		color: #166534;
		border: 1px solid #bbf7d0;
	}
	.metric-pill.muted-pill {
		background: #f8fafc;
		color: #94a3b8;
		border: 1px solid #e2e8f0;
		font-weight: 500;
	}
	.caixa-badge {
		display: inline-block;
		background: #f3e8ff;
		color: #6b21a8;
		font-weight: 600;
		font-size: 0.78rem;
		padding: 0.2rem 0.55rem;
		border-radius: 6px;
	}
	.file-name {
		font-weight: 500;
		color: #1e293b;
	}
	.empty {
		text-align: center;
		padding: 2rem;
		color: #64748b;
	}
	.muted {
		font-size: 0.78rem;
		color: #64748b;
	}
	.actions-row,
	.confirm-delete-row,
	.inline-edit {
		display: inline-flex;
		gap: 0.4rem;
		align-items: center;
		flex-wrap: nowrap;
	}
	.confirm-label {
		font-size: 0.78rem;
		font-weight: 700;
		color: #991b1b;
		margin-right: 0.15rem;
	}
	.inline-edit input {
		padding: 0.4rem 0.6rem;
		border: 1px solid #93c5fd;
		border-radius: 6px;
		font-size: 0.86rem;
	}
	.btn-action {
		padding: 0.38rem 0.7rem;
		font-size: 0.8rem;
		border-radius: 6px;
		border: 1px solid #cbd5e1;
		background: #fff;
		color: #334155;
		cursor: pointer;
		font-weight: 600;
		text-decoration: none;
		display: inline-flex;
		align-items: center;
		white-space: nowrap;
		transition: background 0.12s, border-color 0.12s;
	}
	.btn-action:hover {
		background: #f1f5f9;
	}
	.btn-action.icon-btn {
		padding: 0.38rem 0.52rem;
		justify-content: center;
	}
	.btn-action.link {
		background: #eff6ff;
		border-color: #bfdbfe;
		color: #1d4ed8;
	}
	.btn-action.link:hover {
		background: #dbeafe;
	}
	.btn-action.primary {
		background: #2563eb;
		color: #fff;
		border-color: #2563eb;
	}
	.btn-action.warn {
		background: #fef3c7;
		color: #92400e;
		border-color: #fcd34d;
	}
	.btn-action.danger {
		background: #fff1f2;
		color: #be123c;
		border-color: #fecdd3;
	}
	.btn-action.danger:hover {
		background: #ffe4e6;
	}
	.badge {
		display: inline-block;
		padding: 0.2rem 0.55rem;
		border-radius: 999px;
		font-size: 0.74rem;
		font-weight: 700;
	}
	.badge.blue {
		background: #dbeafe;
		color: #1d4ed8;
	}
	.badge.green {
		background: #dcfce7;
		color: #15803d;
	}
	.paginacao {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		flex-wrap: wrap;
		padding-top: 0.9rem;
		margin-top: 0.9rem;
		border-top: 1px solid #e2e8f0;
	}
	.paginacao-info {
		font-size: 0.84rem;
		color: #475569;
	}
	.paginacao-botoes {
		display: flex;
		align-items: center;
		gap: 0.35rem;
	}
	.page-btn {
		padding: 0.38rem 0.7rem;
		border: 1px solid #cbd5e1;
		border-radius: 6px;
		background: #fff;
		color: #1e293b;
		font-size: 0.82rem;
		font-weight: 600;
		cursor: pointer;
	}
	.page-btn:hover:not(:disabled) {
		background: #eff6ff;
		border-color: #93c5fd;
		color: #1d4ed8;
	}
	.page-btn.active {
		background: #2563eb;
		border-color: #2563eb;
		color: #fff;
	}
	.page-btn:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
</style>
