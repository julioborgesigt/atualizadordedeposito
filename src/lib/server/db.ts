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
			tipo TEXT NOT NULL CHECK (tipo IN ('BO', 'IP', 'TCO', 'BOC', 'OUTRO')),
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

	inicializado = true;
}
