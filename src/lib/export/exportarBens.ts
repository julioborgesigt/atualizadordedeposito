import type { BemLista } from '../../routes/+page.server';

export interface ContextoExportacao {
	caixaLabel: string;
	procedimentoLabel: string;
	statusLabel: string;
	termoBusca: string;
	tituloRelatorio?: string;
}

const MAPA_STATUS: Record<string, string> = {
	EM_DEPOSITO: 'Em depósito',
	RESTITUIDO: 'Restituído',
	RESTITUIDO_PARCIAL: 'Restituído parcial',
	PERICIA: 'Perícia (PEFOCE)',
	JUDICIARIO: 'Judiciário',
	DESTRUIDO: 'Destruído'
};

export function traduzirStatus(status: string): string {
	return MAPA_STATUS[status] ?? status;
}

function gerarSufixoArquivo(): string {
	const agora = new Date();
	const yyyy = agora.getFullYear();
	const mm = String(agora.getMonth() + 1).padStart(2, '0');
	const dd = String(agora.getDate()).padStart(2, '0');
	const hh = String(agora.getHours()).padStart(2, '0');
	const min = String(agora.getMinutes()).padStart(2, '0');
	return `${yyyy}-${mm}-${dd}_${hh}h${min}`;
}

export async function exportarParaXlsx(
	bens: BemLista[],
	contexto: ContextoExportacao
): Promise<void> {
	const XLSX = await import('xlsx');

	const linhas = bens.map((bem) => ({
		Procedimento: `${bem.proc_tipo} ${bem.proc_numero}`,
		'Operação': bem.operacao ?? '-',
		Categoria: bem.categoria,
		'Descrição do Bem': bem.descricao_original,
		'Qtd. Disponível': bem.qtd_disponivel,
		'Qtd. Total': bem.qtd_total,
		Unidade: bem.unidade,
		'Caixa / Local': bem.caixa_nome ?? 'Sem caixa',
		Status: traduzirStatus(bem.status)
	}));

	const ws = XLSX.utils.json_to_sheet(linhas);

	// Ajusta larguras das colunas para leitura confortável no Excel
	ws['!cols'] = [
		{ wch: 18 }, // Procedimento
		{ wch: 22 }, // Operação
		{ wch: 22 }, // Categoria
		{ wch: 68 }, // Descrição do Bem
		{ wch: 15 }, // Qtd. Disponível
		{ wch: 12 }, // Qtd. Total
		{ wch: 10 }, // Unidade
		{ wch: 24 }, // Caixa / Local
		{ wch: 18 }  // Status
	];

	const wb = XLSX.utils.book_new();
	const nomeAba = (contexto.caixaLabel || 'Bens').replace(/[\\/?*[\]:]/g, '').slice(0, 31) || 'Bens';
	XLSX.utils.book_append_sheet(wb, ws, nomeAba);

	XLSX.writeFile(wb, `custodia-pcce-${gerarSufixoArquivo()}.xlsx`);
}

export async function exportarParaPdf(
	bens: BemLista[],
	contexto: ContextoExportacao
): Promise<void> {
	const [{ jsPDF }, { default: autoTable }] = await Promise.all([
		import('jspdf'),
		import('jspdf-autotable')
	]);

	const doc = new jsPDF({
		orientation: 'landscape',
		unit: 'mm',
		format: 'a4'
	});

	const dataHora = new Date().toLocaleString('pt-BR');
	const filtrosAtivos = [
		contexto.caixaLabel,
		contexto.procedimentoLabel,
		contexto.statusLabel ? `Status: ${contexto.statusLabel}` : null,
		contexto.termoBusca ? `Busca: "${contexto.termoBusca}"` : null
	]
		.filter(Boolean)
		.join('  •  ');

	doc.setFont('helvetica', 'bold');
	doc.setFontSize(13);
	doc.setTextColor(15, 23, 42);
	doc.text(
		contexto.tituloRelatorio || 'CUSTÓDIA PCCE — RELATÓRIO DE BENS APREENDIDOS E RESTITUIÇÕES',
		14,
		14
	);

	doc.setFont('helvetica', 'normal');
	doc.setFontSize(9.5);
	doc.setTextColor(51, 65, 85);
	doc.text(`Visualização / Filtros: ${filtrosAtivos}`, 14, 20);

	doc.setFontSize(8.5);
	doc.setTextColor(100, 116, 139);
	doc.text(`Emitido em: ${dataHora}   |   Total de itens listados: ${bens.length}`, 14, 25);

	const body = bens.map((bem) => [
		`${bem.proc_tipo} ${bem.proc_numero}${bem.operacao ? `\n(${bem.operacao})` : ''}`,
		bem.categoria,
		bem.descricao_original,
		`${bem.qtd_disponivel} / ${bem.qtd_total} ${bem.unidade}`,
		bem.caixa_nome ?? 'Sem caixa',
		traduzirStatus(bem.status)
	]);

	autoTable(doc, {
		startY: 29,
		head: [['Procedimento', 'Categoria', 'Descrição do Bem', 'Saldo', 'Caixa', 'Status']],
		body,
		styles: {
			font: 'helvetica',
			fontSize: 8.2,
			cellPadding: 2.5,
			textColor: [30, 41, 59],
			overflow: 'linebreak'
		},
		headStyles: {
			fillColor: [15, 23, 42],
			textColor: [255, 255, 255],
			fontStyle: 'bold'
		},
		alternateRowStyles: {
			fillColor: [248, 250, 252]
		},
		columnStyles: {
			0: { cellWidth: 32, fontStyle: 'bold' },
			1: { cellWidth: 34 },
			2: { cellWidth: 'auto' },
			3: { cellWidth: 26, halign: 'center' },
			4: { cellWidth: 34 },
			5: { cellWidth: 28, halign: 'center' }
		},
		didDrawPage: () => {
			const pageCount = doc.getNumberOfPages();
			const currentPage = doc.getCurrentPageInfo().pageNumber;
			doc.setFontSize(8);
			doc.setTextColor(100, 116, 139);
			doc.text(
				`Página ${currentPage} de ${pageCount}`,
				doc.internal.pageSize.getWidth() - 14,
				doc.internal.pageSize.getHeight() - 8,
				{ align: 'right' }
			);
		}
	});

	doc.save(`custodia-pcce-${gerarSufixoArquivo()}.pdf`);
}
