export type StatusTarefa = 'ociosa' | 'executando' | 'concluida' | 'erro';

export interface AcaoTarefa {
	label: string;
	href: string;
}

export interface EstadoTarefa {
	status: StatusTarefa;
	titulo: string;
	detalhe: string | null;
	progresso: number | null; // 0 a 100, ou null para indeterminado
	acao: AcaoTarefa | null;
}

let autoCloseTimer: ReturnType<typeof setTimeout> | null = null;

function limparTimer() {
	if (autoCloseTimer) {
		clearTimeout(autoCloseTimer);
		autoCloseTimer = null;
	}
}

class TarefaStore {
	status = $state<StatusTarefa>('ociosa');
	titulo = $state('');
	detalhe = $state<string | null>(null);
	progresso = $state<number | null>(null);
	acao = $state<AcaoTarefa | null>(null);

	iniciar(titulo: string, detalhe: string | null = null, progresso: number | null = null) {
		limparTimer();
		this.status = 'executando';
		this.titulo = titulo;
		this.detalhe = detalhe;
		this.progresso = progresso;
		this.acao = null;
	}

	atualizar(titulo: string, detalhe: string | null = null, progresso: number | null = null) {
		if (this.status !== 'executando') {
			this.status = 'executando';
		}
		this.titulo = titulo;
		this.detalhe = detalhe;
		this.progresso = progresso;
	}

	concluir(
		titulo: string,
		detalhe: string | null = null,
		opcoes?: { acao?: AcaoTarefa | null; autoFecharMs?: number | null }
	) {
		limparTimer();
		this.status = 'concluida';
		this.titulo = titulo;
		this.detalhe = detalhe;
		this.progresso = 100;
		this.acao = opcoes?.acao ?? null;

		if (opcoes?.autoFecharMs && opcoes.autoFecharMs > 0) {
			autoCloseTimer = setTimeout(() => {
				this.fechar();
			}, opcoes.autoFecharMs);
		}
	}

	falhar(titulo: string, detalhe: string | null = null) {
		limparTimer();
		this.status = 'erro';
		this.titulo = titulo;
		this.detalhe = detalhe;
		this.progresso = null;
		this.acao = null;
	}

	fechar() {
		limparTimer();
		this.status = 'ociosa';
		this.titulo = '';
		this.detalhe = null;
		this.progresso = null;
		this.acao = null;
	}
}

export const tarefaStore = new TarefaStore();
