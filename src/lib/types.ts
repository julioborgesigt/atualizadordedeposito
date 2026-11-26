export type TipoDocumento = 'APREENSAO' | 'RESTITUICAO';
export type TipoProcedimento = string;
export type TipoIdentificador = 'IMEI' | 'PLACA' | 'CARTAO' | 'CNPJ' | 'SERIE';

export type StatusBem =
	| 'EM_DEPOSITO'
	| 'DEPOSITO_DP_IGT'
	| 'EM_EXTRACAO'
	| 'RESTITUIDO_PARCIAL'
	| 'RESTITUIDO'
	| 'PERICIA'
	| 'JUDICIARIO'
	| 'DESTRUIDO';

export interface ItemExtraido {
	categoria: string;
	descricaoOriginal: string;
	descricaoNormalizada: string;
	tipoIdentificador: TipoIdentificador | null;
	identificadorUnico: string | null;
	quantidade: number;
	unidade: string;
}

export interface DocumentoParseado {
	nomeArquivo: string;
	hashSha256: string;
	tipoDocumento: TipoDocumento;
	tipoProcedimento: TipoProcedimento;
	numeroProcedimento: string;
	dataAto: string | null;
	delegado: string | null;
	parteNome: string | null;
	parteCpf: string | null;
	itens: ItemExtraido[];
}

export interface PreviewItemApreensao {
	tempKey: string;
	incluir: boolean;
	item: ItemExtraido;
	seraRestituidoNoLote: boolean;
}

export interface PreviewItemRestituicao {
	item: ItemExtraido;
	alvoKey: string;
	alvoDescricao: string | null;
	origemAlvo: 'BANCO' | 'LOTE' | null;
	camada: 'EXATO' | 'IDENTIFICADOR' | 'SIMILARIDADE' | 'NAO_ENCONTRADO';
	confianca: number;
	novoStatusSugerido: 'RESTITUIDO' | 'RESTITUIDO_PARCIAL' | null;
}

export interface PreviewCandidatoOption {
	key: string;
	origem: 'BANCO' | 'LOTE';
	label: string;
}

export interface PreviewDocumento extends DocumentoParseado {
	jaImportado: boolean;
	itensApreensao: PreviewItemApreensao[];
	itensRestituicao: PreviewItemRestituicao[];
	candidatosDisponiveis: PreviewCandidatoOption[];
}
