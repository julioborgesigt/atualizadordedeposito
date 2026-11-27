import {
	ADMIN_DEFAULT_EMAIL,
	ADMIN_DEFAULT_NAME,
	ADMIN_FALLBACK_PASSWORD,
	hashSenha
} from './auth';

let inicializado = false;

async function garantirColunaUnidade(db: D1Database, tabela: string): Promise<void> {
	const { results } = await db.prepare(`PRAGMA table_info(${tabela})`).all<{ name: string }>();
	const temColuna = (results ?? []).some((col) => col.name === 'unidade_id');
	if (!temColuna) {
		await db.prepare(`ALTER TABLE ${tabela} ADD COLUMN unidade_id INTEGER REFERENCES unidades(id)`).run();
	}
}

export async function ensureSchema(db: D1Database, adminInitialPassword?: string): Promise<void> {
	if (inicializado) return;

	await db.batch([
		db.prepare(`CREATE TABLE IF NOT EXISTS unidades (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			nome TEXT NOT NULL UNIQUE,
			email TEXT NOT NULL UNIQUE,
			senha_hash TEXT NOT NULL,
			role TEXT NOT NULL DEFAULT 'UNIDADE' CHECK (role IN ('ADMIN', 'UNIDADE')),
			deve_trocar_senha INTEGER NOT NULL DEFAULT 1,
			ativo INTEGER NOT NULL DEFAULT 1,
			criado_em TEXT NOT NULL DEFAULT (datetime('now')),
			atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
		)`),
		db.prepare(`CREATE TABLE IF NOT EXISTS sessoes (
			token_hash TEXT PRIMARY KEY,
			unidade_id INTEGER NOT NULL REFERENCES unidades(id) ON DELETE CASCADE,
			expira_em TEXT NOT NULL,
			criado_em TEXT NOT NULL DEFAULT (datetime('now'))
		)`),
		db.prepare(`CREATE TABLE IF NOT EXISTS caixas (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			nome TEXT NOT NULL UNIQUE,
			setor TEXT DEFAULT 'Depósito',
			observacoes TEXT,
			unidade_id INTEGER REFERENCES unidades(id),
			criado_em TEXT NOT NULL DEFAULT (datetime('now'))
		)`),
		db.prepare(`CREATE TABLE IF NOT EXISTS procedimentos (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			tipo TEXT NOT NULL,
			numero_normalizado TEXT NOT NULL UNIQUE,
			procedimento_principal_id INTEGER REFERENCES procedimentos(id) ON DELETE SET NULL,
			operacao TEXT,
			unidade_id INTEGER REFERENCES unidades(id),
			criado_em TEXT NOT NULL DEFAULT (datetime('now'))
		)`),
		db.prepare(`CREATE TABLE IF NOT EXISTS documentos (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			procedimento_id INTEGER NOT NULL REFERENCES procedimentos(id) ON DELETE CASCADE,
			tipo TEXT NOT NULL CHECK (tipo IN ('APREENSAO', 'RESTITUICAO', 'OUTRO')),
			nome_arquivo TEXT NOT NULL,
			hash_sha256 TEXT NOT NULL UNIQUE,
			data_ato TEXT,
			delegado TEXT,
			parte_nome TEXT,
			parte_cpf TEXT,
			unidade_id INTEGER REFERENCES unidades(id),
			importado_em TEXT NOT NULL DEFAULT (datetime('now'))
		)`),
		db.prepare(`CREATE TABLE IF NOT EXISTS bens (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			procedimento_id INTEGER NOT NULL REFERENCES procedimentos(id) ON DELETE CASCADE,
			caixa_id INTEGER REFERENCES caixas(id) ON DELETE SET NULL,
			categoria TEXT NOT NULL DEFAULT 'DIVERSO',
			descricao_original TEXT NOT NULL,
			descricao_normalizada TEXT NOT NULL,
			tipo_identificador TEXT CHECK (tipo_identificador IN ('IMEI', 'PLACA', 'CARTAO', 'CNPJ', 'SERIE')),
			identificador_unico TEXT,
			qtd_total REAL NOT NULL DEFAULT 1,
			qtd_disponivel REAL NOT NULL DEFAULT 1,
			unidade TEXT NOT NULL DEFAULT 'UN',
			status TEXT NOT NULL DEFAULT 'EM_DEPOSITO',
			observacoes TEXT,
			unidade_id INTEGER REFERENCES unidades(id),
			criado_em TEXT NOT NULL DEFAULT (datetime('now')),
			atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
		)`),
		db.prepare(`CREATE TABLE IF NOT EXISTS movimentacoes (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			bem_id INTEGER NOT NULL REFERENCES bens(id) ON DELETE CASCADE,
			documento_id INTEGER REFERENCES documentos(id) ON DELETE SET NULL,
			tipo_evento TEXT NOT NULL CHECK (
				tipo_evento IN ('APREENSAO', 'RESTITUICAO', 'PERICIA', 'JUDICIARIO', 'DESTRUICAO', 'AJUSTE_MANUAL')
			),
			qtd_movimentada REAL NOT NULL DEFAULT 1,
			data_evento TEXT,
			parte_nome TEXT,
			parte_cpf TEXT,
			observacoes TEXT,
			criado_em TEXT NOT NULL DEFAULT (datetime('now'))
		)`),
		db.prepare(`CREATE INDEX IF NOT EXISTS idx_bens_proc ON bens(procedimento_id)`),
		db.prepare(`CREATE INDEX IF NOT EXISTS idx_bens_status ON bens(status)`),
		db.prepare(`CREATE INDEX IF NOT EXISTS idx_bens_id_unico ON bens(identificador_unico)`),
		db.prepare(`CREATE INDEX IF NOT EXISTS idx_bens_desc_norm ON bens(descricao_normalizada)`),
		db.prepare(`CREATE INDEX IF NOT EXISTS idx_proc_principal ON procedimentos(procedimento_principal_id)`),
		db.prepare(`CREATE INDEX IF NOT EXISTS idx_sessoes_unidade ON sessoes(unidade_id)`)
	]);

	// Migração 100% aditiva: garante a coluna unidade_id em tabelas pré-existentes sem nunca recriar/dropar tabelas
	await garantirColunaUnidade(db, 'caixas');
	await garantirColunaUnidade(db, 'procedimentos');
	await garantirColunaUnidade(db, 'documentos');
	await garantirColunaUnidade(db, 'bens');

	// Migração segura no D1 para liberar novos valores de status em bens (ex: DEPOSITO_JUDICIAL):
	// faz backup explícito de movimentacoes antes de recriar bens, evitando ON DELETE CASCADE no D1.
	const rowBensSchema = await db
		.prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'bens'`)
		.first<{ sql: string }>();

	if (
		rowBensSchema?.sql &&
		rowBensSchema.sql.includes('EM_DEPOSITO') &&
		rowBensSchema.sql.includes('DESTRUIDO') &&
		!rowBensSchema.sql.includes('DEPOSITO_JUDICIAL')
	) {
		await db.batch([
			db.prepare(`DROP TABLE IF EXISTS movimentacoes_backup`),
			db.prepare(`CREATE TABLE movimentacoes_backup AS SELECT * FROM movimentacoes`),
			db.prepare(`DELETE FROM movimentacoes`),
			db.prepare(`ALTER TABLE bens RENAME TO bens_old`),
			db.prepare(`CREATE TABLE bens (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				procedimento_id INTEGER NOT NULL REFERENCES procedimentos(id) ON DELETE CASCADE,
				caixa_id INTEGER REFERENCES caixas(id) ON DELETE SET NULL,
				categoria TEXT NOT NULL DEFAULT 'DIVERSO',
				descricao_original TEXT NOT NULL,
				descricao_normalizada TEXT NOT NULL,
				tipo_identificador TEXT CHECK (tipo_identificador IN ('IMEI', 'PLACA', 'CARTAO', 'CNPJ', 'SERIE')),
				identificador_unico TEXT,
				qtd_total REAL NOT NULL DEFAULT 1,
				qtd_disponivel REAL NOT NULL DEFAULT 1,
				unidade TEXT NOT NULL DEFAULT 'UN',
				status TEXT NOT NULL DEFAULT 'EM_DEPOSITO',
				observacoes TEXT,
				unidade_id INTEGER REFERENCES unidades(id),
				criado_em TEXT NOT NULL DEFAULT (datetime('now')),
				atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
			)`),
			db.prepare(`INSERT INTO bens (
				id, procedimento_id, caixa_id, categoria, descricao_original, descricao_normalizada,
				tipo_identificador, identificador_unico, qtd_total, qtd_disponivel, unidade,
				status, observacoes, unidade_id, criado_em, atualizado_em
			) SELECT
				id, procedimento_id, caixa_id, categoria, descricao_original, descricao_normalizada,
				tipo_identificador, identificador_unico, qtd_total, qtd_disponivel, unidade,
				status, observacoes, unidade_id, criado_em, atualizado_em
			FROM bens_old`),
			db.prepare(`DROP TABLE movimentacoes`),
			db.prepare(`DROP TABLE bens_old`),
			db.prepare(`CREATE TABLE movimentacoes (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				bem_id INTEGER NOT NULL REFERENCES bens(id) ON DELETE CASCADE,
				documento_id INTEGER REFERENCES documentos(id) ON DELETE SET NULL,
				tipo_evento TEXT NOT NULL CHECK (
					tipo_evento IN ('APREENSAO', 'RESTITUICAO', 'PERICIA', 'JUDICIARIO', 'DESTRUICAO', 'AJUSTE_MANUAL')
				),
				qtd_movimentada REAL NOT NULL DEFAULT 1,
				data_evento TEXT,
				parte_nome TEXT,
				parte_cpf TEXT,
				observacoes TEXT,
				criado_em TEXT NOT NULL DEFAULT (datetime('now'))
			)`),
			db.prepare(`INSERT INTO movimentacoes (
				id, bem_id, documento_id, tipo_evento, qtd_movimentada, data_evento, parte_nome, parte_cpf, observacoes, criado_em
			) SELECT
				id, bem_id, documento_id, tipo_evento, qtd_movimentada, data_evento, parte_nome, parte_cpf, observacoes, criado_em
			FROM movimentacoes_backup`),
			db.prepare(`DROP TABLE movimentacoes_backup`),
			db.prepare(`CREATE INDEX IF NOT EXISTS idx_bens_proc ON bens(procedimento_id)`),
			db.prepare(`CREATE INDEX IF NOT EXISTS idx_bens_status ON bens(status)`),
			db.prepare(`CREATE INDEX IF NOT EXISTS idx_bens_id_unico ON bens(identificador_unico)`),
			db.prepare(`CREATE INDEX IF NOT EXISTS idx_bens_desc_norm ON bens(descricao_normalizada)`)
		]);
	}

	await db.batch([
		db.prepare(`CREATE INDEX IF NOT EXISTS idx_caixas_unidade ON caixas(unidade_id)`),
		db.prepare(`CREATE INDEX IF NOT EXISTS idx_proc_unidade ON procedimentos(unidade_id)`),
		db.prepare(`CREATE INDEX IF NOT EXISTS idx_docs_unidade ON documentos(unidade_id)`),
		db.prepare(`CREATE INDEX IF NOT EXISTS idx_bens_unidade ON bens(unidade_id)`)
	]);

	// Garante a existência da unidade administradora padrão (4ª Seccional)
	let admin = await db
		.prepare(`SELECT id FROM unidades WHERE LOWER(email) = LOWER(?) OR role = 'ADMIN' LIMIT 1`)
		.bind(ADMIN_DEFAULT_EMAIL)
		.first<{ id: number }>();

	if (!admin) {
		const senhaInicial = adminInitialPassword?.trim() || ADMIN_FALLBACK_PASSWORD;
		const senhaHash = await hashSenha(senhaInicial);
		await db
			.prepare(
				`INSERT OR IGNORE INTO unidades (nome, email, senha_hash, role, deve_trocar_senha, ativo)
				 VALUES (?, ?, ?, 'ADMIN', 1, 1)`
			)
			.bind(ADMIN_DEFAULT_NAME, ADMIN_DEFAULT_EMAIL.toLowerCase(), senhaHash)
			.run();

		admin = await db
			.prepare(`SELECT id FROM unidades WHERE LOWER(email) = LOWER(?) OR role = 'ADMIN' LIMIT 1`)
			.bind(ADMIN_DEFAULT_EMAIL)
			.first<{ id: number }>();
	}

	// Vincula todos os registros pré-existentes sem unidade à 4ª Seccional
	if (admin?.id) {
		await db.batch([
			db.prepare(`UPDATE caixas SET unidade_id = ? WHERE unidade_id IS NULL`).bind(admin.id),
			db.prepare(`UPDATE procedimentos SET unidade_id = ? WHERE unidade_id IS NULL`).bind(admin.id),
			db.prepare(`UPDATE documentos SET unidade_id = ? WHERE unidade_id IS NULL`).bind(admin.id),
			db.prepare(`UPDATE bens SET unidade_id = ? WHERE unidade_id IS NULL`).bind(admin.id)
		]);
	}

	inicializado = true;
}

/**
 * Remove registros órfãos de movimentações, documentos (APREENSAO e RESTITUICAO)
 * e procedimentos que ficaram sem bens após exclusões.
 */
export async function limparResquiciosOrfaos(db: D1Database): Promise<void> {
	try {
		await db.batch([
			// 1. Remove movimentações cujo bem já foi excluído
			db.prepare(`
				DELETE FROM movimentacoes
				WHERE bem_id NOT IN (SELECT id FROM bens)
			`),
			// 2. Remove documentos (APREENSAO ou RESTITUICAO) que não têm mais movimentação ligada a um bem vivo
			//    ou cujo procedimento não possui mais nenhum bem cadastrado
			db.prepare(`
				DELETE FROM documentos
				WHERE id NOT IN (
					SELECT DISTINCT m.documento_id
					FROM movimentacoes m
					JOIN bens b ON b.id = m.bem_id
					WHERE m.documento_id IS NOT NULL
				)
				OR procedimento_id NOT IN (
					SELECT DISTINCT procedimento_id FROM bens
				)
			`),
			// 3. Remove procedimentos órfãos (sem bens e sem documentos)
			db.prepare(`
				DELETE FROM procedimentos
				WHERE id NOT IN (SELECT DISTINCT procedimento_id FROM bens)
				  AND id NOT IN (SELECT DISTINCT procedimento_id FROM documentos)
			`)
		]);
	} catch (e) {
		console.error('Aviso ao limpar resquícios órfãos:', e);
	}
}
