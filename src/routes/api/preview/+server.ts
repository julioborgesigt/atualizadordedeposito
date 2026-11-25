import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { DocumentoParseado, PreviewDocumento } from '$lib/types';
import { conciliarRestituicao, type CandidatoBem } from '$lib/server/matcher';

export const POST: RequestHandler = async ({ request, platform }) => {
	const db = platform?.env?.DB;
	if (!db) throw error(500, 'Binding DB (Cloudflare D1) não configurado.');

	const { documentos } = (await request.json()) as { documentos: DocumentoParseado[] };
	if (!Array.isArray(documentos) || documentos.length === 0) {
		throw error(400, 'Nenhum documento enviado.');
	}

	const ordenados = [...documentos].sort((a, b) => {
		if (a.tipoDocumento !== b.tipoDocumento) {
			return a.tipoDocumento === 'APREENSAO' ? -1 : 1;
		}
		return (a.dataAto ?? '').localeCompare(b.dataAto ?? '');
	});

	const hashes = ordenados.map((d) => d.hashSha256);
	const placeholdersHash = hashes.map(() => '?').join(',');
	const { results: docsExistentes } = await db
		.prepare(`SELECT hash_sha256 FROM documentos WHERE hash_sha256 IN (${placeholdersHash})`)
		.bind(...hashes)
		.all<{ hash_sha256: string }>();

	const hashesImportados = new Set(docsExistentes.map((r) => r.hash_sha256));

	const { results: caixas } = await db
		.prepare('SELECT id, nome FROM caixas ORDER BY nome ASC')
		.all<{ id: number; nome: string }>();

	const numerosProc = [...new Set(ordenados.map((d) => d.numeroProcedimento))];
	const poolsPorProc = new Map<string, CandidatoBem[]>();

	for (const num of numerosProc) {
		const { results: bensBanco } = await db
			.prepare(
				`SELECT b.id, b.descricao_original, b.descricao_normalizada,
				        b.identificador_unico, b.qtd_disponivel
				 FROM bens b
				 JOIN procedimentos p ON p.id = b.procedimento_id
				 WHERE b.status IN ('EM_DEPOSITO', 'RESTITUIDO_PARCIAL')
				   AND (
				     p.numero_normalizado = ?
				     OR p.procedimento_principal_id IN (SELECT id FROM procedimentos WHERE numero_normalizado = ?)
				     OR p.id IN (SELECT procedimento_principal_id FROM procedimentos WHERE numero_normalizado = ? AND procedimento_principal_id IS NOT NULL)
				   )`
			)
			.bind(num, num, num)
			.all<{
				id: number;
				descricao_original: string;
				descricao_normalizada: string;
				identificador_unico: string | null;
				qtd_disponivel: number;
			}>();

		poolsPorProc.set(
			num,
			bensBanco.map((b) => ({
				key: `db:${b.id}`,
				origem: 'BANCO',
				descricaoOriginal: b.descricao_original,
				descricaoNormalizada: b.descricao_normalizada,
				identificadorUnico: b.identificador_unico,
				qtdDisponivel: b.qtd_disponivel
			}))
		);
	}

	const tempKeysRestituidasNoLote = new Set<string>();
	const previewDocs: PreviewDocumento[] = ordenados.map((doc, docIdx) => {
		const jaImportado = hashesImportados.has(doc.hashSha256);
		const pool = poolsPorProc.get(doc.numeroProcedimento) ?? [];

		if (doc.tipoDocumento === 'APREENSAO') {
			const itensApreensao = doc.itens.map((item, itemIdx) => {
				const tempKey = `tmp:${docIdx}:${itemIdx}`;
				if (!jaImportado) {
					pool.push({
						key: tempKey,
						origem: 'LOTE',
						descricaoOriginal: item.descricaoOriginal,
						descricaoNormalizada: item.descricaoNormalizada,
						identificadorUnico: item.identificadorUnico,
						qtdDisponivel: item.quantidade
					});
				}
				return { tempKey, incluir: !jaImportado, item, seraRestituidoNoLote: false };
			});

			poolsPorProc.set(doc.numeroProcedimento, pool);

			return {
				...doc,
				jaImportado,
				itensApreensao,
				itensRestituicao: [],
				candidatosDisponiveis: []
			};
		}

		const candidatosDisponiveis = pool.map((c) => ({
			key: c.key,
			origem: c.origem,
			label: c.descricaoOriginal
		}));

		const itensRestituicao = jaImportado ? [] : conciliarRestituicao(doc.itens, pool);
		for (const match of itensRestituicao) {
			if (match.alvoKey.startsWith('tmp:')) {
				tempKeysRestituidasNoLote.add(match.alvoKey);
			}
		}

		return {
			...doc,
			jaImportado,
			itensApreensao: [],
			itensRestituicao,
			candidatosDisponiveis
		};
	});

	for (const doc of previewDocs) {
		if (doc.tipoDocumento === 'APREENSAO') {
			for (const entry of doc.itensApreensao) {
				entry.seraRestituidoNoLote = tempKeysRestituidasNoLote.has(entry.tempKey);
			}
		}
	}

	return json({ caixas, documentos: previewDocs });
};
