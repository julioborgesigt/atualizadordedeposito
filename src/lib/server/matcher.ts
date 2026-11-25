import type { ItemExtraido, PreviewItemRestituicao } from '$lib/types';

export interface CandidatoBem {
	key: string; // 'db:12' ou 'tmp:0:1'
	origem: 'BANCO' | 'LOTE';
	descricaoOriginal: string;
	descricaoNormalizada: string;
	identificadorUnico: string | null;
	qtdDisponivel: number;
}

function similaridadeTokens(a: string, b: string): number {
	const setA = new Set(a.split(/\s+/).filter((t) => t.length > 2));
	const setB = new Set(b.split(/\s+/).filter((t) => t.length > 2));
	if (setA.size === 0 || setB.size === 0) return 0;

	let intersecao = 0;
	for (const token of setA) {
		if (setB.has(token)) intersecao++;
	}
	return Math.round((intersecao / Math.max(setA.size, setB.size)) * 100);
}

export function conciliarRestituicao(
	itensRestituidos: ItemExtraido[],
	poolCandidatos: CandidatoBem[]
): PreviewItemRestituicao[] {
	return itensRestituidos.map((item) => {
		const disponiveis = poolCandidatos.filter((c) => c.qtdDisponivel > 0);

		// Camada 1: descrição normalizada exata
		let alvo = disponiveis.find((c) => c.descricaoNormalizada === item.descricaoNormalizada);
		let camada: PreviewItemRestituicao['camada'] = 'EXATO';
		let confianca = 100;

		// Camada 2: identificador único (IMEI, Placa, Cartão, CNPJ)
		if (!alvo && item.identificadorUnico) {
			alvo = disponiveis.find((c) => c.identificadorUnico === item.identificadorUnico);
			camada = 'IDENTIFICADOR';
			confianca = 98;
		}

		// Camada 3: similaridade de tokens
		if (!alvo) {
			let melhorScore = 0;
			for (const candidato of disponiveis) {
				const score = similaridadeTokens(
					item.descricaoNormalizada,
					candidato.descricaoNormalizada
				);
				if (score > melhorScore) {
					melhorScore = score;
					alvo = candidato;
				}
			}
			if (alvo && melhorScore >= 55) {
				camada = 'SIMILARIDADE';
				confianca = melhorScore;
			} else {
				alvo = undefined;
				camada = 'NAO_ENCONTRADO';
				confianca = 0;
			}
		}

		if (alvo) {
			const restante = Math.max(0, alvo.qtdDisponivel - item.quantidade);
			alvo.qtdDisponivel = restante;

			return {
				item,
				alvoKey: alvo.key,
				alvoDescricao: alvo.descricaoOriginal,
				origemAlvo: alvo.origem,
				camada,
				confianca,
				novoStatusSugerido: restante > 0 ? 'RESTITUIDO_PARCIAL' : 'RESTITUIDO'
			};
		}

		return {
			item,
			alvoKey: '__CRIAR_RESTITUIDO__',
			alvoDescricao: null,
			origemAlvo: null,
			camada: 'NAO_ENCONTRADO',
			confianca: 0,
			novoStatusSugerido: 'RESTITUIDO'
		};
	});
}
