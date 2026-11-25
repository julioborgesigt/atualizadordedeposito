<script lang="ts">
	import { goto } from '$app/navigation';
	import { extrairTextoPdf } from '$lib/pdf/extractText';
	import { parseRelatorioPdf } from '$lib/pdf/parser';
	import type { DocumentoParseado, PreviewDocumento } from '$lib/types';

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

<h1>Importar Autos de Apreensão e Termos de Restituição</h1>
<p class="sub">
	Primeiro escolha se deseja adicionar os itens a uma caixa existente ou criar uma nova caixa. Em seguida, selecione os PDFs do procedimento.
</p>

<section class="step-card">
	<div class="step-header">
		<span class="step-num">1</span>
		<div>
			<h2>A qual Caixa pertencem os itens desta importação?</h2>
			<p>Escolha se deseja atualizar uma caixa existente no depósito ou abrir uma nova caixa.</p>
		</div>
	</div>

	<div class="modo-opcoes">
		<label class="radio-card" class:selected={modoCaixa === 'EXISTENTE'} class:disabled={caixasExistentes.length === 0}>
			<input
				type="radio"
				name="modoCaixa"
				value="EXISTENTE"
				bind:group={modoCaixa}
				disabled={caixasExistentes.length === 0}
			/>
			<div>
				<strong>Atualizar uma caixa existente</strong>
				<span>
					{caixasExistentes.length > 0
						? `Selecionar entre ${caixasExistentes.length} caixa(s) já cadastrada(s)`
						: 'Nenhuma caixa cadastrada ainda'}
				</span>
			</div>
		</label>

		<label class="radio-card" class:selected={modoCaixa === 'NOVA'}>
			<input type="radio" name="modoCaixa" value="NOVA" bind:group={modoCaixa} />
			<div>
				<strong>Criar uma nova caixa</strong>
				<span>Cadastrar nova caixa/local físico para esta apreensão</span>
			</div>
		</label>

		<label class="radio-card" class:selected={modoCaixa === 'SEM_CAIXA'}>
			<input type="radio" name="modoCaixa" value="SEM_CAIXA" bind:group={modoCaixa} />
			<div>
				<strong>Sem caixa / Apenas Restituição</strong>
				<span>Não vincular a nenhuma caixa neste momento</span>
			</div>
		</label>
	</div>

	<div class="caixa-fields">
		{#if modoCaixa === 'EXISTENTE'}
			<div class="field">
				<label for="select-caixa-existente">Selecione a caixa existente *</label>
				<select id="select-caixa-existente" bind:value={caixaExistenteNome}>
					<option value="">-- Escolha uma caixa --</option>
					{#each caixasExistentes as cx}
						<option value={cx.nome}>
							{cx.nome} {cx.total_bens !== undefined ? `(${cx.total_bens} bem/bens)` : ''}
						</option>
					{/each}
				</select>
			</div>
		{:else if modoCaixa === 'NOVA'}
			<div class="field">
				<label for="input-nova-caixa">Nome / Identificação da Nova Caixa *</label>
				<input
					id="input-nova-caixa"
					type="text"
					bind:value={novaCaixaNome}
					placeholder="Ex: Caixa 01 - Operação Rastro Digital / Prateleira B2"
				/>
			</div>
		{/if}

		<div class="field">
			<label for="operacao">Nome da Operação (opcional)</label>
			<input
				id="operacao"
				type="text"
				bind:value={operacao}
				placeholder="Ex: Operação Rastro Digital"
			/>
		</div>
	</div>
</section>

<section class="step-card" class:locked={!passoCaixaValido}>
	<div class="step-header">
		<span class="step-num">2</span>
		<div>
			<h2>Selecionar PDFs do Procedimento</h2>
			<p>
				{#if modoCaixa === 'EXISTENTE' && caixaFinal}
					Os novos bens apreendidos serão adicionados à caixa <strong>"{caixaFinal}"</strong>.
				{:else if modoCaixa === 'NOVA' && caixaFinal}
					A nova caixa <strong>"{caixaFinal}"</strong> será criada e receberá os bens apreendidos.
				{:else if modoCaixa === 'SEM_CAIXA'}
					Importação configurada <strong>sem vínculo de caixa</strong>.
				{:else}
					Preencha ou selecione a caixa no Passo 1 acima para liberar o upload dos PDFs.
				{/if}
			</p>
		</div>
	</div>

	<div class="dropzone" class:disabled={!passoCaixaValido}>
		<input
			id="pdf-input"
			type="file"
			accept="application/pdf"
			multiple
			disabled={!passoCaixaValido || carregando}
			onchange={(e) => processarArquivos((e.currentTarget as HTMLInputElement).files)}
		/>
		<label for="pdf-input">
			{#if !passoCaixaValido}
				Defina a caixa no Passo 1 para habilitar o upload
			{:else if carregando}
				Lendo PDFs e conciliando itens...
			{:else}
				Clique para selecionar os PDFs (múltiplos arquivos)
			{/if}
		</label>
	</div>
</section>

{#if erro}
	<div class="alert error">{erro}</div>
{/if}

{#if mensagemSucesso}
	<div class="alert success">{mensagemSucesso}</div>
{/if}

{#if previewDocs.length > 0}
	{#each previewDocs as doc}
		<article class="doc-card" class:duplicado={doc.jaImportado}>
			<header>
				<div>
					<span class="badge {doc.tipoDocumento === 'APREENSAO' ? 'blue' : 'green'}">
						{doc.tipoDocumento === 'APREENSAO' ? 'APREENSÃO' : 'RESTITUIÇÃO'}
					</span>
					<strong>{doc.tipoProcedimento} {doc.numeroProcedimento}</strong>
					<span class="muted">• {doc.dataAto ?? 'Sem data'} • {doc.nomeArquivo}</span>
					{#if doc.tipoDocumento === 'APREENSAO' && caixaFinal}
						<span class="badge purple">Destino: {caixaFinal}</span>
					{/if}
				</div>
				{#if doc.jaImportado}
					<span class="badge warn">JÁ IMPORTADO (ignorado)</span>
				{/if}
			</header>

			<p class="partes">
				<strong>Delegado:</strong> {doc.delegado ?? '-'} |
				<strong>{doc.tipoDocumento === 'APREENSAO' ? 'Apresentador' : 'Recebedor'}:</strong>
				{doc.parteNome ?? '-'} ({doc.parteCpf ?? '-'})
			</p>

			{#if !doc.jaImportado && doc.tipoDocumento === 'APREENSAO'}
				<table>
					<thead>
						<tr>
							<th style="width:40px">Ok</th>
							<th>Categoria</th>
							<th>Descrição extraída</th>
							<th>Qtd</th>
							<th>Previsão pós-lote</th>
						</tr>
					</thead>
					<tbody>
						{#each doc.itensApreensao as entry}
							<tr>
								<td><input type="checkbox" bind:checked={entry.incluir} /></td>
								<td>{entry.item.categoria}</td>
								<td>{entry.item.descricaoOriginal}</td>
								<td>{entry.item.quantidade} {entry.item.unidade}</td>
								<td>
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
			{/if}

			{#if !doc.jaImportado && doc.tipoDocumento === 'RESTITUICAO'}
				<table>
					<thead>
						<tr>
							<th>Item no Termo de Restituição</th>
							<th>Match automático</th>
							<th>Vincular ao bem em depósito</th>
						</tr>
					</thead>
					<tbody>
						{#each doc.itensRestituicao as m}
							<tr>
								<td>
									<div>{m.item.descricaoOriginal}</div>
									<small class="muted">Qtd: {m.item.quantidade} {m.item.unidade}</small>
								</td>
								<td>
									<span class="badge {m.camada === 'NAO_ENCONTRADO' ? 'warn' : 'green'}">
										{m.camada} {m.confianca > 0 ? `(${m.confianca}%)` : ''}
									</span>
								</td>
								<td>
									<select bind:value={m.alvoKey}>
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
			{/if}
		</article>
	{/each}

	<div class="actions">
		<button
			class="btn-primary"
			disabled={!temAlgoParaSalvar || !passoCaixaValido || salvando}
			onclick={confirmarImportacao}
		>
			{salvando
				? 'Gravando no Cloudflare D1...'
				: caixaFinal
					? `Confirmar e Salvar na Caixa "${caixaFinal}"`
					: 'Confirmar e Salvar no Banco'}
		</button>
	</div>
{/if}

<style>
	h1 {
		margin: 0 0 0.25rem;
		font-size: 1.45rem;
	}
	.sub {
		margin: 0 0 1.2rem;
		color: #475569;
		font-size: 0.95rem;
	}
	.step-card {
		background: #fff;
		border: 1px solid #e2e8f0;
		border-radius: 10px;
		padding: 1.2rem;
		margin-bottom: 1.1rem;
	}
	.step-card.locked {
		opacity: 0.7;
	}
	.step-header {
		display: flex;
		align-items: flex-start;
		gap: 0.85rem;
		margin-bottom: 1rem;
	}
	.step-num {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border-radius: 999px;
		background: #2563eb;
		color: #fff;
		font-weight: 700;
		font-size: 0.9rem;
		flex-shrink: 0;
	}
	.step-header h2 {
		margin: 0 0 0.2rem;
		font-size: 1.08rem;
	}
	.step-header p {
		margin: 0;
		font-size: 0.88rem;
		color: #64748b;
	}
	.modo-opcoes {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: 0.75rem;
		margin-bottom: 1rem;
	}
	.radio-card {
		display: flex;
		align-items: flex-start;
		gap: 0.65rem;
		padding: 0.85rem;
		border: 2px solid #e2e8f0;
		border-radius: 8px;
		cursor: pointer;
		background: #f8fafc;
		transition: border-color 0.15s, background 0.15s;
	}
	.radio-card.selected {
		border-color: #2563eb;
		background: #eff6ff;
	}
	.radio-card.disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.radio-card input {
		margin-top: 0.2rem;
	}
	.radio-card strong {
		display: block;
		font-size: 0.92rem;
		margin-bottom: 0.15rem;
	}
	.radio-card span {
		display: block;
		font-size: 0.78rem;
		color: #64748b;
	}
	.caixa-fields {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
		gap: 1rem;
	}
	.field label {
		display: block;
		font-size: 0.85rem;
		font-weight: 600;
		margin-bottom: 0.35rem;
	}
	.field input,
	.field select {
		width: 100%;
		max-width: none;
		box-sizing: border-box;
		padding: 0.55rem 0.7rem;
		border: 1px solid #cbd5e1;
		border-radius: 6px;
		font-size: 0.9rem;
	}
	.dropzone {
		border: 2px dashed #94a3b8;
		border-radius: 10px;
		background: #f8fafc;
		padding: 1.6rem;
		text-align: center;
	}
	.dropzone input {
		display: none;
	}
	.dropzone label {
		cursor: pointer;
		display: inline-block;
		padding: 0.65rem 1.2rem;
		background: #2563eb;
		color: #fff;
		border-radius: 6px;
		font-weight: 600;
	}
	.dropzone.disabled label {
		background: #94a3b8;
		cursor: not-allowed;
	}
	.doc-card {
		background: #fff;
		border: 1px solid #e2e8f0;
		border-radius: 8px;
		padding: 1rem;
		margin-bottom: 1rem;
	}
	.doc-card.duplicado {
		opacity: 0.65;
	}
	.doc-card header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.partes {
		font-size: 0.85rem;
		color: #475569;
		margin: 0.5rem 0 0.9rem;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.86rem;
	}
	th,
	td {
		text-align: left;
		padding: 0.5rem;
		border-top: 1px solid #e2e8f0;
		vertical-align: top;
	}
	th {
		background: #f8fafc;
		font-weight: 600;
	}
	select {
		width: 100%;
		max-width: 360px;
		padding: 0.4rem;
		border: 1px solid #cbd5e1;
		border-radius: 6px;
	}
	.badge {
		display: inline-block;
		padding: 0.18rem 0.5rem;
		border-radius: 999px;
		font-size: 0.75rem;
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
	.badge.amber {
		background: #fef3c7;
		color: #b45309;
	}
	.badge.purple {
		background: #f3e8ff;
		color: #6b21a8;
	}
	.badge.warn {
		background: #fee2e2;
		color: #b91c1c;
	}
	.muted {
		color: #64748b;
		font-size: 0.82rem;
	}
	.alert {
		padding: 0.8rem 1rem;
		border-radius: 8px;
		margin-bottom: 1rem;
		font-weight: 500;
	}
	.alert.error {
		background: #fee2e2;
		color: #991b1b;
	}
	.alert.success {
		background: #dcfce7;
		color: #166534;
	}
	.actions {
		display: flex;
		justify-content: flex-end;
		margin-top: 1rem;
	}
	.btn-primary {
		background: #16a34a;
		color: #fff;
		border: none;
		padding: 0.75rem 1.4rem;
		border-radius: 8px;
		font-size: 0.95rem;
		font-weight: 600;
		cursor: pointer;
	}
	.btn-primary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
