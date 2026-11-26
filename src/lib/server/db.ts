let inicializado = false;

export async function ensureSchema(db: D1Database): Promise<void> {
	if (inicializado) return;

	await db.batch([
		db.prepare(`CREATE TABLE IF NOT EXISTS caixas (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			nome TEXT NOT NULL UNIQUE,
			setor TEXT DEFAULT 'Depósito',
			observacoes TEXT,
			criado_em TEXT NOT NULL DEFAULT (datetime('now'))
		)`),
		db.prepare(`CREATE TABLE IF NOT EXISTS procedimentos (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			tipo TEXT NOT NULL,
			numero_normalizado TEXT NOT NULL UNIQUE,
			procedimento_principal_id INTEGER REFERENCES procedimentos(id) ON DELETE SET NULL,
			operacao TEXT,
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
			status TEXT NOT NULL DEFAULT 'EM_DEPOSITO' CHECK (
				status IN (
					'EM_DEPOSITO',
					'DEPOSITO_DP_IGT',
					'EM_EXTRACAO',
					'RESTITUIDO_PARCIAL',
					'RESTITUIDO',
					'PERICIA',
					'JUDICIARIO',
					'DESTRUIDO'
				)
			),
			observacoes TEXT,
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
		db.prepare(`CREATE INDEX IF NOT EXISTS idx_proc_principal ON procedimentos(procedimento_principal_id)`)
	]);

	// Migração transparente caso a tabela bens em produção tenha sido criada com o CHECK constraint antigo
	try {
		const row = await db
			.prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'bens'`)
			.first<{ sql: string }>();

		if (row?.sql && (!row.sql.includes('DEPOSITO_DP_IGT') || !row.sql.includes('EM_EXTRACAO'))) {
			await db.batch([
				db.prepare(`PRAGMA foreign_keys = OFF;`),
				db.prepare(`ALTER TABLE bens RENAME TO bens_old;`),
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
					status TEXT NOT NULL DEFAULT 'EM_DEPOSITO' CHECK (
						status IN (
							'EM_DEPOSITO',
							'DEPOSITO_DP_IGT',
							'EM_EXTRACAO',
							'RESTITUIDO_PARCIAL',
							'RESTITUIDO',
							'PERICIA',
							'JUDICIARIO',
							'DESTRUIDO'
						)
					),
					observacoes TEXT,
					criado_em TEXT NOT NULL DEFAULT (datetime('now')),
					atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
				);`),
				db.prepare(`INSERT INTO bens (
					id, procedimento_id, caixa_id, categoria, descricao_original, descricao_normalizada,
					tipo_identificador, identificador_unico, qtd_total, qtd_disponivel, unidade,
					status, observacoes, criado_em, atualizado_em
				) SELECT
					id, procedimento_id, caixa_id, categoria, descricao_original, descricao_normalizada,
					tipo_identificador, identificador_unico, qtd_total, qtd_disponivel, unidade,
					status, observacoes, criado_em, atualizado_em
				FROM bens_old;`),
				db.prepare(`DROP TABLE bens_old;`),
				db.prepare(`CREATE INDEX IF NOT EXISTS idx_bens_proc ON bens(procedimento_id);`),
				db.prepare(`CREATE INDEX IF NOT EXISTS idx_bens_status ON bens(status);`),
				db.prepare(`CREATE INDEX IF NOT EXISTS idx_bens_id_unico ON bens(identificador_unico);`),
				db.prepare(`CREATE INDEX IF NOT EXISTS idx_bens_desc_norm ON bens(descricao_normalizada);`),
				db.prepare(`PRAGMA foreign_keys = ON;`)
			]);
		}
	} catch (e) {
		console.error('Aviso ao verificar/migrar schema de bens:', e);
	}

	// Correção caso a tabela movimentacoes tenha ficado com foreign key apontando para bens_old
	try {
		const rowMov = await db
			.prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'movimentacoes'`)
			.first<{ sql: string }>();

		if (rowMov?.sql && rowMov.sql.includes('bens_old')) {
			await db.batch([
				db.prepare(`PRAGMA foreign_keys = OFF;`),
				db.prepare(`ALTER TABLE movimentacoes RENAME TO movimentacoes_old;`),
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
				);`),
				db.prepare(`INSERT INTO movimentacoes (
					id, bem_id, documento_id, tipo_evento, qtd_movimentada, data_evento, parte_nome, parte_cpf, observacoes, criado_em
				) SELECT
					id, bem_id, documento_id, tipo_evento, qtd_movimentada, data_evento, parte_nome, parte_cpf, observacoes, criado_em
				FROM movimentacoes_old;`),
				db.prepare(`DROP TABLE movimentacoes_old;`),
				db.prepare(`PRAGMA foreign_keys = ON;`)
			]);
		}
	} catch (e) {
		console.error('Aviso ao verificar/migrar schema de movimentacoes:', e);
	}

	// Migração transparente para permitir qualquer tipo de procedimento (removendo CHECK constraint antigo caso exista)
	try {
		const rowProc = await db
			.prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'procedimentos'`)
			.first<{ sql: string }>();

		if (rowProc?.sql && rowProc.sql.includes('CHECK')) {
			await db.batch([
				db.prepare(`PRAGMA foreign_keys = OFF;`),
				db.prepare(`CREATE TABLE new_procedimentos (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					tipo TEXT NOT NULL,
					numero_normalizado TEXT NOT NULL UNIQUE,
					procedimento_principal_id INTEGER REFERENCES procedimentos(id) ON DELETE SET NULL,
					operacao TEXT,
					criado_em TEXT NOT NULL DEFAULT (datetime('now'))
				);`),
				db.prepare(`INSERT INTO new_procedimentos SELECT * FROM procedimentos;`),
				db.prepare(`DROP TABLE procedimentos;`),
				db.prepare(`ALTER TABLE new_procedimentos RENAME TO procedimentos;`),
				db.prepare(`CREATE INDEX IF NOT EXISTS idx_proc_principal ON procedimentos(procedimento_principal_id);`),
				db.prepare(`PRAGMA foreign_keys = ON;`)
			]);
		}
	} catch (e) {
		console.error('Aviso ao verificar/migrar schema de procedimentos:', e);
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
