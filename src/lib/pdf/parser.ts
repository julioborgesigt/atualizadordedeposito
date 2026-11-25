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

	const mProc = textoBruto.match(
		/\b(BO|IP|I\.P\.|TCO|BOC)\s*(?:N[º°o\.]*)?\s*(\d+)\s*-\s*(\d+)\s*\/\s*(\d{4})/i
	);
	if (!mProc) {
		throw new Error(`Número do procedimento não encontrado em "${nomeArquivo}".`);
	}

	const tipoProcedimento = mProc[1].replace(/\./g, '').toUpperCase() as TipoProcedimento;
	const numeroProcedimento = `${mProc[2]}-${mProc[3]}/${mProc[4]}`;

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
