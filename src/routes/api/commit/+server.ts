import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { PreviewDocumento, TipoProcedimento } from '$lib/types';

interface CommitPayload {
	caixaNome: string | null;
	operacao: string | null;
	documentos: PreviewDocumento[];
}

async function obterOuCriarProcedimento(
	db: D1Database,
	tipo: TipoProcedimento,
	numero: string,
	operacao: string | null
): Promise<number> {
	await db
		.prepare(
			`INSERT OR IGNORE INTO procedimentos (tipo, numero_normalizado, operacao)
			 VALUES (?, ?, ?)`
		)
		.bind(tipo, numero, operacao || null)
		.run();

	if (operacao) {
		await db
			.prepare(
				`UPDATE procedimentos SET operacao = COALESCE(operacao, ?) WHERE numero_normalizado = ?`
			)
			.bind(operacao, numero)
			.run();
	}

	const row = await db
		.prepare('SELECT id FROM procedimentos WHERE numero_normalizado = ?')
		.bind(numero)
		.first<{ id: number }>();

	return row!.id;
}

export const POST: RequestHandler = async ({ request, platform }) => {
	const db = platform?.env?.DB;
	if (!db) throw error(500, 'Binding DB (Cloudflare D1) não configurado.');

	const payload = (await request.json()) as CommitPayload;
	const docsValidos = payload.documentos.filter((d) => !d.jaImportado);
	if (docsValidos.length === 0) {
		throw error(400, 'Todos os documentos deste lote já foram importados anteriormente.');
	}

	let caixaId: number | null = null;
	const caixaLimpa = payload.caixaNome?.trim() || null;
	if (caixaLimpa) {
		await db.prepare('INSERT OR IGNORE INTO caixas (nome) VALUES (?)').bind(caixaLimpa).run();
		const rowCaixa = await db
			.prepare('SELECT id FROM caixas WHERE nome = ?')
			.bind(caixaLimpa)
			.first<{ id: number }>();
		caixaId = rowCaixa?.id ?? null;
	}

	const tempKeyParaIdReal = new Map<string, number>();
	let totalApreendidos = 0;
	let totalRestituidos = 0;
	let docsSalvos = 0;

	const apreensoes = docsValidos.filter((d) => d.tipoDocumento === 'APREENSAO');
	const restituicoes = docsValidos.filter((d) => d.tipoDocumento === 'RESTITUICAO');

	for (const doc of apreensoes) {
		const procId = await obterOuCriarProcedimento(
			db,
			doc.tipoProcedimento,
			doc.numeroProcedimento,
			payload.operacao?.trim() || null
		);

		const resDoc = await db
			.prepare(
				`INSERT INTO documentos
				 (procedimento_id, tipo, nome_arquivo, hash_sha256, data_ato, delegado, parte_nome, parte_cpf)
				 VALUES (?, 'APREENSAO', ?, ?, ?, ?, ?, ?)`
			)
			.bind(
				procId,
				doc.nomeArquivo,
				doc.hashSha256,
				doc.dataAto,
				doc.delegado,
				doc.parteNome,
				doc.parteCpf
			)
			.run();

		const docId = Number(resDoc.meta.last_row_id);
		docsSalvos++;

		for (const entry of doc.itensApreensao) {
			if (!entry.incluir) continue;
			const it = entry.item;

			const resBem = await db
				.prepare(
					`INSERT INTO bens
					 (procedimento_id, caixa_id, categoria, descricao_original, descricao_normalizada,
					  tipo_identificador, identificador_unico, qtd_total, qtd_disponivel, unidade, status)
					 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'EM_DEPOSITO')`
				)
				.bind(
					procId,
					caixaId,
					it.categoria,
					it.descricaoOriginal,
					it.descricaoNormalizada,
					it.tipoIdentificador,
					it.identificadorUnico,
					it.quantidade,
					it.quantidade,
					it.unidade
				)
				.run();

			const bemId = Number(resBem.meta.last_row_id);
			tempKeyParaIdReal.set(entry.tempKey, bemId);
			totalApreendidos++;

			await db
				.prepare(
					`INSERT INTO movimentacoes
					 (bem_id, documento_id, tipo_evento, qtd_movimentada, data_evento, parte_nome, parte_cpf)
					 VALUES (?, ?, 'APREENSAO', ?, ?, ?, ?)`
				)
				.bind(bemId, docId, it.quantidade, doc.dataAto, doc.parteNome, doc.parteCpf)
				.run();
		}
	}

	for (const doc of restituicoes) {
		const procId = await obterOuCriarProcedimento(
			db,
			doc.tipoProcedimento,
			doc.numeroProcedimento,
			payload.operacao?.trim() || null
		);

		const resDoc = await db
			.prepare(
				`INSERT INTO documentos
				 (procedimento_id, tipo, nome_arquivo, hash_sha256, data_ato, delegado, parte_nome, parte_cpf)
				 VALUES (?, 'RESTITUICAO', ?, ?, ?, ?, ?, ?)`
			)
			.bind(
				procId,
				doc.nomeArquivo,
				doc.hashSha256,
				doc.dataAto,
				doc.delegado,
				doc.parteNome,
				doc.parteCpf
			)
			.run();

		const docId = Number(resDoc.meta.last_row_id);
		docsSalvos++;

		for (const entry of doc.itensRestituicao) {
			if (entry.alvoKey === '__IGNORAR__') continue;

			if (entry.alvoKey === '__CRIAR_RESTITUIDO__') {
				const it = entry.item;
				const resBem = await db
					.prepare(
						`INSERT INTO bens
						 (procedimento_id, caixa_id, categoria, descricao_original, descricao_normalizada,
						  tipo_identificador, identificador_unico, qtd_total, qtd_disponivel, unidade, status)
						 VALUES (?, NULL, ?, ?, ?, ?, ?, ?, 0, ?, 'RESTITUIDO')`
					)
					.bind(
						procId,
						it.categoria,
						it.descricaoOriginal,
						it.descricaoNormalizada,
						it.tipoIdentificador,
						it.identificadorUnico,
						it.quantidade,
						it.unidade
					)
					.run();

				const bemId = Number(resBem.meta.last_row_id);
				await db
					.prepare(
						`INSERT INTO movimentacoes
						 (bem_id, documento_id, tipo_evento, qtd_movimentada, data_evento, parte_nome, parte_cpf)
						 VALUES (?, ?, 'RESTITUICAO', ?, ?, ?, ?)`
					)
					.bind(bemId, docId, it.quantidade, doc.dataAto, doc.parteNome, doc.parteCpf)
					.run();

				totalRestituidos++;
				continue;
			}

			let bemId: number | undefined;
			if (entry.alvoKey.startsWith('db:')) {
				bemId = Number(entry.alvoKey.slice(3));
			} else if (entry.alvoKey.startsWith('tmp:')) {
				bemId = tempKeyParaIdReal.get(entry.alvoKey);
			}

			if (!bemId) continue;

			const atual = await db
				.prepare('SELECT qtd_disponivel FROM bens WHERE id = ?')
				.bind(bemId)
				.first<{ qtd_disponivel: number }>();

			if (!atual) continue;

			const novaQtd = Math.max(0, atual.qtd_disponivel - entry.item.quantidade);
			const novoStatus = novaQtd > 0 ? 'RESTITUIDO_PARCIAL' : 'RESTITUIDO';

			await db
				.prepare(
					`UPDATE bens
					 SET qtd_disponivel = ?, status = ?, atualizado_em = datetime('now')
					 WHERE id = ?`
				)
				.bind(novaQtd, novoStatus, bemId)
				.run();

			await db
				.prepare(
					`INSERT INTO movimentacoes
					 (bem_id, documento_id, tipo_evento, qtd_movimentada, data_evento, parte_nome, parte_cpf)
					 VALUES (?, ?, 'RESTITUICAO', ?, ?, ?, ?)`
				)
				.bind(bemId, docId, entry.item.quantidade, doc.dataAto, doc.parteNome, doc.parteCpf)
				.run();

			totalRestituidos++;
		}
	}

	return json({
		ok: true,
		resumo: { docsSalvos, totalApreendidos, totalRestituidos }
	});
};
