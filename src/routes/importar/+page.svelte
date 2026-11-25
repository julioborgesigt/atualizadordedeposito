<script lang="ts">
	import { goto } from '$app/navigation';
	import { extrairTextoPdf } from '$lib/pdf/extractText';
	import { parseRelatorioPdf } from '$lib/pdf/parser';
	import type { DocumentoParseado, PreviewDocumento } from '$lib/types';

	let carregando = $state(false);
	let salvando = $state(false);
	let erro = $state<string | null>(null);
	let mensagemSucesso = $state<string | null>(null);

	let caixaNome = $state('');
	let operacao = $state('');
	let caixasExistentes = $state<Array<{ id: number; nome: string }>>([]);
	let previewDocs = $state<PreviewDocumento[]>([]);

	async function processarArquivos(files: FileList | null) {
		if (!files || files.length === 0) return;
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

			const data = (await res.json()) as {
				caixas: Array<{ id: number; nome: string }>;
				documentos: PreviewDocumento[];
			};
			caixasExistentes = data.caixas;
			previewDocs = data.documentos;
		} catch (e: unknown) {
			erro = e instanceof Error ? e.message : 'Erro ao ler os PDFs.';
		} finally {
			carregando = false;
		}
	}

	async function confirmarImportacao() {
		salvando = true;
		erro = null;
		try {
			const res = await fetch('/api/commit', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					caixaNome: caixaNome.trim() || null,
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
			mensagemSucesso = `Salvo! ${resumo.docsSalvos} documento(s), ${resumo.totalApreendidos} bem(ns) cadastrado(s) e ${resumo.totalRestituidos} restituição(ões) aplicada(s).`;
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
	Selecione um ou mais PDFs do mesmo procedimento (você pode subir a Apreensão e a Restituição juntos).
	A leitura acontece localmente no navegador.
</p>

<div class="dropzone">
	<input
		id="pdf-input"
		type="file"
		accept="application/pdf"
		multiple
		onchange={(e) => processarArquivos((e.currentTarget as HTMLInputElement).files)}
	/>
	<label for="pdf-input">
		{carregando ? 'Lendo PDFs e conciliando itens...' : 'Clique para selecionar os PDFs (múltiplos arquivos)'}
	</label>
</div>

{#if erro}
	<div class="alert error">{erro}</div>
{/if}

{#if mensagemSucesso}
	<div class="alert success">{mensagemSucesso}</div>
{/if}

{#if previewDocs.length > 0}
	<section class="lote-meta">
		<div>
			<label for="caixa">Caixa / Local físico (opcional)</label>
			<input
				id="caixa"
				type="text"
				list="lista-caixas"
				bind:value={caixaNome}
				placeholder="Ex: Caixa da operação Rastro Digital"
			/>
			<datalist id="lista-caixas">
				{#each caixasExistentes as cx}
					<option value={cx.nome}></option>
				{/each}
			</datalist>
		</div>

		<div>
			<label for="operacao">Nome da Operação (opcional)</label>
			<input id="operacao" type="text" bind:value={operacao} placeholder="Ex: Operação Rastro Digital" />
		</div>
	</section>

	{#each previewDocs as doc}
		<article class="doc-card" class:duplicado={doc.jaImportado}>
			<header>
				<div>
					<span class="badge {doc.tipoDocumento === 'APREENSAO' ? 'blue' : 'green'}">
						{doc.tipoDocumento === 'APREENSAO' ? 'APREENSÃO' : 'RESTITUIÇÃO'}
					</span>
					<strong>{doc.tipoProcedimento} {doc.numeroProcedimento}</strong>
					<span class="muted">• {doc.dataAto ?? 'Sem data'} • {doc.nomeArquivo}</span>
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
							<th>ID Único</th>
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
								<td>{entry.item.identificadorUnico ?? '-'}</td>
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
		<button class="btn-primary" disabled={!temAlgoParaSalvar || salvando} onclick={confirmarImportacao}>
			{salvando ? 'Gravando no Cloudflare D1...' : 'Confirmar e Salvar no Banco'}
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
	.dropzone {
		border: 2px dashed #94a3b8;
		border-radius: 10px;
		background: #fff;
		padding: 2rem;
		text-align: center;
		margin-bottom: 1.2rem;
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
	.lote-meta {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
		gap: 1rem;
		background: #fff;
		padding: 1rem;
		border-radius: 8px;
		margin-bottom: 1rem;
		border: 1px solid #e2e8f0;
	}
	.lote-meta label {
		display: block;
		font-size: 0.85rem;
		font-weight: 600;
		margin-bottom: 0.3rem;
	}
	.lote-meta input {
		width: 100%;
		box-sizing: border-box;
		padding: 0.5rem 0.65rem;
		border: 1px solid #cbd5e1;
		border-radius: 6px;
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
