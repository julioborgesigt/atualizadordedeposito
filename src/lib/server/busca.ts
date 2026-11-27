function normalizarTextoBusca(str: string): string {
	return str
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.trim();
}

export function construirFiltroBusca(q: string): { sql: string; binds: unknown[] } | null {
	const qLimpo = q.trim();
	if (!qLimpo) return null;

	const tokens = qLimpo.split(/\s+/).filter(Boolean);
	if (tokens.length === 0) return null;

	const condicoesTokens: string[] = [];
	const binds: unknown[] = [];

	for (const token of tokens) {
		const tokenNorm = normalizarTextoBusca(token);
		const termo = `%${token}%`;
		const termoNorm = `%${tokenNorm}%`;

		const ehIpOuInquerito = /^(ip|inquerito)$/i.test(tokenNorm);
		const ehBo = /^(bo|boletim)$/i.test(tokenNorm);
		const ehTco = /^(tco)$/i.test(tokenNorm);
		const ehBocOuAi = /^(boc|ai)$/i.test(tokenNorm);

		let condTipoExtra = '';
		if (ehIpOuInquerito) {
			condTipoExtra = ` OR p.tipo IN ('IP', 'INQUÉRITO', 'INQUERITO')`;
		} else if (ehBo) {
			condTipoExtra = ` OR p.tipo IN ('BO')`;
		} else if (ehTco) {
			condTipoExtra = ` OR p.tipo IN ('TCO')`;
		} else if (ehBocOuAi) {
			condTipoExtra = ` OR p.tipo IN ('BOC', 'ATO INFRACIONAL')`;
		}

		condicoesTokens.push(
			`(` +
				`p.numero_normalizado LIKE ?` +
				` OR p.tipo LIKE ?` +
				` OR b.descricao_original LIKE ?` +
				` OR b.descricao_normalizada LIKE ?` +
				` OR b.categoria LIKE ?` +
				` OR b.identificador_unico LIKE ?` +
				` OR b.observacoes LIKE ?` +
				` OR p.operacao LIKE ?` +
				` OR c.nome LIKE ?` +
				` OR EXISTS (` +
				`   SELECT 1 FROM documentos d` +
				`   WHERE d.procedimento_id = p.id` +
				`     AND (d.nome_arquivo LIKE ? OR d.parte_nome LIKE ? OR d.parte_cpf LIKE ? OR d.delegado LIKE ?)` +
				` )` +
				`${condTipoExtra}` +
				`)`
		);

		binds.push(
			termo, // p.numero_normalizado
			termo, // p.tipo
			termo, // b.descricao_original
			termoNorm, // b.descricao_normalizada (sem acento, minúsculo)
			termoNorm, // b.categoria
			termo, // b.identificador_unico
			termo, // b.observacoes
			termo, // p.operacao
			termo, // c.nome
			termo, // d.nome_arquivo
			termo, // d.parte_nome
			termo, // d.parte_cpf
			termo // d.delegado
		);
	}

	return {
		sql: `(${condicoesTokens.join(' AND ')})`,
		binds
	};
}
