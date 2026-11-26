export interface OpcoesConfirmacao {
	titulo: string;
	mensagem: string;
	textoConfirmar?: string;
	textoCancelar?: string;
	perigoso?: boolean;
}

class ConfirmacaoStore {
	aberto = $state(false);
	titulo = $state('');
	mensagem = $state('');
	textoConfirmar = $state('Confirmar');
	textoCancelar = $state('Cancelar');
	perigoso = $state(false);

	private resolver: ((valor: boolean) => void) | null = null;

	pedir(opcoes: OpcoesConfirmacao): Promise<boolean> {
		if (this.resolver) {
			this.resolver(false);
			this.resolver = null;
		}
		this.titulo = opcoes.titulo;
		this.mensagem = opcoes.mensagem;
		this.textoConfirmar = opcoes.textoConfirmar ?? 'Confirmar';
		this.textoCancelar = opcoes.textoCancelar ?? 'Cancelar';
		this.perigoso = opcoes.perigoso ?? false;
		this.aberto = true;

		return new Promise<boolean>((resolve) => {
			this.resolver = resolve;
		});
	}

	responder(valor: boolean) {
		this.aberto = false;
		const fn = this.resolver;
		this.resolver = null;
		if (fn) fn(valor);
	}
}

export const confirmacaoStore = new ConfirmacaoStore();

export function confirmarAcao(opcoes: OpcoesConfirmacao): Promise<boolean> {
	return confirmacaoStore.pedir(opcoes);
}
