<script lang="ts">
	import { invalidateAll } from '$app/navigation';

	let { data } = $props();

	let feedback = $state<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
	let novaCaixaNome = $state('');
	let buscaCaixa = $state('');
	let buscaDoc = $state('');

	let editandoCaixaId = $state<number | null>(null);
	let editandoCaixaNome = $state('');

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
			? `ATENÇÃO: Deseja excluir a caixa "${nome}" E TAMBÉM EXCLUIR os ${totalBens} bem(ns) dentro dela?`
			: totalBens > 0
				? `Deseja excluir a caixa "${nome}"? Os ${totalBens} bem(ns) serão mantidos no sistema como "Sem caixa".`
				: `Deseja excluir a caixa vazia "${nome}"?`;

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

<h1>Gerenciar Caixas e Apreensões</h1>
<p class="sub">
	Crie, renomeie ou exclua caixas físicas do depósito e gerencie os documentos de apreensão e restituição importados.
</p>

{#if feedback}
	<div class="alert {feedback.tipo === 'ok' ? 'success' : 'error'}">
		<span>{feedback.texto}</span>
		<button type="button" class="close-btn" onclick={() => (feedback = null)}>×</button>
	</div>
{/if}

<section class="panel">
	<div class="panel-header">
		<div>
			<h2>Caixas Físicas ({data.caixas.length})</h2>
			<p>Organize os locais físicos de armazenamento dos bens apreendidos.</p>
		</div>
		<div class="criar-caixa-bar">
			<input
				type="text"
				bind:value={novaCaixaNome}
				placeholder="Nome da nova caixa (ex: Caixa 02 - Operação X)"
				onkeydown={(e) => e.key === 'Enter' && criarNovaCaixa()}
			/>
			<button type="button" onclick={criarNovaCaixa}>+ Criar Caixa</button>
		</div>
	</div>

	{#if data.caixas.length > 0}
		<div class="search-bar">
			<input
				type="search"
				bind:value={buscaCaixa}
				placeholder="Pesquisar caixa pelo nome..."
			/>
		</div>
	{/if}

	<div class="table-wrap">
		<table>
			<thead>
				<tr>
					<th>Nome da Caixa</th>
					<th>Total de Bens</th>
					<th>Em Depósito</th>
					<th>Restituídos</th>
					<th style="width: 340px">Ações</th>
				</tr>
			</thead>
			<tbody>
				{#if caixasFiltradas.length === 0}
					<tr>
						<td colspan="5" class="empty">Nenhuma caixa encontrada.</td>
					</tr>
				{/if}
				{#each caixasFiltradas as cx (cx.id)}
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
										class="btn-sm primary"
										onclick={() => salvarRenomearCaixa(cx.id)}
									>
										Salvar
									</button>
									<button type="button" class="btn-sm" onclick={() => (editandoCaixaId = null)}>
										Cancelar
									</button>
								</div>
							{:else}
								<strong>{cx.nome}</strong>
							{/if}
						</td>
						<td><strong>{cx.total_bens}</strong></td>
						<td>{cx.em_deposito}</td>
						<td>{cx.restituidos}</td>
						<td>
							<div class="item-btns">
								<a href="/?caixa={cx.id}" class="btn-sm link">Ver itens</a>
								<button
									type="button"
									class="btn-sm"
									onclick={() => {
										editandoCaixaId = cx.id;
										editandoCaixaNome = cx.nome;
									}}
								>
									Renomear
								</button>
								<button
									type="button"
									class="btn-sm warn"
									onclick={() => excluirCaixa(cx.id, cx.nome, cx.total_bens, false)}
									title="Exclui apenas a caixa e mantém os bens sem caixa"
								>
									Excluir caixa
								</button>
								{#if cx.total_bens > 0}
									<button
										type="button"
										class="btn-sm danger"
										onclick={() => excluirCaixa(cx.id, cx.nome, cx.total_bens, true)}
										title="Exclui a caixa e todos os bens dentro dela"
									>
										Excluir caixa + bens
									</button>
								{/if}
							</div>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</section>

<section class="panel">
	<div class="panel-header">
		<div>
			<h2>Documentos Importados — Apreensões e Restituições ({data.documentos.length})</h2>
			<p>
				Ao excluir uma apreensão, os bens vinculados a ela são removidos e o arquivo PDF fica liberado para reimportação.
			</p>
		</div>
	</div>

	{#if data.documentos.length > 0}
		<div class="search-bar">
			<input
				type="search"
				bind:value={buscaDoc}
				placeholder="Pesquisar por número do BO/IP, nome do arquivo PDF, caixa ou parte..."
			/>
		</div>
	{/if}

	<div class="table-wrap">
		<table>
			<thead>
				<tr>
					<th>Tipo</th>
					<th>Procedimento</th>
					<th>Arquivo PDF</th>
					<th>Data do Ato</th>
					<th>Caixa(s)</th>
					<th>Bens</th>
					<th style="width: 240px">Ações</th>
				</tr>
			</thead>
			<tbody>
				{#if documentosFiltrados.length === 0}
					<tr>
						<td colspan="7" class="empty">Nenhum documento importado encontrado.</td>
					</tr>
				{/if}
				{#each documentosFiltrados as doc (doc.id)}
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
							<div>{doc.nome_arquivo}</div>
							{#if doc.parte_nome}
								<div class="muted">{doc.parte_nome}</div>
							{/if}
						</td>
						<td>{doc.data_ato ?? '-'}</td>
						<td>{doc.caixas_nomes ?? 'Sem caixa'}</td>
						<td>{doc.qtd_bens}</td>
						<td>
							<div class="item-btns">
								<a href="/?procedimento={doc.proc_id}" class="btn-sm link">Ver procedimento</a>
								<button
									type="button"
									class="btn-sm danger"
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
</section>

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
		border-radius: 10px;
		padding: 1.2rem;
		margin-bottom: 1.4rem;
	}
	.panel-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 1rem;
		flex-wrap: wrap;
		margin-bottom: 1rem;
	}
	.panel-header h2 {
		margin: 0 0 0.2rem;
		font-size: 1.12rem;
	}
	.panel-header p {
		margin: 0;
		font-size: 0.86rem;
		color: #64748b;
	}
	.criar-caixa-bar {
		display: flex;
		gap: 0.5rem;
		min-width: 320px;
		flex: 1;
		max-width: 460px;
	}
	.criar-caixa-bar input {
		flex: 1;
		padding: 0.52rem 0.7rem;
		border: 1px solid #cbd5e1;
		border-radius: 6px;
		font-size: 0.88rem;
	}
	.criar-caixa-bar button {
		background: #2563eb;
		color: #fff;
		border: none;
		padding: 0.52rem 0.95rem;
		border-radius: 6px;
		font-weight: 600;
		cursor: pointer;
		white-space: nowrap;
	}
	.search-bar {
		margin-bottom: 0.85rem;
	}
	.search-bar input {
		width: 100%;
		max-width: 420px;
		box-sizing: border-box;
		padding: 0.5rem 0.75rem;
		border: 1px solid #cbd5e1;
		border-radius: 6px;
		font-size: 0.86rem;
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
		padding: 0.65rem 0.75rem;
		border-top: 1px solid #e2e8f0;
		vertical-align: middle;
	}
	th {
		background: #f8fafc;
		font-weight: 600;
		border-top: none;
	}
	.empty {
		text-align: center;
		padding: 1.6rem;
		color: #64748b;
	}
	.muted {
		font-size: 0.78rem;
		color: #64748b;
	}
	.item-btns,
	.inline-edit {
		display: flex;
		gap: 0.4rem;
		flex-wrap: wrap;
		align-items: center;
	}
	.inline-edit input {
		padding: 0.35rem 0.55rem;
		border: 1px solid #cbd5e1;
		border-radius: 5px;
		font-size: 0.85rem;
	}
	.btn-sm {
		padding: 0.32rem 0.6rem;
		font-size: 0.77rem;
		border-radius: 5px;
		border: 1px solid #cbd5e1;
		background: #f8fafc;
		color: #1e293b;
		cursor: pointer;
		font-weight: 600;
		text-decoration: none;
		display: inline-block;
	}
	.btn-sm.link:hover {
		background: #eff6ff;
		border-color: #93c5fd;
		color: #1d4ed8;
	}
	.btn-sm.primary {
		background: #2563eb;
		color: #fff;
		border-color: #2563eb;
	}
	.btn-sm.warn {
		background: #fef3c7;
		color: #92400e;
		border-color: #fde68a;
	}
	.btn-sm.danger {
		background: #fee2e2;
		color: #b91c1c;
		border-color: #fecaca;
	}
	.badge {
		display: inline-block;
		padding: 0.18rem 0.55rem;
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
</style>
