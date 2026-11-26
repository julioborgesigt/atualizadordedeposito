import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ensureSchema, limparResquiciosOrfaos } from '$lib/server/db';
import { exigirUnidade } from '$lib/server/auth';

export const DELETE: RequestHandler = async ({ params, platform, locals }) => {
	const db = platform?.env?.DB;
	if (!db) throw error(500, 'Binding DB não configurado.');
	await ensureSchema(db, platform.env.ADMIN_INITIAL_PASSWORD);
	const unidade = exigirUnidade(locals);

	const docId = Number(params.id);
	if (!Number.isInteger(docId)) throw error(400, 'ID de documento inválido.');

	const doc = await db
		.prepare('SELECT id, procedimento_id, tipo, nome_arquivo, unidade_id FROM documentos WHERE id = ?')
		.bind(docId)
		.first<{
			id: number;
			procedimento_id: number;
			tipo: string;
			nome_arquivo: string;
			unidade_id: number | null;
		}>();

	if (!doc) throw error(404, 'Documento não encontrado.');
	if (unidade.role !== 'ADMIN' && doc.unidade_id !== unidade.id) {
		throw error(403, 'Sem permissão para excluir este documento.');
	}

	if (doc.tipo === 'APREENSAO') {
		// Busca os bens criados nesta apreensão
		const { results: movs } = await db
			.prepare('SELECT bem_id FROM movimentacoes WHERE documento_id = ? AND tipo_evento = \'APREENSAO\'')
			.bind(docId)
			.all<{ bem_id: number }>();

		const bemIds = movs.map((m) => m.bem_id);
		if (bemIds.length > 0) {
			const placeholders = bemIds.map(() => '?').join(',');
			await db
				.prepare(`DELETE FROM movimentacoes WHERE bem_id IN (${placeholders})`)
				.bind(...bemIds)
				.run();
			await db
				.prepare(`DELETE FROM bens WHERE id IN (${placeholders})`)
				.bind(...bemIds)
				.run();
		}
	} else if (doc.tipo === 'RESTITUICAO') {
		// Reverte o saldo dos bens restituídos por este termo (ou remove bens criados exclusivamente na restituição)
		const { results: movsRest } = await db
			.prepare(
				'SELECT bem_id, qtd_movimentada FROM movimentacoes WHERE documento_id = ? AND tipo_evento = \'RESTITUICAO\''
			)
			.bind(docId)
			.all<{ bem_id: number; qtd_movimentada: number }>();

		for (const mov of movsRest) {
			const temApreensao = await db
				.prepare(
					'SELECT 1 FROM movimentacoes WHERE bem_id = ? AND tipo_evento = \'APREENSAO\' LIMIT 1'
				)
				.bind(mov.bem_id)
				.first();

			if (!temApreensao) {
				await db.prepare('DELETE FROM movimentacoes WHERE bem_id = ?').bind(mov.bem_id).run();
				await db.prepare('DELETE FROM bens WHERE id = ?').bind(mov.bem_id).run();
			} else {
				await db
					.prepare(
						`UPDATE bens
						 SET qtd_disponivel = MIN(qtd_total, qtd_disponivel + ?),
						     status = CASE
						       WHEN MIN(qtd_total, qtd_disponivel + ?) >= qtd_total THEN 'EM_DEPOSITO'
						       ELSE 'RESTITUIDO_PARCIAL'
						     END,
						     atualizado_em = datetime('now')
						 WHERE id = ?`
					)
					.bind(mov.qtd_movimentada, mov.qtd_movimentada, mov.bem_id)
					.run();
			}
		}

		await db.prepare('DELETE FROM movimentacoes WHERE documento_id = ?').bind(docId).run();
	}

	// Exclui o documento (libera o hash SHA-256) e limpa quaisquer órfãos restantes (inclusive termos de restituição sem bens)
	await db.prepare('DELETE FROM documentos WHERE id = ?').bind(docId).run();
	await limparResquiciosOrfaos(db);

	return json({ ok: true });
};
