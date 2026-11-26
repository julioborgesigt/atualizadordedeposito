<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { confirmarAcao } from '$lib/stores/confirmacao.svelte';

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
		const ok = await confirmarAcao({
			titulo: 'Confirmar criação de caixa',
			mensagem: `Deseja criar a nova caixa "${nome}"?`,
			textoConfirmar: 'Criar caixa'
		});
		if (!ok) return;
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
		const ok = await confirmarAcao({
			titulo: 'Confirmar renomeação',
			mensagem: `Deseja alterar o nome da caixa para "${nome}"?`,
			textoConfirmar: 'Salvar nome'
		});
		if (!ok) return;
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

		const ok = await confirmarAcao({
			titulo: excluirBensJunto ? 'Excluir caixa e bens' : 'Confirmar exclusão de caixa',
			mensagem: msg,
			textoConfirmar: 'Excluir',
			perigoso: true
		});
		if (!ok) return;

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

		const ok = await confirmarAcao({
			titulo: `Excluir documento de ${labelTipo}`,
			mensagem: msg,
			textoConfirmar: 'Excluir documento',
			perigoso: true
		});
		if (!ok) return;

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

<svelte:head>
	<title>Caixas e Apreensões — Custódia PCCE</title>
</svelte:head>

<div class="page-head">
	<div>
		<h1>Caixas e Apreensões</h1>
		<p class="sub">
			Crie, renomeie ou exclua caixas físicas do depósito e gerencie os documentos de apreensão e restituição importados.
		</p>
	</div>
</div>

{#if feedback}
	<div class="alert {feedback.tipo === 'ok' ? 'success' : 'error'}" role="status">
		<span>{feedback.texto}</span>
		<button type="button" class="close-btn" aria-label="Fechar aviso" onclick={() => (feedback = null)}>×</button>
	</div>
{/if}

<section class="panel" aria-labelledby="titulo-caixas">
	<div class="panel-top">
		<div class="panel-title">
			<div class="title-row">
				<h2 id="titulo-caixas">Caixas físicas</h2>
				<span class="count-pill">{data.caixas.length}</span>
			</div>
			<p>Organize os locais físicos de armazenamento dos bens apreendidos.</p>
		</div>

		<div class="toolbar">
			<div class="search-wrap">
				<svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
				<input
					id="busca-caixa"
					type="search"
					bind:value={buscaCaixa}
					oninput={() => (paginaCaixas = 1)}
					placeholder="Pesquisar caixa pelo nome..."
					aria-label="Pesquisar caixa"
				/>
			</div>

			<div class="criar-caixa-bar">
				<input
					id="nova-caixa"
					type="text"
					bind:value={novaCaixaNome}
					placeholder="Nova caixa (ex: Caixa 02 - Operação X)"
					aria-label="Nome da nova caixa"
					onkeydown={(e) => e.key === 'Enter' && criarNovaCaixa()}
				/>
				<button type="button" class="btn btn-primary" onclick={criarNovaCaixa} disabled={!novaCaixaNome.trim()}>
					<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14" /></svg>
					Criar caixa
				</button>
			</div>
		</div>
	</div>

	<div class="table-wrap cards">
		<table class="table caixas-table">
			<thead>
				<tr>
					<th>Nome da caixa</th>
					<th class="col-metric">Total</th>
					<th class="col-metric">Em depósito</th>
					<th class="col-metric">Restituídos</th>
					<th class="col-actions">Ações</th>
				</tr>
			</thead>
			<tbody>
				{#if caixasPaginadas.length === 0}
					<tr class="row-empty">
						<td colspan="5" class="empty">Nenhuma caixa encontrada.</td>
					</tr>
				{/if}
				{#each caixasPaginadas as cx (cx.id)}
					<tr>
						<td class="c-nome">
							{#if editandoCaixaId === cx.id}
								<div class="inline-edit">
									<input
										type="text"
										bind:value={editandoCaixaNome}
										aria-label="Novo nome da caixa"
										onkeydown={(e) => e.key === 'Enter' && salvarRenomearCaixa(cx.id)}
									/>
									<div class="inline-edit-btns">
										<button type="button" class="btn btn-primary btn-sm" onclick={() => salvarRenomearCaixa(cx.id)}>
											Salvar
										</button>
										<button type="button" class="btn btn-secondary btn-sm" onclick={() => (editandoCaixaId = null)}>
											Cancelar
										</button>
									</div>
								</div>
							{:else}
								<div class="caixa-name-cell">
									<span class="box-icon" aria-hidden="true">
										<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" /><path d="m3 8 9 5 9-5M12 13v8" /></svg>
									</span>
									<div class="caixa-name-text">
										<strong class="caixa-title">{cx.nome}</strong>
										<span class="caixa-sub">{cx.setor ?? 'Depósito'}</span>
									</div>
								</div>
							{/if}
						</td>
						<td class="col-metric c-total" data-label="Total">
							<span class="metric-pill slate">{cx.total_bens}</span>
						</td>
						<td class="col-metric c-dep" data-label="Em depósito">
							<span class="metric-pill {cx.em_deposito > 0 ? 'amber' : 'muted-pill'}">{cx.em_deposito}</span>
						</td>
						<td class="col-metric c-rest" data-label="Restituídos">
							<span class="metric-pill {cx.restituidos > 0 ? 'green' : 'muted-pill'}">{cx.restituidos}</span>
						</td>
						<td class="col-actions c-acoes">
							{#if confirmandoExclusaoCaixaId === cx.id}
								<div class="confirm-delete-row">
									<span class="confirm-label">Excluir caixa:</span>
									<button
										type="button"
										class="btn btn-warn btn-sm"
										onclick={() => excluirCaixa(cx.id, cx.nome, cx.total_bens, false)}
										title="Exclui apenas a caixa e mantém os bens sem caixa"
									>
										Só a caixa (manter bens)
									</button>
									<button
										type="button"
										class="btn btn-danger-solid btn-sm"
										onclick={() => excluirCaixa(cx.id, cx.nome, cx.total_bens, true)}
										title="Exclui a caixa e todos os bens dentro dela"
									>
										Caixa + {cx.total_bens} bem(ns)
									</button>
									<button type="button" class="btn btn-ghost btn-sm" onclick={() => (confirmandoExclusaoCaixaId = null)}>
										Cancelar
									</button>
								</div>
							{:else}
								<div class="actions-row">
									<a href="/?caixa={cx.id}" class="btn btn-soft btn-sm">Ver itens</a>
									<button
										type="button"
										class="btn btn-secondary btn-sm"
										onclick={() => {
											confirmandoExclusaoCaixaId = null;
											editandoCaixaId = cx.id;
											editandoCaixaNome = cx.nome;
										}}
									>
										Renomear
									</button>
									{#if cx.total_bens === 0}
										<button type="button" class="btn btn-danger btn-sm" onclick={() => excluirCaixa(cx.id, cx.nome, 0, false)}>
											Excluir
										</button>
									{:else}
										<button
											type="button"
											class="btn btn-danger btn-sm"
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
				de <strong>{caixasFiltradas.length}</strong> caixas
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
						class="page-btn num"
						class:active={p === paginaCaixasSegura}
						aria-current={p === paginaCaixasSegura ? 'page' : undefined}
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

<section class="panel" aria-labelledby="titulo-docs">
	<div class="panel-top">
		<div class="panel-title">
			<div class="title-row">
				<h2 id="titulo-docs">Documentos importados</h2>
				<span class="count-pill">{data.documentos.length}</span>
			</div>
			<p>
				Apreensões e restituições. Ao excluir uma apreensão, os bens vinculados são removidos e o PDF fica liberado para reimportação.
			</p>
		</div>

		{#if data.documentos.length > 0}
			<div class="toolbar">
				<div class="search-wrap wide">
					<svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
					<input
						id="busca-documento"
						type="search"
						bind:value={buscaDoc}
						oninput={() => (paginaDocs = 1)}
						placeholder="Pesquisar por BO/IP, arquivo PDF, caixa ou parte..."
						aria-label="Pesquisar documento"
					/>
				</div>
			</div>
		{/if}
	</div>

	<div class="table-wrap cards">
		<table class="table docs-table">
			<thead>
				<tr>
					<th>Tipo</th>
					<th>Procedimento</th>
					<th>Arquivo PDF</th>
					<th>Data do ato</th>
					<th>Caixa(s)</th>
					<th class="col-metric">Bens</th>
					<th class="col-actions">Ações</th>
				</tr>
			</thead>
			<tbody>
				{#if documentosPaginados.length === 0}
					<tr class="row-empty">
						<td colspan="7" class="empty">Nenhum documento importado encontrado.</td>
					</tr>
				{/if}
				{#each documentosPaginados as doc (doc.id)}
					<tr>
						<td class="d-tipo">
							<span class="badge {doc.doc_tipo === 'APREENSAO' ? 'blue' : 'green'}">
								{doc.doc_tipo === 'APREENSAO' ? 'APREENSÃO' : 'RESTITUIÇÃO'}
							</span>
						</td>
						<td class="d-proc">
							<strong class="proc">{doc.proc_tipo} {doc.proc_numero}</strong>
							{#if doc.operacao}
								<div class="muted">{doc.operacao}</div>
							{/if}
						</td>
						<td class="d-arq" data-label="Arquivo">
							<div class="file-name">{doc.nome_arquivo}</div>
							{#if doc.parte_nome}
								<div class="muted">{doc.parte_nome}</div>
							{/if}
						</td>
						<td class="d-data" data-label="Data do ato">{doc.data_ato ?? '—'}</td>
						<td class="d-caixa" data-label="Caixa(s)">
							{#if doc.caixas_nomes}
								<span class="badge purple caixa-badge">{doc.caixas_nomes}</span>
							{:else}
								<span class="muted">Sem caixa</span>
							{/if}
						</td>
						<td class="col-metric d-bens" data-label="Bens">
							<span class="metric-pill slate">{doc.qtd_bens}</span>
						</td>
						<td class="col-actions d-acoes">
							<div class="actions-row">
								<a
									href="/?procedimento={doc.proc_id}"
									class="btn btn-soft btn-sm btn-icon"
									title="Ver procedimento ({doc.proc_tipo} {doc.proc_numero})"
									aria-label="Ver procedimento"
								>
									<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
										<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
										<circle cx="12" cy="12" r="3" />
									</svg>
								</a>
								<button
									type="button"
									class="btn btn-danger btn-sm"
									onclick={() =>
										excluirDocumento(
											doc.id,
											doc.doc_tipo,
											`${doc.proc_tipo} ${doc.proc_numero}`,
											doc.nome_arquivo,
											doc.qtd_bens
										)}
								>
									Excluir {doc.doc_tipo === 'APREENSAO' ? 'apreensão' : 'restituição'}
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
				de <strong>{documentosFiltrados.length}</strong> documentos
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
						class="page-btn num"
						class:active={p === paginaDocsSegura}
						aria-current={p === paginaDocsSegura ? 'page' : undefined}
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
	.panel-top {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
		margin-bottom: 1rem;
	}
	.title-row {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		margin-bottom: 0.2rem;
	}
	.panel-title h2 {
		margin: 0;
		font-size: 1.1rem;
		font-weight: 700;
	}
	.panel-title p {
		margin: 0;
		font-size: 0.86rem;
		color: var(--text-2);
	}

	.toolbar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.75rem;
		flex-wrap: wrap;
	}
	.search-wrap {
		position: relative;
		flex: 1 1 260px;
		max-width: 380px;
	}
	.search-wrap.wide {
		max-width: 520px;
	}
	.search-wrap input {
		width: 100%;
		padding-left: 2.2rem;
	}
	.search-icon {
		position: absolute;
		left: 0.75rem;
		top: 50%;
		transform: translateY(-50%);
		color: var(--text-3);
		pointer-events: none;
	}
	.criar-caixa-bar {
		display: flex;
		gap: 0.5rem;
		flex: 1 1 320px;
		max-width: 460px;
	}
	.criar-caixa-bar input {
		flex: 1;
		min-width: 0;
	}

	.col-metric {
		text-align: center !important;
		width: 120px;
	}
	.col-actions {
		text-align: right !important;
		white-space: nowrap;
		width: 1%;
	}

	.caixa-name-cell {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		min-width: 0;
	}
	.box-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 38px;
		height: 38px;
		flex-shrink: 0;
		border-radius: 10px;
		background: linear-gradient(145deg, var(--primary-soft), var(--primary-soft-2));
		color: var(--primary);
	}
	.caixa-name-text {
		min-width: 0;
	}
	.caixa-title {
		display: block;
		font-size: 0.93rem;
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.caixa-sub {
		display: block;
		font-size: 0.76rem;
		color: var(--text-3);
	}

	.metric-pill {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 34px;
		padding: 0.2rem 0.65rem;
		border-radius: var(--radius-pill);
		font-weight: 700;
		font-size: 0.82rem;
		font-variant-numeric: tabular-nums;
	}
	.metric-pill.slate {
		background: var(--surface-3);
		color: var(--text);
	}
	.metric-pill.amber {
		background: var(--warning-soft);
		color: var(--warning);
	}
	.metric-pill.green {
		background: var(--success-soft);
		color: var(--success);
	}
	.metric-pill.muted-pill {
		background: transparent;
		color: var(--text-3);
		font-weight: 500;
	}

	.caixa-badge {
		white-space: normal;
		letter-spacing: 0;
		font-weight: 600;
	}
	.proc {
		font-weight: 600;
		white-space: nowrap;
	}
	.file-name {
		font-weight: 500;
		overflow-wrap: anywhere;
	}

	.actions-row,
	.confirm-delete-row {
		display: inline-flex;
		gap: 0.4rem;
		align-items: center;
		justify-content: flex-end;
	}
	.confirm-delete-row {
		flex-wrap: wrap;
	}
	.confirm-label {
		font-size: 0.78rem;
		font-weight: 700;
		color: var(--danger);
	}
	.inline-edit {
		display: flex;
		gap: 0.4rem;
		align-items: center;
		flex-wrap: wrap;
	}
	.inline-edit input {
		flex: 1 1 180px;
		min-height: 34px;
	}
	.inline-edit-btns {
		display: flex;
		gap: 0.4rem;
	}

	@media (max-width: 720px) {
		.search-wrap,
		.search-wrap.wide,
		.criar-caixa-bar {
			max-width: none;
			flex-basis: 100%;
		}
		.criar-caixa-bar {
			flex-direction: column;
		}

		/* Cards de caixa */
		.caixas-table tr:not(.row-empty) {
			display: grid !important;
			grid-template-columns: repeat(3, minmax(0, 1fr));
			grid-template-areas:
				'nome nome nome'
				'total dep rest'
				'acoes acoes acoes';
			gap: 0.5rem;
		}
		.caixas-table .c-nome {
			grid-area: nome;
		}
		.caixas-table .c-total {
			grid-area: total;
		}
		.caixas-table .c-dep {
			grid-area: dep;
		}
		.caixas-table .c-rest {
			grid-area: rest;
		}
		.caixas-table .col-metric {
			width: auto;
			background: var(--surface-2);
			border: 1px solid var(--border) !important;
			border-radius: var(--radius-sm);
			padding: 0.45rem 0.3rem !important;
		}
		.caixas-table .c-acoes {
			grid-area: acoes;
			width: auto;
			text-align: left !important;
			white-space: normal;
		}

		/* Cards de documento */
		.docs-table tr:not(.row-empty) {
			display: grid !important;
			grid-template-columns: minmax(0, 1fr) auto;
			grid-template-areas:
				'tipo bens'
				'proc proc'
				'arq arq'
				'data caixa'
				'acoes acoes';
			column-gap: 0.75rem;
			row-gap: 0.25rem;
		}
		.docs-table .d-tipo {
			grid-area: tipo;
		}
		.docs-table .d-proc {
			grid-area: proc;
		}
		.docs-table .d-arq {
			grid-area: arq;
		}
		.docs-table .d-data {
			grid-area: data;
		}
		.docs-table .d-caixa {
			grid-area: caixa;
			min-width: 0;
		}
		.docs-table .d-bens {
			grid-area: bens;
			width: auto;
			display: flex !important;
			align-items: center;
			gap: 0.35rem;
			justify-content: flex-end;
		}
		.docs-table .d-bens::before {
			margin: 0 !important;
		}
		.docs-table .d-acoes {
			grid-area: acoes;
			width: auto;
			padding-top: 0.6rem !important;
			margin-top: 0.3rem;
			border-top: 1px solid var(--border) !important;
		}

		.actions-row,
		.confirm-delete-row {
			display: flex;
			width: 100%;
			flex-wrap: wrap;
		}
		.actions-row > :global(*),
		.confirm-delete-row > .btn {
			flex: 1 1 auto;
		}
		.actions-row > .btn-icon {
			flex: 0 0 auto;
		}
		.confirm-label {
			width: 100%;
		}
		.inline-edit-btns {
			width: 100%;
		}
		.inline-edit-btns > .btn {
			flex: 1;
		}
	}
</style>
