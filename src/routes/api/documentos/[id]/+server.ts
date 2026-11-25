import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ensureSchema } from '$lib/server/db';

export const DELETE: RequestHandler = async ({ params, platform }) => {
	const db = platform?.env?.DB;
	if (!db) throw error(500, 'Binding DB não configurado.');
	await ensureSchema(db);

	const docId = Number(params.id);
	if (!Number.isInteger(docId)) throw error(400, 'ID de documento inválido.');

	const doc = await db
		.prepare('SELECT id, procedimento_id, tipo, nome_arquivo FROM documentos WHERE id = ?')
		.bind(docId)
		.first<{ id: number; procedimento_id: number; tipo: string; nome_arquivo: string }>();

	if (!doc) throw error(404, 'Documento de apreensão não encontrado.');

	// Exclui os bens vinculados a esta apreensão
	await db
		.prepare(
			`DELETE FROM bens
			 WHERE id IN (
			   SELECT bem_id FROM movimentacoes WHERE documento_id = ? AND tipo_evento = 'APREENSAO'
			 )`
		)
		.bind(docId)
		.run();

	// Exclui o documento (libera o hash SHA-256 caso precise reimportar o PDF)
	await db.prepare('DELETE FROM documentos WHERE id = ?').bind(docId).run();

	// Limpa procedimentos que ficaram órfãos (sem bens e sem documentos)
	await db
		.prepare(
			`DELETE FROM procedimentos
			 WHERE id = ?
			   AND NOT EXISTS (SELECT 1 FROM bens WHERE procedimento_id = ?)
			   AND NOT EXISTS (SELECT 1 FROM documentos WHERE procedimento_id = ?)`
		)
		.bind(doc.procedimento_id, doc.procedimento_id, doc.procedimento_id)
		.run();

	return json({ ok: true });
};
