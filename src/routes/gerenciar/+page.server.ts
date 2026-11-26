import type { PageServerLoad } from './$types';
import { ensureSchema, limparResquiciosOrfaos } from '$lib/server/db';

export interface CaixaGerenciamento {
	id: number;
	nome: string;
	setor: string | null;
	observacoes: string | null;
	criado_em: string;
	total_bens: number;
	em_deposito: number;
	restituidos: number;
}

export interface DocumentoGerenciamento {
	id: number;
	doc_tipo: string;
	nome_arquivo: string;
	data_ato: string | null;
	parte_nome: string | null;
	delegado: string | null;
	proc_id: number;
	proc_tipo: string;
	proc_numero: string;
	operacao: string | null;
	qtd_bens: number;
	caixas_nomes: string | null;
}

export const load: PageServerLoad = async ({ platform }) => {
	const db = platform?.env?.DB;
	if (!db) {
		return {
			caixas: [] as CaixaGerenciamento[],
			documentos: [] as DocumentoGerenciamento[]
		};
	}

	await ensureSchema(db);
	await limparResquiciosOrfaos(db);

	const { results: caixasRaw } = await db
		.prepare(
			`SELECT c.id, c.nome, c.setor, c.observacoes, c.criado_em,
			        COUNT(b.id) AS total_bens,
			        SUM(CASE WHEN b.status IN ('EM_DEPOSITO', 'DEPOSITO_DP_IGT', 'RESTITUIDO_PARCIAL') THEN 1 ELSE 0 END) AS em_deposito,
			        SUM(CASE WHEN b.status = 'RESTITUIDO' THEN 1 ELSE 0 END) AS restituidos
			 FROM caixas c
			 LEFT JOIN bens b ON b.caixa_id = c.id
			 GROUP BY c.id
			 ORDER BY c.nome ASC`
		)
		.all<{
			id: number;
			nome: string;
			setor: string | null;
			observacoes: string | null;
			criado_em: string;
			total_bens: number;
			em_deposito: number | null;
			restituidos: number | null;
		}>();

	const caixas: CaixaGerenciamento[] = caixasRaw.map((c) => ({
		id: c.id,
		nome: c.nome,
		setor: c.setor,
		observacoes: c.observacoes,
		criado_em: c.criado_em,
		total_bens: c.total_bens ?? 0,
		em_deposito: c.em_deposito ?? 0,
		restituidos: c.restituidos ?? 0
	}));

	const { results: documentos } = await db
		.prepare(
			`SELECT d.id, d.tipo AS doc_tipo, d.nome_arquivo, d.data_ato, d.parte_nome, d.delegado,
			        p.id AS proc_id, p.tipo AS proc_tipo, p.numero_normalizado AS proc_numero, p.operacao,
			        COUNT(DISTINCT b.id) AS qtd_bens,
			        GROUP_CONCAT(DISTINCT c.nome) AS caixas_nomes
			 FROM documentos d
			 JOIN procedimentos p ON p.id = d.procedimento_id
			 LEFT JOIN movimentacoes m ON m.documento_id = d.id
			 LEFT JOIN bens b ON b.id = m.bem_id
			 LEFT JOIN caixas c ON c.id = b.caixa_id
			 GROUP BY d.id
			 ORDER BY d.importado_em DESC, d.id DESC
			 LIMIT 200`
		)
		.all<DocumentoGerenciamento>();

	return {
		caixas,
		documentos
	};
};
