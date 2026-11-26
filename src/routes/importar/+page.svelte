<script lang="ts">
	import { goto } from '$app/navigation';
	import { extrairTextoPdf } from '$lib/pdf/extractText';
	import { parseRelatorioPdf } from '$lib/pdf/parser';
	import type { DocumentoParseado, PreviewDocumento } from '$lib/types';
	import CaixaSelect from '$lib/components/CaixaSelect.svelte';

	let { data } = $props();

	let carregando = $state(false);
	let salvando = $state(false);
	let erro = $state<string | null>(null);
	let mensagemSucesso = $state<string | null>(null);

	let caixasExistentes = $state<Array<{ id: number; nome: string; total_bens?: number }>>([]);
	let modoCaixa = $state<'EXISTENTE' | 'NOVA' | 'SEM_CAIXA'>('NOVA');
	let caixaExistenteNome = $state('');
	let novaCaixaNome = $state('');
	let operacao = $state('');
	let previewDocs = $state<PreviewDocumento[]>([]);

	$effect(() => {
		if (caixasExistentes.length === 0 && data.caixas.length > 0) {
			caixasExistentes = data.caixas;
			modoCaixa = 'EXISTENTE';
			if (!caixaExistenteNome) {
				caixaExistenteNome = data.caixas[0].nome;
			}
		}
	});

	const opcoesCaixasExistentes = $derived(
		caixasExistentes.map((cx) => ({
			value: cx.nome,
			label: `${cx.nome}${cx.total_bens !== undefined ? ` (${cx.total_bens} bem/bens)` : ''}`
		}))
	);

	const caixaFinal = $derived(
		modoCaixa === 'EXISTENTE'
			? caixaExistenteNome.trim()
			: modoCaixa === 'NOVA'
				? novaCaixaNome.trim()
				: ''
	);

	const passoCaixaValido = $derived(
		modoCaixa === 'SEM_CAIXA' ||
			(modoCaixa === 'EXISTENTE' && caixaExistenteNome.trim().length > 0) ||
			(modoCaixa === 'NOVA' && novaCaixaNome.trim().length > 0)
	);

	async function processarArquivos(files: FileList | null) {
		if (!files || files.length === 0) return;
		if (!passoCaixaValido) {
			erro = 'Antes de importar o PDF, selecione uma caixa existente ou informe o nome da nova caixa.';
			return;
		}
		erro = null;
		mensagemSucesso = null;
		carregando = true;
		previewDocs = [];

		try {
			const parseados: DocumentoParseado[] = [];
			for (const file of Array.from(files)) {
				const { texto, hashSha256 } = await extrairTextoPdf(file);
				const doc = parseRelatorioPdf(texto, file.name, hashSha256);
				parseados.push(doc);
			}

			const res = await fetch('/api/preview', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ documentos: parseados })
			});

			if (!res.ok) {
				const err = (await res.json().catch(() => ({}))) as { message?: string };
				throw new Error(err.message || 'Falha ao gerar pré-visualização.');
			}

			const resData = (await res.json()) as {
				caixas: Array<{ id: number; nome: string }>;
				documentos: PreviewDocumento[];
			};
			if (resData.caixas.length > 0 && caixasExistentes.length === 0) {
				caixasExistentes = resData.caixas;
			}
			previewDocs = resData.documentos;
		} catch (e: unknown) {
			erro = e instanceof Error ? e.message : 'Erro ao ler os PDFs.';
		} finally {
			carregando = false;
		}
	}

	async function confirmarImportacao() {
		if (!passoCaixaValido) {
			erro = 'Defina a caixa de destino antes de confirmar a importação.';
			return;
		}
		salvando = true;
		erro = null;
		try {
			const res = await fetch('/api/commit', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					caixaNome: caixaFinal || null,
					operacao: operacao.trim() || null,
					documentos: previewDocs
				})
			});

			if (!res.ok) {
				const err = (await res.json().catch(() => ({}))) as { message?: string };
				throw new Error(err.message || 'Erro ao gravar no banco.');
			}

			const { resumo } = (await res.json()) as {
				resumo: { docsSalvos: number; totalApreendidos: number; totalRestituidos: number };
			};
			const msgCaixa = caixaFinal ? ` na caixa "${caixaFinal}"` : '';
			mensagemSucesso = `Salvo${msgCaixa}! ${resumo.docsSalvos} documento(s), ${resumo.totalApreendidos} bem(ns) cadastrado(s) e ${resumo.totalRestituidos} restituição(ões) aplicada(s).`;
			previewDocs = [];
			setTimeout(() => goto('/'), 1400);
		} catch (e: unknown) {
			erro = e instanceof Error ? e.message : 'Erro ao salvar.';
		} finally {
			salvando = false;
		}
	}

	const temAlgoParaSalvar = $derived(previewDocs.some((d) => !d.jaImportado));
</script>

<svelte:head>
	<title>Importar PDFs — Custódia PCCE</title>
</svelte:head>

<div class="page-head">
	<div>
		<h1>Importar autos e termos</h1>
		<p class="sub">
			Escolha a caixa de destino e, em seguida, selecione os PDFs de Auto de Apresentação e Apreensão ou Termo de Restituição.
		</p>
	</div>
</div>

<section class="panel step-card" aria-labelledby="passo-1">
	<div class="step-header">
		<span class="step-num" class:done={passoCaixaValido}>
			{#if passoCaixaValido}
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
			{:else}
				1
			{/if}
		</span>
		<div>
			<h2 id="passo-1">Caixa de destino</h2>
			<p>Atualize uma caixa existente no depósito ou abra uma nova caixa para esta importação.</p>
		</div>
	</div>

	<div class="modo-opcoes" role="radiogroup" aria-label="Caixa de destino">
		<label class="radio-card" class:selected={modoCaixa === 'EXISTENTE'} class:disabled={caixasExistentes.length === 0}>
			<input
				type="radio"
				name="modoCaixa"
				value="EXISTENTE"
				bind:group={modoCaixa}
				disabled={caixasExistentes.length === 0}
			/>
			<div>
				<strong>Caixa existente</strong>
				<span>
					{caixasExistentes.length > 0
						? `Escolher entre ${caixasExistentes.length} caixa(s) cadastrada(s)`
						: 'Nenhuma caixa cadastrada ainda'}
				</span>
			</div>
		</label>

		<label class="radio-card" class:selected={modoCaixa === 'NOVA'}>
			<input type="radio" name="modoCaixa" value="NOVA" bind:group={modoCaixa} />
			<div>
				<strong>Nova caixa</strong>
				<span>Cadastrar novo local físico para esta apreensão</span>
			</div>
		</label>

		<label class="radio-card" class:selected={modoCaixa === 'SEM_CAIXA'}>
			<input type="radio" name="modoCaixa" value="SEM_CAIXA" bind:group={modoCaixa} />
			<div>
				<strong>Sem caixa</strong>
				<span>Apenas restituição ou vincular depois</span>
			</div>
		</label>
	</div>

	<div class="caixa-fields">
		{#if modoCaixa === 'EXISTENTE'}
			<div class="field">
				<span class="field-label">Caixa existente *</span>
				<CaixaSelect
					opcoes={opcoesCaixasExistentes}
					bind:value={caixaExistenteNome}
					placeholder="-- Escolha uma caixa --"
					buscaPlaceholder="Pesquisar nome da caixa..."
				/>
			</div>
		{:else if modoCaixa === 'NOVA'}
			<div class="field">
				<label class="field-label" for="input-nova-caixa">Nome / identificação da nova caixa *</label>
				<input
					id="input-nova-caixa"
					type="text"
					bind:value={novaCaixaNome}
					placeholder="Ex: Caixa 01 - Operação Rastro Digital / Prateleira B2"
				/>
			</div>
		{/if}

		<div class="field">
			<label class="field-label" for="operacao">Nome da operação <span class="opt">(opcional)</span></label>
			<input id="operacao" type="text" bind:value={operacao} placeholder="Ex: Operação Rastro Digital" />
		</div>
	</div>
</section>

<section class="panel step-card" class:locked={!passoCaixaValido} aria-labelledby="passo-2">
	<div class="step-header">
		<span class="step-num">2</span>
		<div>
			<h2 id="passo-2">PDFs do procedimento</h2>
			<p>
				{#if modoCaixa === 'EXISTENTE' && caixaFinal}
					Os novos bens apreendidos serão adicionados à caixa <strong>"{caixaFinal}"</strong>.
				{:else if modoCaixa === 'NOVA' && caixaFinal}
					A nova caixa <strong>"{caixaFinal}"</strong> será criada e receberá os bens apreendidos.
				{:else if modoCaixa === 'SEM_CAIXA'}
					Importação configurada <strong>sem vínculo de caixa</strong>.
				{:else}
					Preencha ou selecione a caixa no passo 1 para liberar o envio dos PDFs.
				{/if}
			</p>
		</div>
	</div>

	<div class="dropzone" class:disabled={!passoCaixaValido} class:loading={carregando}>
		<input
			id="pdf-input"
			type="file"
			accept="application/pdf"
			multiple
			disabled={!passoCaixaValido || carregando}
			onchange={(e) => processarArquivos((e.currentTarget as HTMLInputElement).files)}
		/>
		<span class="drop-icon" aria-hidden="true">
			{#if carregando}
				<span class="spinner"></span>
			{:else}
				<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M12 18v-6M9 15l3-3 3 3" /></svg>
			{/if}
		</span>
		<label for="pdf-input" class="btn {passoCaixaValido && !carregando ? 'btn-primary' : 'btn-secondary'} drop-btn">
			{#if !passoCaixaValido}
				Defina a caixa no passo 1
			{:else if carregando}
				Lendo PDFs e conciliando itens...
			{:else}
				Selecionar PDFs
			{/if}
		</label>
		<span class="drop-hint">Aceita vários arquivos .pdf de uma só vez</span>
	</div>
</section>

{#if erro}
	<div class="alert error" role="alert">{erro}</div>
{/if}

{#if mensagemSucesso}
	<div class="alert success" role="status">{mensagemSucesso}</div>
{/if}

{#if previewDocs.length > 0}
	<h2 class="preview-title">Pré-visualização <span class="count-pill">{previewDocs.length}</span></h2>

	{#each previewDocs as doc}
		<article class="panel doc-card" class:duplicado={doc.jaImportado}>
			<header class="doc-head">
				<div class="doc-head-main">
					<div class="doc-badges">
						<span class="badge {doc.tipoDocumento === 'APREENSAO' ? 'blue' : 'green'}">
							{doc.tipoDocumento === 'APREENSAO' ? 'APREENSÃO' : 'RESTITUIÇÃO'}
						</span>
						{#if doc.tipoDocumento === 'APREENSAO' && caixaFinal}
							<span class="badge purple">Destino: {caixaFinal}</span>
						{/if}
					</div>
					<strong class="doc-proc">{doc.tipoProcedimento} {doc.numeroProcedimento}</strong>
					<span class="muted doc-meta">{doc.dataAto ?? 'Sem data'} · {doc.nomeArquivo}</span>
				</div>
				{#if doc.jaImportado}
					<div class="dup-box">
						<span class="badge warn">Já importado (ignorado)</span>
						<button type="button" class="btn btn-secondary btn-sm" onclick={() => (doc.jaImportado = false)}>
							Reimportar mesmo assim
						</button>
					</div>
				{/if}
			</header>

			<dl class="partes">
				<div>
					<dt>Delegado</dt>
					<dd>{doc.delegado ?? '—'}</dd>
				</div>
				<div>
					<dt>{doc.tipoDocumento === 'APREENSAO' ? 'Apresentador' : 'Recebedor'}</dt>
					<dd>{doc.parteNome ?? '—'} <span class="muted">({doc.parteCpf ?? '—'})</span></dd>
				</div>
			</dl>

			{#if !doc.jaImportado && doc.tipoDocumento === 'APREENSAO'}
				<div class="table-wrap cards">
					<table class="table prev-table">
						<thead>
							<tr>
								<th style="width:48px">Incluir</th>
								<th>Categoria</th>
								<th>Descrição extraída</th>
								<th>Qtd</th>
								<th>Previsão</th>
							</tr>
						</thead>
						<tbody>
							{#each doc.itensApreensao as entry}
								<tr class:excluido={!entry.incluir}>
									<td class="p-check">
										<input type="checkbox" bind:checked={entry.incluir} aria-label="Incluir item" />
									</td>
									<td class="p-cat"><span class="cat">{entry.item.categoria}</span></td>
									<td class="p-desc">{entry.item.descricaoOriginal}</td>
									<td class="p-qtd" data-label="Qtd">{entry.item.quantidade} {entry.item.unidade}</td>
									<td class="p-prev">
										{#if entry.seraRestituidoNoLote}
											<span class="badge green">Restituído neste lote</span>
										{:else}
											<span class="badge amber">Em depósito</span>
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}

			{#if !doc.jaImportado && doc.tipoDocumento === 'RESTITUICAO'}
				<div class="table-wrap cards">
					<table class="table rest-table">
						<thead>
							<tr>
								<th>Item no termo de restituição</th>
								<th>Match automático</th>
								<th>Vincular ao bem em depósito</th>
							</tr>
						</thead>
						<tbody>
							{#each doc.itensRestituicao as m}
								<tr>
									<td class="r-item">
										<div class="desc">{m.item.descricaoOriginal}</div>
										<small class="muted">Qtd: {m.item.quantidade} {m.item.unidade}</small>
									</td>
									<td class="r-match" data-label="Match automático">
										<span class="badge {m.camada === 'NAO_ENCONTRADO' ? 'warn' : 'green'}">
											{m.camada} {m.confianca > 0 ? `(${m.confianca}%)` : ''}
										</span>
									</td>
									<td class="r-alvo" data-label="Vincular a">
										<select bind:value={m.alvoKey} aria-label="Bem a vincular">
											<option value="__CRIAR_RESTITUIDO__">+ Cadastrar já como Restituído</option>
											<option value="__IGNORAR__">-- Ignorar este item --</option>
											{#each doc.candidatosDisponiveis as cand}
												<option value={cand.key}>
													[{cand.origem === 'LOTE' ? 'Neste lote' : 'No depósito'}] {cand.label}
												</option>
											{/each}
										</select>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</article>
	{/each}

	<div class="actions">
		<button
			class="btn btn-success btn-confirmar"
			disabled={!temAlgoParaSalvar || !passoCaixaValido || salvando}
			onclick={confirmarImportacao}
		>
			<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
			{salvando
				? 'Gravando no Cloudflare D1...'
				: caixaFinal
					? `Confirmar e salvar na caixa "${caixaFinal}"`
					: 'Confirmar e salvar no banco'}
		</button>
	</div>
{/if}

<style>
	.step-card {
		transition: opacity 0.2s;
	}
	.step-card.locked {
		opacity: 0.6;
	}
	.step-header {
		display: flex;
		align-items: flex-start;
		gap: 0.85rem;
		margin-bottom: 1.1rem;
	}
	.step-num {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 30px;
		height: 30px;
		flex-shrink: 0;
		border-radius: var(--radius-pill);
		background: var(--primary);
		color: #fff;
		font-weight: 700;
		font-size: 0.88rem;
		box-shadow: 0 2px 6px hsl(221 76% 48% / 0.3);
		transition: background 0.2s;
	}
	.step-num.done {
		background: var(--success);
		box-shadow: 0 2px 6px hsl(142 64% 32% / 0.3);
	}
	.step-header h2 {
		margin: 0.1rem 0 0.2rem;
		font-size: 1.05rem;
		font-weight: 700;
	}
	.step-header p {
		margin: 0;
		font-size: 0.87rem;
		color: var(--text-2);
	}

	.modo-opcoes {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.65rem;
		margin-bottom: 1.1rem;
	}
	.radio-card {
		display: flex;
		align-items: flex-start;
		gap: 0.65rem;
		padding: 0.85rem 0.9rem;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius);
		background: var(--surface);
		cursor: pointer;
		transition:
			border-color 0.15s,
			background 0.15s,
			box-shadow 0.15s;
	}
	.radio-card:hover:not(.disabled) {
		border-color: hsl(221 60% 70%);
	}
	.radio-card.selected {
		border-color: var(--primary);
		background: var(--primary-soft);
		box-shadow: 0 0 0 1px var(--primary);
	}
	.radio-card.disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.radio-card input {
		margin-top: 0.15rem;
		flex-shrink: 0;
	}
	.radio-card strong {
		display: block;
		font-size: 0.9rem;
		margin-bottom: 0.1rem;
	}
	.radio-card span {
		display: block;
		font-size: 0.78rem;
		color: var(--text-2);
	}

	.caixa-fields {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
		gap: 0.9rem;
	}
	.field-label {
		display: block;
		font-size: 0.82rem;
		font-weight: 600;
		margin-bottom: 0.35rem;
		color: var(--text);
	}
	.opt {
		font-weight: 400;
		color: var(--text-3);
	}
	.field input {
		width: 100%;
	}

	.dropzone {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.6rem;
		padding: 1.8rem 1rem;
		border: 1.5px dashed var(--border-strong);
		border-radius: var(--radius-lg);
		background:
			radial-gradient(circle at 50% 0%, var(--primary-soft), transparent 70%),
			var(--surface-2);
		text-align: center;
		transition:
			border-color 0.15s,
			background 0.15s;
	}
	.dropzone:not(.disabled):hover {
		border-color: var(--primary);
	}
	.dropzone input {
		display: none;
	}
	.drop-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 52px;
		height: 52px;
		border-radius: 14px;
		background: var(--surface);
		border: 1px solid var(--border);
		box-shadow: var(--shadow-sm);
		color: var(--primary);
	}
	.dropzone.disabled .drop-icon {
		color: var(--text-3);
	}
	.drop-btn {
		cursor: pointer;
	}
	.dropzone.disabled .drop-btn,
	.dropzone.loading .drop-btn {
		cursor: not-allowed;
	}
	.drop-hint {
		font-size: 0.78rem;
		color: var(--text-3);
	}
	.spinner {
		width: 22px;
		height: 22px;
		border: 2.5px solid var(--primary-soft-2);
		border-top-color: var(--primary);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.preview-title {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 1.6rem 0 0.8rem;
		font-size: 1.1rem;
		font-weight: 700;
	}
	.doc-card.duplicado {
		opacity: 0.7;
	}
	.doc-head {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 0.75rem;
		flex-wrap: wrap;
	}
	.doc-head-main {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		min-width: 0;
	}
	.doc-badges {
		display: flex;
		gap: 0.35rem;
		flex-wrap: wrap;
	}
	.doc-proc {
		font-size: 1rem;
		font-weight: 700;
	}
	.doc-meta {
		overflow-wrap: anywhere;
	}
	.dup-box {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.partes {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 1.75rem;
		margin: 0.9rem 0 1rem;
		padding: 0.7rem 0.85rem;
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
	}
	.partes dt {
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-3);
	}
	.partes dd {
		margin: 0.1rem 0 0;
		font-size: 0.87rem;
	}

	.prev-table td,
	.rest-table td {
		vertical-align: top;
	}
	.prev-table tr.excluido td {
		opacity: 0.5;
	}
	.cat {
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--text-2);
	}
	.p-desc,
	.desc {
		overflow-wrap: anywhere;
	}
	.p-qtd {
		white-space: nowrap;
	}
	.r-alvo select {
		width: 100%;
		max-width: 380px;
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		margin-top: 1rem;
	}
	.btn-confirmar {
		min-height: 46px;
		padding: 0.7rem 1.4rem;
		font-size: 0.93rem;
		white-space: normal;
		text-align: center;
	}

	@media (max-width: 860px) {
		.modo-opcoes {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 720px) {
		.step-header {
			gap: 0.7rem;
		}
		.radio-card {
			padding: 0.9rem;
		}
		.dropzone {
			padding: 1.4rem 0.9rem;
		}
		.drop-btn {
			width: 100%;
			white-space: normal;
		}
		.dup-box,
		.dup-box .btn {
			width: 100%;
		}
		.partes {
			flex-direction: column;
		}

		/* Itens de apreensão em cards */
		.prev-table tr {
			display: grid !important;
			grid-template-columns: auto 1fr auto;
			grid-template-areas:
				'check cat qtd'
				'desc desc desc'
				'prev prev prev';
			column-gap: 0.6rem;
			row-gap: 0.3rem;
		}
		.prev-table .p-check {
			grid-area: check;
		}
		.prev-table .p-cat {
			grid-area: cat;
			align-self: center;
		}
		.prev-table .p-qtd {
			grid-area: qtd;
			width: auto;
			text-align: right;
		}
		.prev-table .p-qtd::before {
			display: none !important;
		}
		.prev-table .p-desc {
			grid-area: desc;
		}
		.prev-table .p-prev {
			grid-area: prev;
		}
		.prev-table td {
			width: auto !important;
		}

		.r-alvo select {
			max-width: none;
		}

		.actions {
			position: sticky;
			bottom: 0;
			z-index: 20;
			margin: 1rem -0.85rem -3rem;
			padding: 0.75rem 0.85rem calc(0.75rem + env(safe-area-inset-bottom));
			background: hsl(0 0% 100% / 0.92);
			backdrop-filter: blur(8px);
			border-top: 1px solid var(--border);
		}
		.btn-confirmar {
			width: 100%;
		}
	}
</style>
