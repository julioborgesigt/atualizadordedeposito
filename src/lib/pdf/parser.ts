import type {
	DocumentoParseado,
	ItemExtraido,
	TipoDocumento,
	TipoIdentificador,
	TipoProcedimento
} from '$lib/types';

const MESES: Record<string, string> = {
	january: '01',
	janeiro: '01',
	february: '02',
	fevereiro: '02',
	march: '03',
	marco: '03',
	'março': '03',
	april: '04',
	abril: '04',
	may: '05',
	maio: '05',
	june: '06',
	junho: '06',
	july: '07',
	julho: '07',
	august: '08',
	agosto: '08',
	september: '09',
	setembro: '09',
	october: '10',
	outubro: '10',
	november: '11',
	novembro: '11',
	december: '12',
	dezembro: '12'
};

export function normalizarTexto(texto: string): string {
	return texto
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/\s+/g, ' ')
		.trim()
		.toUpperCase();
}

export function extrairIdentificador(
	descricao: string
): { tipo: TipoIdentificador | null; valor: string | null } {
	const mImei = descricao.match(/IMEI\s*:?\s*(\d{14,16})/i);
	if (mImei) return { tipo: 'IMEI', valor: mImei[1] };

	const mPlaca = descricao.match(/PLACA\s*:?\s*([A-Z]{3}-?[0-9][A-Z0-9][0-9]{2})/i);
	if (mPlaca) return { tipo: 'PLACA', valor: mPlaca[1].replace('-', '').toUpperCase() };

	const mCartao = descricao.match(/CART[ÃA]O\s+MAGN[ÉE]TICO.*?N[º°o\.]*\s*:?\s*(\d{12,19})/i);
	if (mCartao) return { tipo: 'CARTAO', valor: mCartao[1] };

	const mCnpj = descricao.match(/CNPJ\s*:?\s*([\d\.\/\-]{14,18})/i);
	if (mCnpj) return { tipo: 'CNPJ', valor: mCnpj[1].replace(/\D/g, '') };

	return { tipo: null, valor: null };
}

export function normalizarTipoProcedimento(tipoBruto: string): string {
	const limpo = tipoBruto
		.replace(/\./g, '')
		.replace(/\s+/g, ' ')
		.trim()
		.toUpperCase();

	// Normaliza variações longas e sinônimos mantendo padrão claro
	if (/^(BOLETIM(\s+DE)?\s+OCORR[EÊ]NCIA|BO)$/i.test(limpo)) return 'BO';
	if (/^(INQU[EÉ]RITO(\s+POLICIAL)?)$/i.test(limpo)) return 'INQUÉRITO';
	if (/^IP$/i.test(limpo)) return 'IP';
	if (/^(TERMO\s+CIRCUNSTANCIADO(\s+DE\s+OCORR[EÊ]NCIA)?|TCO)$/i.test(limpo)) return 'TCO';
	if (/^(BOLETIM(\s+DE\s+OCORR[EÊ]NCIA)?\s+CIRCUNSTANCIAD[AO]|BOC)$/i.test(limpo)) return 'BOC';
	if (/^(AUTO\s+DE\s+PRIS[AÃ]O\s+EM\s+FLAGRANTE|APF)$/i.test(limpo)) return 'APF';
	if (
		/^(AUTO\s+DE\s+APREENS[AÃ]O\s+EM\s+FLAGRANTE\s+DE\s+ATO\s+INFRACIONAL|ATO\s+INFRACIONAL|AI|AIAI|AAFAI)$/i.test(
			limpo
		)
	) {
		return 'ATO INFRACIONAL';
	}

	return limpo;
}

export function extrairProcedimento(
	textoBruto: string
): { tipo: string; numero: string } | null {
	const linhas = textoBruto
		.split('\n')
		.map((l) => l.trim())
		.filter(Boolean);

	for (let i = 0; i < linhas.length; i++) {
		const linha = linhas[i];
		const mNum = linha.match(/(\d+)[ \t]*[-–—][ \t]*(\d+)[ \t]*\/[ \t]*(\d{4})\b/);
		if (mNum && mNum.index !== undefined) {
			const pref = mNum[1];
			const num = mNum[2];
			const ano = mNum[3];
			const numero = `${pref}-${num}/${ano}`;

			const antes = linha.slice(0, mNum.index).trim();
			let tipoCand = antes
				.replace(/[:\s]*(?:N[º°o\.]*|N[UÚ]MERO|NO\b)[\s:]*$/i, '')
				.trim();

			if (!tipoCand && i > 0) {
				const linhaAnt = linhas[i - 1];
				if (
					!/AUTO\s+DE\s+APRESENTA|TERMO\s+DE\s+RESTITUI|POLICIA\s+CIVIL|GOVERNO/i.test(linhaAnt)
				) {
					tipoCand = linhaAnt.replace(/[:\s]*(?:N[º°o\.]*|N[UÚ]MERO|NO\b)[\s:]*$/i, '').trim();
				}
			}

			if (!tipoCand) {
				tipoCand = 'PROCEDIMENTO';
			}

			const tipo = normalizarTipoProcedimento(tipoCand);
			return { tipo, numero };
		}
	}

	const mFallback = textoBruto.match(
		/(?:^|\n)\s*([A-Za-zÀ-ÖØ-öø-ÿ0-9\.\ \/-]{2,50}?)\s*(?:N[º°o\.]*|N[UÚ]MERO|NO\b)?\s*:?\s*(\d+)\s*[-–—]\s*(\d+)\s*\/\s*(\d{4})\b/i
	);
	if (mFallback) {
		const tipo = normalizarTipoProcedimento(mFallback[1].trim());
		const numero = `${mFallback[2]}-${mFallback[3]}/${mFallback[4]}`;
		return { tipo, numero };
	}

	return null;
}

export function parseRelatorioPdf(
	textoBruto: string,
	nomeArquivo: string,
	hashSha256: string
): DocumentoParseado {
	let tipoDocumento: TipoDocumento;
	if (/AUTO\s+DE\s+APRESENTA[ÇC][ÃA]O\s+E\s+APREENS[ÃA]O/i.test(textoBruto)) {
		tipoDocumento = 'APREENSAO';
	} else if (/TERMO\s+DE\s+RESTITUI[ÇC][ÃA]O/i.test(textoBruto)) {
		tipoDocumento = 'RESTITUICAO';
	} else {
		throw new Error(`Tipo de documento não reconhecido em "${nomeArquivo}".`);
	}

	const proc = extrairProcedimento(textoBruto);
	if (!proc) {
		throw new Error(`Número do procedimento não encontrado em "${nomeArquivo}".`);
	}

	const tipoProcedimento = proc.tipo;
	const numeroProcedimento = proc.numero;

	const mData = textoBruto.match(
		/Aos\s+(\d{1,2})\s+dia\(s\)\s+do\s+m[êe]s\s+de\s+([A-Za-zÀ-ÿ]+)\s+de\s+(\d{4})/i
	);
	const dataAto = mData
		? `${mData[3]}-${MESES[mData[2].toLowerCase()] ?? '01'}-${mData[1].padStart(2, '0')}`
		: null;

	const mDelegado = textoBruto.match(/achava-se\s+([\s\S]+?),\s*Delegado\(a\)/i);
	const delegado = mDelegado ? mDelegado[1].replace(/\s+/g, ' ').trim() : null;

	const mParte = textoBruto.match(
		/compareceu(?:\s+em\s+Cart[óo]rio)?\s*:?\s*\n?\s*([A-ZÀ-Ÿ\s]+?),\s*nacionalidade/i
	);
	const parteNome = mParte ? mParte[1].replace(/\s+/g, ' ').trim() : null;

	const mCpf = textoBruto.match(/CPF\s*:\s*([\d\.\-]+)/i);
	const parteCpf = mCpf ? mCpf[1] : null;

	const regexBloco =
		tipoDocumento === 'APREENSAO'
			? /e\s+apresentou\s*:\s*([\s\S]+?)tendo\s+a\s+mesma\s+autoridade\s+declarado\s+apreendido/i
			: /restitui[çc][ãa]o\s+do\(s\)\s+seguinte\(s\)\s+objeto\(s\)\s*:\s*([\s\S]+?)E\s+nada\s+mais\s+havendo/i;

	const mBloco = textoBruto.match(regexBloco);
	if (!mBloco) {
		throw new Error(`Lista de objetos não localizada em "${nomeArquivo}".`);
	}

	const blocoLimpo = mBloco[1].replace(/Impresso em:[\s\S]*?POLICIA CIVIL\s*/gi, '\n');

	const linhas = blocoLimpo
		.split('\n')
		.map((l) => l.trim())
		.filter(Boolean);

	const inicioItemRegex = /^[A-ZÀ-Ÿ0-9\.\/\(\)\- ]{2,40}\s+-\s+/;
	const agrupados: string[] = [];

	for (const linha of linhas) {
		if (inicioItemRegex.test(linha)) {
			agrupados.push(linha);
		} else if (agrupados.length > 0) {
			agrupados[agrupados.length - 1] += ' ' + linha;
		} else {
			agrupados.push(linha);
		}
	}

	const itens: ItemExtraido[] = agrupados.map((bruto) => {
		const descricaoOriginal = bruto.replace(/\s+/g, ' ').trim();
		const idxSep = descricaoOriginal.indexOf(' - ');
		const categoria = idxSep > -1 ? descricaoOriginal.slice(0, idxSep).trim() : 'DIVERSO';

		const mQtd = descricaoOriginal.match(/Qtde:\s*([\d\.,]+)\s*([A-Za-zÀ-ÿ]+)?/i);
		const quantidade = mQtd ? Number(mQtd[1].replace(',', '.')) || 1 : 1;
		const unidade = mQtd?.[2] ? mQtd[2].toUpperCase() : 'UN';

		const { tipo, valor } = extrairIdentificador(descricaoOriginal);

		return {
			categoria,
			descricaoOriginal,
			descricaoNormalizada: normalizarTexto(descricaoOriginal),
			tipoIdentificador: tipo,
			identificadorUnico: valor,
			quantidade,
			unidade
		};
	});

	return {
		nomeArquivo,
		hashSha256,
		tipoDocumento,
		tipoProcedimento,
		numeroProcedimento,
		dataAto,
		delegado,
		parteNome,
		parteCpf,
		itens
	};
}
