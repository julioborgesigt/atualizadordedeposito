<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import CaixaSelect from '$lib/components/CaixaSelect.svelte';
	import { exportarParaPdf, exportarParaXlsx, traduzirStatus } from '$lib/export/exportarBens';
	import { tarefaStore } from '$lib/stores/tarefa.svelte';
	import { confirmarAcao } from '$lib/stores/confirmacao.svelte';
	import type { BemLista } from './+page.server';

	let { data } = $props();

	const STATUS_OPCOES = [
		{ value: 'EM_DEPOSITO', label: 'Em depósito' },
		{ value: 'DEPOSITO_DP_IGT', label: 'Depósito DP IGT' },
		{ value: 'EM_EXTRACAO', label: 'Em Extração' },
		{ value: 'RESTITUIDO', label: 'Restituído' },
		{ value: 'RESTITUIDO_PARCIAL', label: 'Restituído parcial' },
		{ value: 'PERICIA', label: 'Perícia (PEFOCE)' },
		{ value: 'JUDICIARIO', label: 'Judiciário' },
		{ value: 'DEPOSITO_JUDICIAL', label: 'Depósito Judicial' },
		{ value: 'DESTRUIDO', label: 'Destruído' }
	];

	let selecionados = $state<number[]>([]);
	let processandoLote = $state(false);
	let exportando = $state<'XLSX' | 'PDF' | 'PDF_SELECIONADOS' | null>(null);
	let feedback = $state<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

	// Controle de procedimentos expandidos (recolhidos por padrão)
	let procedimentosExpandidos = $state<Record<string, boolean>>({});

	// Estados da barra de ação em lote
	let destinoLoteCaixa = $state<string>('');
	let nomeNovaCaixaLote = $state('');
	let statusLote = $state('');

	interface GrupoProcedimento {
		chave: string;
		proc_tipo: string;
		proc_numero: string;
		operacao: string | null;
		unidade_nome: string | null;
		itens: BemLista[];
		totalItens: number;
		emDeposito: number;
		restituidos: number;
	}

	const gruposPorProcedimento = $derived.by(() => {
		const mapa = new Map<string, GrupoProcedimento>();
		for (const bem of data.bens) {
			const chave = `${bem.proc_tipo} ${bem.proc_numero}`;
			let grupo = mapa.get(chave);
			if (!grupo) {
				grupo = {
					chave,
					proc_tipo: bem.proc_tipo,
					proc_numero: bem.proc_numero,
					operacao: bem.operacao,
					unidade_nome: bem.unidade_nome ?? null,
					itens: [],
					totalItens: 0,
					emDeposito: 0,
					restituidos: 0
				};
				mapa.set(chave, grupo);
			}
			grupo.itens.push(bem);
			grupo.totalItens += 1;
			if (
				bem.status === 'EM_DEPOSITO' ||
				bem.status === 'DEPOSITO_DP_IGT' ||
				bem.status === 'EM_EXTRACAO' ||
				bem.status === 'RESTITUIDO_PARCIAL'
			) {
				grupo.emDeposito += 1;
			} else if (bem.status === 'RESTITUIDO') {
				grupo.restituidos += 1;
			}
		}
		return Array.from(mapa.values());
	});

	function alternarExpansao(chave: string) {
		procedimentosExpandidos[chave] = !procedimentosExpandidos[chave];
	}

	function alternarGrupo(grupo: GrupoProcedimento, marcar: boolean) {
		const idsGrupo = grupo.itens.map((b) => b.id);
		if (marcar) {
			const novos = idsGrupo.filter((id) => !selecionados.includes(id));
			selecionados = [...selecionados, ...novos];
		} else {
			selecionados = selecionados.filter((id) => !idsGrupo.includes(id));
		}
	}

	function grupoTodoSelecionado(grupo: GrupoProcedimento): boolean {
		return grupo.itens.length > 0 && grupo.itens.every((b) => selecionados.includes(b.id));
	}

	function grupoParcialmenteSelecionado(grupo: GrupoProcedimento): boolean {
		const temMarcado = grupo.itens.some((b) => selecionados.includes(b.id));
		return temMarcado && !grupoTodoSelecionado(grupo);
	}

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

	const intervaloExibido = $derived.by(() => {
		const { paginaAtual, porPagina, totalProcedimentos, totalItens } = data.paginacao;
		const total = totalProcedimentos ?? totalItens;
		const qtdGrupos = gruposPorProcedimento.length;
		if (total === 0 || qtdGrupos === 0) return null;
		const inicio = (paginaAtual - 1) * porPagina + 1;
		const fim = inicio + qtdGrupos - 1;
		return { inicio, fim, totalItens: total };
	});

	const paginasVisiveis = $derived.by(() => {
		const { paginaAtual, totalPaginas } = data.paginacao;
		const lista: number[] = [];
		const inicio = Math.max(1, paginaAtual - 2);
		const fim = Math.min(totalPaginas, paginaAtual + 2);
		for (let p = inicio; p <= fim; p++) {
			lista.push(p);
		}
		return lista;
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

	function aplicarFiltros(novos: {
		caixa?: string;
		procedimento?: string;
		unidade?: string;
		pagina?: number;
		porPagina?: string;
	}) {
		const params = new URLSearchParams();
		const unidadeVal = novos.unidade !== undefined ? novos.unidade : data.filtros.unidade;
		const caixaVal = novos.caixa !== undefined ? novos.caixa : data.filtros.caixa;
		const procVal =
			novos.procedimento !== undefined ? novos.procedimento : data.filtros.procedimento;
		const paginaVal = novos.pagina ?? 1;
		const porPaginaVal =
			novos.porPagina !== undefined ? novos.porPagina : data.paginacao.porPaginaOpcao;

		if (data.filtros.q) params.set('q', data.filtros.q);
		if (data.filtros.status) params.set('status', data.filtros.status);
		if (unidadeVal) params.set('unidade', unidadeVal);
		if (caixaVal) params.set('caixa', caixaVal);
		if (procVal) params.set('procedimento', procVal);
		if (porPaginaVal && porPaginaVal !== '10') params.set('porPagina', porPaginaVal);
		if (paginaVal > 1) params.set('pagina', String(paginaVal));

		selecionados = [];
		const qs = params.toString();
		goto(qs ? `/?${qs}` : '/');
	}

	function filtrarPorUnidade(valorUnidade: string) {
		aplicarFiltros({ unidade: valorUnidade, caixa: '', procedimento: '', pagina: 1 });
	}

	function filtrarPorCaixa(valorCaixa: string) {
		aplicarFiltros({ caixa: valorCaixa, pagina: 1 });
	}

	function filtrarPorProcedimento(valorProc: string) {
		aplicarFiltros({ procedimento: valorProc, pagina: 1 });
	}

	function alterarPorPagina(novoValor: string) {
		aplicarFiltros({ porPagina: novoValor, pagina: 1 });
	}

	function irParaPagina(pagina: number) {
		if (pagina < 1 || pagina > data.paginacao.totalPaginas) return;
		aplicarFiltros({ pagina });
	}

	async function atualizarBem(id: number, patch: Record<string, unknown>) {
		const res = await fetch(`/api/bens/${id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(patch)
		});
		if (!res.ok) {
			const err = (await res.json().catch(() => ({}))) as { message?: string };
			throw new Error(err.message || 'Falha ao atualizar item.');
		}
		await invalidateAll();
	}

	async function confirmarTrocaCaixa(bem: BemLista, selectEl: HTMLSelectElement) {
		const valorAnterior = bem.caixa_id ? String(bem.caixa_id) : '';
		const novoValor = selectEl.value;
		if (novoValor === valorAnterior) return;

		const nomeDestino = novoValor
			? (data.caixas.find((c) => String(c.id) === novoValor)?.nome ?? 'caixa selecionada')
			: 'Sem caixa';
		const nomeAtual = bem.caixa_nome ?? 'Sem caixa';

		const ok = await confirmarAcao({
			titulo: 'Confirmar troca de caixa',
			mensagem: `Deseja mover o item "${bem.descricao_original}" de "${nomeAtual}" para "${nomeDestino}"?`,
			textoConfirmar: 'Confirmar troca'
		});

		if (!ok) {
			selectEl.value = valorAnterior;
			return;
		}

		tarefaStore.iniciar('Atualizando caixa do item...', bem.descricao_original);
		try {
			await atualizarBem(bem.id, { caixa_id: novoValor ? Number(novoValor) : null });
			tarefaStore.concluir('Caixa atualizada!', `Item movido para "${nomeDestino}".`, {
				autoFecharMs: 3500
			});
		} catch (e: unknown) {
			selectEl.value = valorAnterior;
			const msg = e instanceof Error ? e.message : 'Erro ao trocar caixa.';
			feedback = { tipo: 'erro', texto: msg };
			tarefaStore.falhar('Erro ao trocar caixa', msg);
		}
	}

	async function confirmarTrocaStatus(bem: BemLista, selectEl: HTMLSelectElement) {
		const valorAnterior = bem.status;
		const novoValor = selectEl.value;
		if (novoValor === valorAnterior) return;

		const labelAnterior = traduzirStatus(valorAnterior);
		const labelNovo = traduzirStatus(novoValor);

		const ok = await confirmarAcao({
			titulo: 'Confirmar alteração de status',
			mensagem: `Deseja alterar o status do item "${bem.descricao_original}" de "${labelAnterior}" para "${labelNovo}"?`,
			textoConfirmar: 'Confirmar status'
		});

		if (!ok) {
			selectEl.value = valorAnterior;
			return;
		}

		tarefaStore.iniciar('Atualizando status do item...', bem.descricao_original);
		try {
			await atualizarBem(bem.id, { status: novoValor });
			tarefaStore.concluir('Status atualizado!', `Novo status: "${labelNovo}".`, {
				autoFecharMs: 3500
			});
		} catch (e: unknown) {
			selectEl.value = valorAnterior;
			const msg = e instanceof Error ? e.message : 'Erro ao alterar status.';
			feedback = { tipo: 'erro', texto: msg };
			tarefaStore.falhar('Erro ao alterar status', msg);
		}
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

		const nomeDestino =
			destinoLoteCaixa === '__NOVA__'
				? `nova caixa "${nomeNovaCaixaLote.trim()}"`
				: destinoLoteCaixa === '__SEM_CAIXA__'
					? 'Sem caixa'
					: `"${data.caixas.find((c) => String(c.id) === destinoLoteCaixa)?.nome ?? 'caixa selecionada'}"`;

		const ok = await confirmarAcao({
			titulo: 'Confirmar movimentação em lote',
			mensagem: `Deseja mover ${selecionados.length} item(ns) selecionado(s) para ${nomeDestino}?`,
			textoConfirmar: 'Confirmar movimentação'
		});
		if (!ok) return;

		processandoLote = true;
		feedback = null;
		tarefaStore.iniciar('Movendo itens em lote...', `${selecionados.length} item(ns) selecionado(s).`);
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
			tarefaStore.concluir('Movimentação concluída!', `${qtd} item(ns) movido(s) para ${nomeDestino}.`, {
				autoFecharMs: 4000
			});
			await invalidateAll();
		} catch (e: unknown) {
			const msg = e instanceof Error ? e.message : 'Erro ao mover itens.';
			feedback = { tipo: 'erro', texto: msg };
			tarefaStore.falhar('Erro ao mover itens', msg);
		} finally {
			processandoLote = false;
		}
	}

	async function alterarStatusEmLote() {
		if (selecionados.length === 0 || !statusLote) return;

		const labelNovo = traduzirStatus(statusLote);
		const ok = await confirmarAcao({
			titulo: 'Confirmar alteração de status em lote',
			mensagem: `Deseja alterar o status de ${selecionados.length} item(ns) selecionado(s) para "${labelNovo}"?`,
			textoConfirmar: 'Aplicar status'
		});
		if (!ok) return;

		processandoLote = true;
		feedback = null;
		tarefaStore.iniciar('Alterando status em lote...', `${selecionados.length} item(ns) para "${labelNovo}".`);
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
			tarefaStore.concluir('Status atualizado em lote!', `${qtd} item(ns) alterado(s) para "${labelNovo}".`, {
				autoFecharMs: 4000
			});
			await invalidateAll();
		} catch (e: unknown) {
			const msg = e instanceof Error ? e.message : 'Erro ao atualizar status.';
			feedback = { tipo: 'erro', texto: msg };
			tarefaStore.falhar('Erro ao atualizar status', msg);
		} finally {
			processandoLote = false;
		}
	}

	async function excluirItens(idsParaExcluir: number[]) {
		if (idsParaExcluir.length === 0) return;
		const confirmar = await confirmarAcao({
			titulo: 'Confirmar exclusão',
			mensagem: `Confirma a exclusão de ${idsParaExcluir.length} item(ns) selecionado(s)? Esta ação não pode ser desfeita.`,
			textoConfirmar: 'Excluir',
			perigoso: true
		});
		if (!confirmar) return;

		processandoLote = true;
		feedback = null;
		tarefaStore.iniciar('Excluindo itens...', `${idsParaExcluir.length} item(ns).`);
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
			tarefaStore.concluir('Exclusão concluída!', `${idsParaExcluir.length} item(ns) excluído(s).`, {
				autoFecharMs: 4000
			});
			await invalidateAll();
		} catch (e: unknown) {
			const msg = e instanceof Error ? e.message : 'Erro ao excluir itens.';
			feedback = { tipo: 'erro', texto: msg };
			tarefaStore.falhar('Erro ao excluir itens', msg);
		} finally {
			processandoLote = false;
		}
	}

	async function exportarRelatorio(formato: 'XLSX' | 'PDF') {
		if (exportando) return;
		exportando = formato;
		feedback = null;
		const nomeFormato = formato === 'XLSX' ? 'planilha Excel' : 'relatório PDF';
		tarefaStore.iniciar(`Gerando ${nomeFormato}...`, 'Buscando itens do filtro atual.');

		try {
			const params = new URLSearchParams();
			if (data.filtros.q) params.set('q', data.filtros.q);
			if (data.filtros.status) params.set('status', data.filtros.status);
			if (data.filtros.unidade) params.set('unidade', data.filtros.unidade);
			if (data.filtros.caixa) params.set('caixa', data.filtros.caixa);
			if (data.filtros.procedimento) params.set('procedimento', data.filtros.procedimento);

			const qs = params.toString();
			const res = await fetch(qs ? `/api/bens/exportar?${qs}` : '/api/bens/exportar');
			if (!res.ok) throw new Error('Falha ao buscar registros para exportação.');

			const { bens } = (await res.json()) as { bens: BemLista[] };
			if (!bens || bens.length === 0) {
				feedback = { tipo: 'erro', texto: 'Não há itens no filtro atual para exportar.' };
				tarefaStore.falhar('Nada para exportar', 'Não há itens no filtro atual para exportar.');
				return;
			}

			const contexto = {
				caixaLabel: caixaVisualizadaLabel,
				procedimentoLabel: procedimentoVisualizadoLabel,
				statusLabel: data.filtros.status ? traduzirStatus(data.filtros.status) : '',
				termoBusca: data.filtros.q
			};

			if (formato === 'XLSX') {
				await exportarParaXlsx(bens, contexto);
			} else {
				await exportarParaPdf(bens, contexto);
			}

			tarefaStore.concluir(
				`Exportação concluída!`,
				`${bens.length} item(ns) exportado(s) em ${formato}.`,
				{ autoFecharMs: 5000 }
			);
		} catch (e: unknown) {
			const msg = e instanceof Error ? e.message : 'Erro ao gerar arquivo de exportação.';
			feedback = { tipo: 'erro', texto: msg };
			tarefaStore.falhar('Erro na exportação', msg);
		} finally {
			exportando = null;
		}
	}

	async function exportarPdfSelecionados() {
		if (exportando || selecionados.length === 0) return;
		exportando = 'PDF_SELECIONADOS';
		feedback = null;
		tarefaStore.iniciar(
			'Gerando PDF dos selecionados...',
			`Preparando ${selecionados.length} item(ns) selecionado(s).`
		);

		try {
			// Filtra os itens selecionados presentes na página carregada
			let itensParaExportar = data.bens.filter((b) => selecionados.includes(b.id));

			// Se algum selecionado não estiver na página atual, busca do servidor
			if (itensParaExportar.length < selecionados.length) {
				const params = new URLSearchParams();
				if (data.filtros.q) params.set('q', data.filtros.q);
				if (data.filtros.status) params.set('status', data.filtros.status);
				if (data.filtros.unidade) params.set('unidade', data.filtros.unidade);
				if (data.filtros.caixa) params.set('caixa', data.filtros.caixa);
				if (data.filtros.procedimento) params.set('procedimento', data.filtros.procedimento);
				const qs = params.toString();
				const res = await fetch(qs ? `/api/bens/exportar?${qs}` : '/api/bens/exportar');
				if (res.ok) {
					const { bens } = (await res.json()) as { bens: BemLista[] };
					itensParaExportar = (bens || []).filter((b) => selecionados.includes(b.id));
				}
			}

			if (itensParaExportar.length === 0) {
				const msg = 'Nenhum dos itens selecionados foi encontrado para gerar o PDF.';
				feedback = { tipo: 'erro', texto: msg };
				tarefaStore.falhar('Nada para exportar', msg);
				return;
			}

			const contexto = {
				caixaLabel: caixaVisualizadaLabel,
				procedimentoLabel: `${selecionados.length} item(ns) selecionado(s)`,
				statusLabel: data.filtros.status ? traduzirStatus(data.filtros.status) : '',
				termoBusca: data.filtros.q,
				tituloRelatorio: 'CUSTÓDIA PCCE — RELATÓRIO DE BENS SELECIONADOS'
			};

			await exportarParaPdf(itensParaExportar, contexto);
			tarefaStore.concluir(
				'PDF gerado com sucesso!',
				`${itensParaExportar.length} item(ns) selecionado(s) exportado(s).`,
				{ autoFecharMs: 5000 }
			);
		} catch (e: unknown) {
			const msg = e instanceof Error ? e.message : 'Erro ao gerar PDF dos itens selecionados.';
			feedback = { tipo: 'erro', texto: msg };
			tarefaStore.falhar('Erro ao gerar PDF', msg);
		} finally {
			exportando = null;
		}
	}
</script>

<svelte:head>
	<title>Depósito de Bens — Custódia PCCE</title>
</svelte:head>

<div class="page-head">
	<div>
		<h1>Depósito de Bens</h1>
		<p class="sub">Consulte, filtre e atualize os bens apreendidos sob custódia.</p>
	</div>
	<a href="/importar" class="btn btn-primary head-cta">
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14" /></svg>
		Importar PDFs
	</a>
</div>

<section class="kpis" aria-label="Indicadores">
	<div class="kpi">
		<span class="kpi-icon blue" aria-hidden="true">
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z" /></svg>
		</span>
		<div>
			<span class="kpi-label">Total de bens</span>
			<strong class="kpi-value">{data.contadores.total}</strong>
		</div>
	</div>
	<div class="kpi">
		<span class="kpi-icon amber" aria-hidden="true">
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
		</span>
		<div>
			<span class="kpi-label">Em depósito</span>
			<strong class="kpi-value">{data.contadores.emDeposito}</strong>
		</div>
	</div>
	<div class="kpi">
		<span class="kpi-icon green" aria-hidden="true">
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
		</span>
		<div>
			<span class="kpi-label">Restituídos</span>
			<strong class="kpi-value">{data.contadores.restituidos}</strong>
		</div>
	</div>
	<div class="kpi">
		<span class="kpi-icon violet" aria-hidden="true">
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" /><path d="m3 8 9 5 9-5M12 13v8" /></svg>
		</span>
		<div>
			<span class="kpi-label">Caixas físicas</span>
			<strong class="kpi-value">{data.caixas.length}</strong>
		</div>
	</div>
</section>

{#if feedback}
	<div class="alert {feedback.tipo === 'ok' ? 'success' : 'error'}" role="status">
		<span>{feedback.texto}</span>
		<button type="button" class="close-btn" aria-label="Fechar aviso" onclick={() => (feedback = null)}>×</button>
	</div>
{/if}

<form
	method="GET"
	class="filtros panel"
	class:com-unidade={data.unidade?.role === 'ADMIN' && data.unidades.length > 0}
	role="search"
>
	{#if data.paginacao.porPaginaOpcao && data.paginacao.porPaginaOpcao !== '10'}
		<input type="hidden" name="porPagina" value={data.paginacao.porPaginaOpcao} />
	{/if}
	<div class="f-busca">
		<svg class="f-busca-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
		<input
			id="filtro-busca"
			type="search"
			name="q"
			value={data.filtros.q}
			placeholder="Buscar procedimento, item apreendido, parte, IMEI, caixa..."
			aria-label="Buscar bens e apreensões"
		/>
	</div>
	{#if data.unidade?.role === 'ADMIN' && data.unidades.length > 0}
		<select
			id="filtro-unidade"
			name="unidade"
			value={data.filtros.unidade}
			aria-label="Filtrar por unidade"
			onchange={(e) => filtrarPorUnidade(e.currentTarget.value)}
		>
			<option value="todas">Todas as unidades</option>
			{#each data.unidades as u}
				<option value={String(u.id)}>{u.nome} ({u.total_bens})</option>
			{/each}
		</select>
	{/if}
	<select
		id="filtro-status"
		name="status"
		value={data.filtros.status}
		aria-label="Filtrar por status"
		onchange={(e) => e.currentTarget.form?.requestSubmit()}
	>
		<option value="">Todos os status</option>
		{#each STATUS_OPCOES as st}
			<option value={st.value}>{st.label}</option>
		{/each}
	</select>
	<CaixaSelect
		name="caixa"
		opcoes={opcoesFiltroCaixa}
		value={data.filtros.caixa}
		placeholder="Todas as caixas"
		buscaPlaceholder="Pesquisar nome da caixa..."
		onchange={(val) => filtrarPorCaixa(val)}
	/>
	<CaixaSelect
		name="procedimento"
		opcoes={opcoesFiltroProcedimento}
		value={data.filtros.procedimento}
		placeholder="Todos os procedimentos"
		buscaPlaceholder="Pesquisar BO / IP / TCO..."
		onchange={(val) => filtrarPorProcedimento(val)}
	/>
	<div class="f-acoes">
		<button type="submit" class="btn btn-dark">Filtrar</button>
		{#if data.filtros.q || data.filtros.status || data.filtros.caixa || data.filtros.procedimento || (data.unidade?.role === 'ADMIN' && data.filtros.unidade !== String(data.unidade.id))}
			<a
				href={data.paginacao.porPaginaOpcao && data.paginacao.porPaginaOpcao !== '10'
					? `/?porPagina=${data.paginacao.porPaginaOpcao}`
					: '/'}
				class="btn btn-ghost">Limpar</a
			>
		{/if}
	</div>
</form>

{#if selecionados.length > 0}
	<div class="bulk-bar" role="region" aria-label="Ações em lote">
		<div class="bulk-head">
			<span class="bulk-count"><strong>{selecionados.length}</strong> selecionado(s)</span>
			<button type="button" class="bulk-clear" onclick={() => (selecionados = [])}>Limpar seleção</button>
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
					<input type="text" bind:value={nomeNovaCaixaLote} placeholder="Nome da nova caixa..." aria-label="Nome da nova caixa" />
				{/if}
				<button
					type="button"
					class="btn btn-primary btn-sm"
					disabled={processandoLote || !destinoLoteCaixa}
					onclick={moverSelecionadosParaCaixa}
				>
					Mover
				</button>
			</div>

			<span class="bulk-sep">ou</span>

			<div class="bulk-group">
				<select bind:value={statusLote} aria-label="Novo status para os selecionados">
					<option value="">Alterar status...</option>
					{#each STATUS_OPCOES as st}
						<option value={st.value}>{st.label}</option>
					{/each}
				</select>
				<button
					type="button"
					class="btn btn-sm bulk-btn"
					disabled={processandoLote || !statusLote}
					onclick={alterarStatusEmLote}
				>
					Aplicar
				</button>
			</div>

			<span class="bulk-sep">ou</span>

			<button
				type="button"
				class="btn btn-secondary btn-sm bulk-pdf-btn"
				disabled={processandoLote || exportando !== null}
				onclick={exportarPdfSelecionados}
				title="Baixar relatório em PDF contendo apenas os itens selecionados"
			>
				<span class="file-chip pdf" aria-hidden="true">PDF</span>
				{exportando === 'PDF_SELECIONADOS' ? 'Gerando...' : `Baixar PDF Selecionados (${selecionados.length})`}
			</button>

			<span class="bulk-sep">ou</span>

			<button
				type="button"
				class="btn btn-danger-solid btn-sm bulk-del"
				disabled={processandoLote}
				onclick={() => excluirItens(selecionados)}
			>
				<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>
				Excluir ({selecionados.length})
			</button>
		</div>
	</div>
{/if}

<section class="visao panel" aria-labelledby="visao-titulo">
	<div class="visao-titulo">
		<span class="visao-tag">Visualizando agora</span>
		<h2 id="visao-titulo">
			<span>{caixaVisualizadaLabel}</span>
			<span class="visao-dot" aria-hidden="true">•</span>
			<span>{procedimentoVisualizadoLabel}</span>
		</h2>
		<span class="visao-meta">
			{#if intervaloExibido}
				Exibindo <strong>{intervaloExibido.inicio}–{intervaloExibido.fim}</strong> de
				<strong>{intervaloExibido.totalItens}</strong> {intervaloExibido.totalItens === 1 ? 'procedimento' : 'procedimentos'}
			{:else}
				<strong>0</strong> procedimentos exibidos
			{/if}
		</span>
	</div>

	<div class="export-btns">
		<button
			type="button"
			class="btn btn-secondary btn-sm btn-export"
			disabled={data.paginacao.totalItens === 0 || exportando !== null}
			onclick={() => exportarRelatorio('XLSX')}
			title="Exportar todos os itens deste filtro em Excel (.xlsx)"
		>
			<span class="file-chip xlsx" aria-hidden="true">XLS</span>
			{exportando === 'XLSX' ? 'Gerando...' : 'Exportar XLSX'}
		</button>
		<button
			type="button"
			class="btn btn-secondary btn-sm btn-export"
			disabled={data.paginacao.totalItens === 0 || exportando !== null}
			onclick={() => exportarRelatorio('PDF')}
			title="Exportar todos os itens deste filtro em PDF (.pdf)"
		>
			<span class="file-chip pdf" aria-hidden="true">PDF</span>
			{exportando === 'PDF' ? 'Gerando...' : 'Exportar PDF'}
		</button>
	</div>
</section>

<div class="grupos-procedimentos">
	{#if data.bens.length === 0}
		<div class="empty-panel panel">
			<strong>Nenhum bem encontrado para este filtro.</strong>
			<p><a href="/importar">Importar lote de PDFs</a></p>
		</div>
	{/if}

	{#each gruposPorProcedimento as grupo (grupo.chave)}
		{@const expandido = !!procedimentosExpandidos[grupo.chave]}
		{@const todoMarcado = grupoTodoSelecionado(grupo)}
		{@const parteMarcado = grupoParcialmenteSelecionado(grupo)}

		<section class="proc-card panel" class:expandido>
			<header class="proc-card-header">
				<div class="proc-header-left">
					<label class="proc-select-wrap" title="Selecionar todos os bens deste procedimento">
						<input
							type="checkbox"
							checked={todoMarcado}
							indeterminate={parteMarcado}
							onchange={(e) => alternarGrupo(grupo, e.currentTarget.checked)}
							aria-label="Selecionar todos os itens de {grupo.proc_tipo} {grupo.proc_numero}"
						/>
					</label>

					<button
						type="button"
						class="proc-toggle-btn"
						onclick={() => alternarExpansao(grupo.chave)}
						aria-expanded={expandido}
						title={expandido ? 'Clique para recolher os itens' : 'Clique para exibir os itens'}
					>
						<div class="proc-identificacao">
							<span class="proc-tipo-badge">{grupo.proc_tipo}</span>
							<strong class="proc-numero">{grupo.proc_numero}</strong>
							{#if data.unidade?.role === 'ADMIN' && grupo.unidade_nome}
								<span class="badge purple">{grupo.unidade_nome}</span>
							{/if}
							{#if grupo.operacao}
								<span class="proc-operacao">• {grupo.operacao}</span>
							{/if}
						</div>
					</button>
				</div>

				<div class="proc-header-right">
					<div class="proc-resumo-badges">
						<span class="badge slate">{grupo.totalItens} {grupo.totalItens === 1 ? 'bem' : 'bens'}</span>
						{#if grupo.emDeposito > 0}
							<span class="badge amber">{grupo.emDeposito} em depósito</span>
						{/if}
						{#if grupo.restituidos > 0}
							<span class="badge green">{grupo.restituidos} restituído(s)</span>
						{/if}
					</div>

					<button
						type="button"
						class="btn btn-secondary btn-sm toggle-action-btn"
						onclick={() => alternarExpansao(grupo.chave)}
					>
						{expandido ? 'Recolher' : 'Exibir itens'}
					</button>
				</div>
			</header>

			{#if expandido}
				<div class="proc-itens-wrap">
					<div class="table-wrap cards">
						<table class="table bens-table">
							<thead>
								<tr>
									<th class="c-check">
										<input
											type="checkbox"
											checked={todoMarcado}
											indeterminate={parteMarcado}
											onchange={(e) => alternarGrupo(grupo, e.currentTarget.checked)}
											title="Selecionar todos deste procedimento"
											aria-label="Selecionar todos deste procedimento"
										/>
									</th>
									<th>Bem / Descrição</th>
									<th>Saldo</th>
									<th>Caixa</th>
									<th>Status</th>
									<th class="c-acoes"><span class="sr-only">Ações</span></th>
								</tr>
							</thead>
							<tbody>
								{#each grupo.itens as bem (bem.id)}
									<tr class:row-selected={selecionados.includes(bem.id)}>
										<td class="c-check">
											<input
												type="checkbox"
												checked={selecionados.includes(bem.id)}
												onchange={(e) => alternarItem(bem.id, e.currentTarget.checked)}
												aria-label="Selecionar item"
											/>
										</td>
										<td class="c-desc">
											<div class="cat">{bem.categoria}</div>
											<div class="desc">{bem.descricao_original}</div>
											{#if bem.identificador_unico}
												<div class="muted">ID: {bem.identificador_unico}</div>
											{/if}
										</td>
										<td class="c-saldo" data-label="Saldo">
											<span class="saldo"><strong>{bem.qtd_disponivel}</strong> / {bem.qtd_total} {bem.unidade}</span>
										</td>
										<td class="c-caixa" data-label="Caixa">
											<select
												class="row-select"
												value={bem.caixa_id ? String(bem.caixa_id) : ''}
												aria-label="Caixa do item"
												onchange={(e) => confirmarTrocaCaixa(bem, e.currentTarget)}
											>
												<option value="">Sem caixa</option>
												{#each data.caixas as cx}
													<option value={String(cx.id)}>{cx.nome}</option>
												{/each}
											</select>
										</td>
										<td class="c-status" data-label="Status">
											<select
												class="row-select status-select {bem.status.toLowerCase()}"
												value={bem.status}
												aria-label="Status do item"
												onchange={(e) => confirmarTrocaStatus(bem, e.currentTarget)}
											>
												{#each STATUS_OPCOES as st}
													<option value={st.value}>{st.label}</option>
												{/each}
											</select>
										</td>
										<td class="c-acoes">
											<button
												type="button"
												class="btn btn-danger btn-sm btn-icon"
												title="Excluir este item"
												aria-label="Excluir este item"
												onclick={() => excluirItens([bem.id])}
											>
												<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>
											</button>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</div>
			{/if}
		</section>
	{/each}
</div>

{#if data.paginacao.totalItens > 0}
	<nav class="paginacao" aria-label="Paginação de procedimentos">
		<span class="paginacao-info">
			{#if data.paginacao.porPaginaOpcao === 'todos'}
				Exibindo todos os <strong>{data.paginacao.totalItens}</strong> procedimentos retraídos
			{:else}
				{#if data.paginacao.totalPaginas > 1}
					Página <strong>{data.paginacao.paginaAtual}</strong> de
					<strong>{data.paginacao.totalPaginas}</strong> ·
				{/if}
				<strong>{data.paginacao.totalItens}</strong> {data.paginacao.totalItens === 1 ? 'procedimento retraído' : 'procedimentos retraídos'}
			{/if}
		</span>

		<div class="paginacao-controles">
			<div class="por-pagina-wrap">
				<label for="select-por-pagina" class="por-pagina-label">Exibir:</label>
				<select
					id="select-por-pagina"
					class="por-pagina-select"
					value={data.paginacao.porPaginaOpcao}
					onchange={(e) => alterarPorPagina(e.currentTarget.value)}
					aria-label="Quantidade de procedimentos por página"
				>
					<option value="10">10 por página</option>
					<option value="20">20 por página</option>
					<option value="50">50 por página</option>
					<option value="100">100 por página</option>
					<option value="todos">Todos</option>
				</select>
			</div>

			{#if data.paginacao.totalPaginas > 1}
				<div class="paginacao-botoes">
					<button
						type="button"
						class="page-btn"
						disabled={data.paginacao.paginaAtual <= 1}
						onclick={() => irParaPagina(data.paginacao.paginaAtual - 1)}
						aria-label="Página anterior"
					>
						← Anterior
					</button>

					{#if paginasVisiveis[0] > 1}
						<button type="button" class="page-btn num" onclick={() => irParaPagina(1)}>1</button>
						{#if paginasVisiveis[0] > 2}
							<span class="page-dots">…</span>
						{/if}
					{/if}

					{#each paginasVisiveis as p}
						<button
							type="button"
							class="page-btn num"
							class:active={p === data.paginacao.paginaAtual}
							aria-current={p === data.paginacao.paginaAtual ? 'page' : undefined}
							onclick={() => irParaPagina(p)}
						>
							{p}
						</button>
					{/each}

					{#if paginasVisiveis[paginasVisiveis.length - 1] < data.paginacao.totalPaginas}
						{#if paginasVisiveis[paginasVisiveis.length - 1] < data.paginacao.totalPaginas - 1}
							<span class="page-dots">…</span>
						{/if}
						<button
							type="button"
							class="page-btn num"
							onclick={() => irParaPagina(data.paginacao.totalPaginas)}
						>
							{data.paginacao.totalPaginas}
						</button>
					{/if}

					<button
						type="button"
						class="page-btn"
						disabled={data.paginacao.paginaAtual >= data.paginacao.totalPaginas}
						onclick={() => irParaPagina(data.paginacao.paginaAtual + 1)}
						aria-label="Próxima página"
					>
						Próxima →
					</button>
				</div>
			{/if}
		</div>
	</nav>
{/if}

<style>
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}

	/* KPIs */
	.kpis {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.85rem;
		margin-bottom: 1.1rem;
	}
	.kpi {
		display: flex;
		align-items: center;
		gap: 0.85rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-sm);
		padding: 0.95rem 1.05rem;
		min-width: 0;
	}
	.kpi-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		flex-shrink: 0;
		border-radius: 11px;
	}
	.kpi-icon.blue {
		background: var(--primary-soft);
		color: var(--primary);
	}
	.kpi-icon.amber {
		background: var(--warning-soft);
		color: hsl(32 90% 38%);
	}
	.kpi-icon.green {
		background: var(--success-soft);
		color: var(--success);
	}
	.kpi-icon.violet {
		background: var(--violet-soft);
		color: var(--violet);
	}
	.kpi-label {
		display: block;
		font-size: 0.78rem;
		font-weight: 500;
		color: var(--text-3);
	}
	.kpi-value {
		display: block;
		font-size: 1.55rem;
		font-weight: 700;
		letter-spacing: -0.025em;
		line-height: 1.15;
		font-variant-numeric: tabular-nums;
	}

	/* Filtros */
	.filtros {
		display: grid;
		grid-template-columns: minmax(170px, 1.5fr) repeat(3, minmax(150px, 1fr)) auto;
		gap: 0.6rem;
		align-items: center;
		padding: 0.85rem;
		margin-bottom: 1rem;
	}
	.filtros.com-unidade {
		grid-template-columns: minmax(165px, 1.5fr) repeat(4, minmax(130px, 1fr)) auto;
	}
	.f-busca {
		position: relative;
	}
	.f-busca input {
		width: 100%;
		padding-left: 2.2rem;
	}
	.f-busca-icon {
		position: absolute;
		left: 0.75rem;
		top: 50%;
		transform: translateY(-50%);
		color: var(--text-3);
		pointer-events: none;
	}
	.filtros > select {
		width: 100%;
	}
	.f-acoes {
		display: flex;
		gap: 0.4rem;
	}

	/* Barra de lote */
	.bulk-bar {
		position: sticky;
		top: calc(var(--header-h) + 10px);
		z-index: 30;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.75rem 1rem;
		flex-wrap: wrap;
		background: linear-gradient(180deg, hsl(221 39% 19%), hsl(222 42% 15%));
		color: #fff;
		padding: 0.7rem 0.9rem;
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-lg);
		margin-bottom: 1rem;
		animation: bulk-in 0.18s ease-out;
	}
	@keyframes bulk-in {
		from {
			opacity: 0;
			transform: translateY(-6px);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}
	.bulk-head {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}
	.bulk-count {
		font-size: 0.9rem;
	}
	.bulk-clear {
		background: none;
		border: none;
		padding: 0;
		color: hsl(220 20% 72%);
		font-size: 0.8rem;
		text-decoration: underline;
		text-underline-offset: 2px;
		cursor: pointer;
	}
	.bulk-clear:hover {
		color: #fff;
	}
	.bulk-actions {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
	}
	.bulk-group {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.bulk-group select,
	.bulk-group input,
	.bulk-group :global(.trigger) {
		min-height: 34px;
		font-size: 0.83rem;
		border-color: hsl(220 20% 34%);
	}
	.bulk-group :global(.caixa-select) {
		min-width: 230px;
	}
	.bulk-btn {
		background: hsl(0 0% 100% / 0.1);
		color: #fff;
		border-color: hsl(0 0% 100% / 0.16);
	}
	.bulk-btn:hover:not(:disabled) {
		background: hsl(0 0% 100% / 0.18);
	}
	.bulk-sep {
		font-size: 0.75rem;
		font-weight: 600;
		color: hsl(220 18% 62%);
	}

	/* Banner "Visualizando agora" */
	.visao {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.85rem 1.25rem;
		flex-wrap: wrap;
		padding: 0.95rem 1.1rem;
		margin-bottom: 0.85rem;
		background: linear-gradient(180deg, var(--surface), var(--surface-2));
	}
	.visao-titulo {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		min-width: 0;
	}
	.visao-tag {
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--primary);
	}
	.visao-titulo h2 {
		margin: 0;
		font-size: 1.08rem;
		font-weight: 700;
		display: flex;
		flex-wrap: wrap;
		column-gap: 0.45rem;
	}
	.visao-dot {
		color: var(--text-3);
		font-weight: 400;
	}
	.visao-meta {
		font-size: 0.83rem;
		color: var(--text-2);
	}
	.export-btns {
		display: flex;
		gap: 0.45rem;
	}
	.file-chip {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.1rem 0.32rem;
		border-radius: 4px;
		font-size: 0.6rem;
		font-weight: 800;
		letter-spacing: 0.04em;
		color: #fff;
	}
	.file-chip.xlsx {
		background: hsl(145 63% 32%);
	}
	.file-chip.pdf {
		background: hsl(354 70% 46%);
	}

	.bulk-pdf-btn {
		font-weight: 700;
	}

	/* Grupos por procedimento */
	.grupos-procedimentos {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin-bottom: 0.85rem;
	}
	.empty-panel {
		text-align: center;
		padding: 2.5rem 1rem;
		color: var(--text-2);
	}
	.proc-card {
		padding: 0;
		overflow: hidden;
		transition: border-color 0.15s, box-shadow 0.15s;
	}
	.proc-card.expandido {
		border-color: var(--primary-soft-2);
		box-shadow: var(--shadow);
	}
	.proc-card-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.75rem 1rem;
		flex-wrap: wrap;
		padding: 0.85rem 1.1rem;
		background: var(--surface);
		transition: background 0.12s;
	}
	.proc-card.expandido .proc-card-header {
		background: var(--surface-2);
		border-bottom: 1px solid var(--border);
	}
	.proc-header-left {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		min-width: 0;
		flex: 1 1 auto;
	}
	.proc-select-wrap {
		display: inline-flex;
		align-items: center;
		cursor: pointer;
		padding: 0.2rem;
	}
	.proc-toggle-btn {
		display: inline-flex;
		align-items: center;
		background: transparent;
		border: none;
		padding: 0.25rem 0;
		cursor: pointer;
		text-align: left;
		min-width: 0;
		color: inherit;
		font: inherit;
	}
	.proc-toggle-btn:hover .proc-numero {
		color: var(--primary);
	}
	.proc-identificacao {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		flex-wrap: wrap;
	}
	.paginacao-controles {
		display: flex;
		align-items: center;
		gap: 0.9rem;
		flex-wrap: wrap;
	}
	.por-pagina-wrap {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.84rem;
		color: var(--text-2);
	}
	.por-pagina-label {
		font-weight: 500;
	}
	.por-pagina-select {
		height: 36px;
		padding: 0 0.65rem;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-sm);
		background-color: var(--surface);
		color: var(--text);
		font-size: 0.84rem;
		font-weight: 600;
		cursor: pointer;
		transition: border-color 0.15s, background-color 0.15s;
	}
	.por-pagina-select:hover {
		border-color: var(--primary);
	}
	.por-pagina-select:focus {
		outline: 2px solid var(--primary);
		outline-offset: 1px;
	}
	.proc-tipo-badge {
		display: inline-block;
		padding: 0.12rem 0.45rem;
		border-radius: 4px;
		background: var(--surface-3);
		color: var(--text-2);
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.04em;
	}
	.proc-numero {
		font-size: 1.02rem;
		font-weight: 700;
		color: var(--text);
	}
	.proc-operacao {
		font-size: 0.85rem;
		color: var(--text-3);
		font-weight: 500;
	}
	.proc-sub {
		font-size: 0.78rem;
		color: var(--text-3);
	}
	.proc-header-right {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		flex-shrink: 0;
	}
	.proc-resumo-badges {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		flex-wrap: wrap;
	}
	.toggle-action-btn {
		font-weight: 600;
	}
	.proc-itens-wrap {
		padding: 0.85rem 1rem 1rem;
		background: var(--surface);
		animation: itens-in 0.16s ease-out;
	}
	@keyframes itens-in {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}

	/* Tabela de bens dentro do procedimento */
	.bens-table th.c-check,
	.bens-table td.c-check {
		width: 44px;
		padding-right: 0.25rem;
	}
	.bens-table td {
		vertical-align: top;
	}
	.bens-table td.c-check,
	.bens-table td.c-acoes {
		padding-top: 0.95rem;
	}
	.bens-table .c-acoes {
		width: 56px;
		text-align: right;
	}
	.bens-table tr.row-selected,
	.bens-table tr.row-selected:hover {
		background: var(--primary-soft);
	}
	.cat {
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		color: var(--text-3);
		text-transform: uppercase;
		margin-bottom: 0.1rem;
	}
	.desc {
		color: var(--text);
		line-height: 1.45;
		overflow-wrap: anywhere;
	}
	.saldo {
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
		color: var(--text-2);
	}
	.saldo strong {
		color: var(--text);
	}
	.row-select {
		min-height: 34px;
		max-width: 190px;
		padding-top: 0.3rem;
		padding-bottom: 0.3rem;
		font-size: 0.82rem;
	}
	.status-select {
		font-weight: 600;
		border-color: transparent;
		background-color: var(--surface-3);
		color: var(--text-2);
	}
	.status-select.em_deposito,
	.status-select.deposito_dp_igt {
		background-color: var(--warning-soft);
		color: var(--warning);
	}
	.status-select.restituido {
		background-color: var(--success-soft);
		color: var(--success);
	}
	.status-select.restituido_parcial,
	.status-select.em_extracao {
		background-color: var(--info-soft);
		color: var(--info);
	}
	.status-select.pericia,
	.status-select.judiciario,
	.status-select.deposito_judicial {
		background-color: var(--violet-soft);
		color: var(--violet);
	}
	.status-select.destruido {
		background-color: var(--danger-soft);
		color: var(--danger);
	}

	/* Tablet */
	@media (max-width: 1080px) {
		.filtros,
		.filtros.com-unidade {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.f-busca {
			grid-column: 1 / -1;
		}
		.f-acoes {
			justify-content: flex-end;
		}
	}

	@media (max-width: 960px) {
		.kpis {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	/* Celular */
	@media (max-width: 720px) {
		.head-cta {
			display: none;
		}
		.kpis {
			gap: 0.55rem;
			margin-bottom: 0.9rem;
		}
		.kpi {
			padding: 0.75rem;
			gap: 0.6rem;
			border-radius: var(--radius);
		}
		.kpi-icon {
			width: 34px;
			height: 34px;
			border-radius: 9px;
		}
		.kpi-value {
			font-size: 1.3rem;
		}
		.kpi-label {
			font-size: 0.72rem;
		}

		.filtros,
		.filtros.com-unidade {
			grid-template-columns: 1fr;
			padding: 0.75rem;
		}
		.f-acoes > * {
			flex: 1;
		}

		.bulk-bar {
			top: calc(var(--header-h) + 6px);
			flex-direction: column;
			align-items: stretch;
			padding: 0.8rem;
		}
		.bulk-head {
			justify-content: space-between;
		}
		.bulk-actions {
			flex-direction: column;
			align-items: stretch;
			gap: 0.5rem;
		}
		.bulk-group {
			display: grid;
			grid-template-columns: 1fr auto;
		}
		.bulk-group input {
			grid-column: 1 / -1;
			grid-row: 2;
		}
		.bulk-group :global(.caixa-select) {
			min-width: 0;
		}
		.bulk-group select,
		.bulk-group input,
		.bulk-group :global(.trigger) {
			min-height: 42px;
			font-size: 16px;
		}
		.bulk-sep {
			display: none;
		}
		.bulk-del {
			width: 100%;
		}

		.visao {
			flex-direction: column;
			align-items: stretch;
			padding: 0.85rem;
		}
		.visao-titulo h2 {
			font-size: 1rem;
		}
		.export-btns {
			display: grid;
			grid-template-columns: 1fr 1fr;
		}

		.select-all-mobile {
			display: flex;
			align-items: center;
			gap: 0.55rem;
			padding: 0.2rem 0.25rem 0.65rem;
			font-size: 0.85rem;
			font-weight: 500;
			color: var(--text-2);
		}

		.proc-card-header {
			padding: 0.75rem 0.85rem;
			gap: 0.6rem;
		}
		.proc-header-left {
			width: 100%;
		}
		.proc-header-right {
			width: 100%;
			justify-content: space-between;
		}
		.paginacao-controles {
			width: 100%;
			justify-content: center;
			gap: 0.65rem;
		}
		.proc-itens-wrap {
			padding: 0.5rem 0.65rem 0.75rem;
		}

		/* Card do bem */
		.bens-table tr:not(.row-empty) {
			display: grid !important;
			grid-template-columns: auto 1fr auto;
			grid-template-areas:
				'check desc acoes'
				'saldo saldo saldo'
				'caixa caixa status';
			column-gap: 0.65rem;
			row-gap: 0.35rem;
		}
		.bens-table td.c-check {
			grid-area: check;
			width: auto;
			padding: 0.1rem 0 0;
		}
		.bens-table td.c-acoes {
			grid-area: acoes;
			width: auto;
			padding: 0;
		}
		.bens-table td.c-desc {
			grid-area: desc;
			padding: 0 0 0.35rem;
		}
		.bens-table td.c-saldo {
			grid-area: saldo;
			display: flex !important;
			align-items: center;
			gap: 0.4rem;
		}
		.bens-table td.c-saldo::before {
			display: inline !important;
			margin: 0 !important;
		}
		.bens-table td.c-caixa {
			grid-area: caixa;
			min-width: 0;
		}
		.bens-table td.c-status {
			grid-area: status;
			min-width: 0;
		}
		.row-select {
			width: 100%;
			max-width: none;
			min-height: 42px;
			font-size: 16px;
		}
		.bens-table tr.row-selected {
			border-color: var(--primary-soft-2);
			box-shadow: 0 0 0 2px var(--primary-soft-2);
		}
		.bens-table tr.row-selected:hover {
			background: var(--primary-soft);
		}
	}

	@media (max-width: 400px) {
		.bens-table tr:not(.row-empty) {
			grid-template-areas:
				'check desc acoes'
				'saldo saldo saldo'
				'caixa caixa caixa'
				'status status status';
		}
	}
</style>
