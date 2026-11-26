import { describe, expect, it } from 'vitest';
import { parseRelatorioPdf } from './parser';

const SAMPLE_APREENSAO = `GOVERNO DO ESTADO DO CEARÁ
POLICIA CIVIL
AUTO DE APRESENTAÇÃO E APREENSÃO
BO Nº 479 - 0001 / 2025
Aos 21 dia(s) do mês de August de 2025, nesta cidade de Iguatu, Estado do Ceará, onde pela
(s) 07:22 hora(s) presente achava-se FULANO DE TAL, Delegado(a),
comigo BELTRANO, Escrivã(o), ao final assinado, aí compareceu:
JOAO DA SILVA, nacionalidade Brasil, CPF: 111.222.333-44 e apresentou:
CELULAR - Fabricante: APPLE Modelo: IPHONE 13 PRO MAX Imei:
111111111111111 Qtde: 1 UN
CAMINHONETE - PLACA: ABC1D23 UF: CE MARCA/MOD: FIAT/STRADA
COR: BRANCA Qtde: 1 UN
MOEDA NACIONAL - Qtde: 1028 reais
EQUIP/UTENS.(OUTROS) - MAQUINA DE CARTÃO MOD: CIELO Qtde: 2 UN
CARTAO MAGNETICO - Administradora: ELO Nº: 6504000000000001
N. FISCAL (UNIDADE) - CNPJ: 11222333000181 Qtde: 9 UN
tendo a mesma autoridade declarado apreendido, por se achar vinculado a um fato delituoso.`;

const SAMPLE_RESTITUICAO = `GOVERNO DO ESTADO DO CEARÁ
POLICIA CIVIL
TERMO DE RESTITUIÇÃO
BO Nº 479 - 0001 / 2025
Aos 30 dia(s) do mês de December de 2025, nesta cidade de Iguatu, Estado do Ceará, onde
presente achava-se FULANO DE TAL, Delegado(a), respectivo, comigo, ESCRIVAO, aí compareceu em Cartório
MARIA DE SOUZA, nacionalidade Brasil, CPF: 555.666.777-88, pela autoridade foi feita a este a restituição do(s) seguinte(s) objeto(s):
CELULAR - Fabricante: APPLE Modelo: IPHONE 13 PRO MAX Imei:
111111111111111 Qtde: 1 UN
EQUIP/UTENS.(OUTROS) - MAQUINA DE CARTÃO MOD: CIELO Qtde: 1 UN
E nada mais havendo, mandou o(a) Delegado(a) encerrar o presente termo.`;

describe('parseRelatorioPdf', () => {
	it('extrai cabeçalho, mês em inglês e itens multilinha do Auto de Apreensão', () => {
		const res = parseRelatorioPdf(SAMPLE_APREENSAO, 'auto.pdf', 'hash-1');

		expect(res.tipoDocumento).toBe('APREENSAO');
		expect(res.tipoProcedimento).toBe('BO');
		expect(res.numeroProcedimento).toBe('479-0001/2025');
		expect(res.dataAto).toBe('2025-08-21');
		expect(res.delegado).toBe('FULANO DE TAL');
		expect(res.parteNome).toBe('JOAO DA SILVA');
		expect(res.parteCpf).toBe('111.222.333-44');
		expect(res.itens).toHaveLength(6);

		expect(res.itens[0]).toMatchObject({
			categoria: 'CELULAR',
			tipoIdentificador: 'IMEI',
			identificadorUnico: '111111111111111',
			quantidade: 1,
			unidade: 'UN'
		});
		expect(res.itens[1]).toMatchObject({
			categoria: 'CAMINHONETE',
			tipoIdentificador: 'PLACA',
			identificadorUnico: 'ABC1D23'
		});
		expect(res.itens[2]).toMatchObject({
			categoria: 'MOEDA NACIONAL',
			quantidade: 1028,
			unidade: 'REAIS'
		});
		expect(res.itens[4]).toMatchObject({
			categoria: 'CARTAO MAGNETICO',
			tipoIdentificador: 'CARTAO',
			identificadorUnico: '6504000000000001',
			quantidade: 1
		});
		expect(res.itens[5]).toMatchObject({
			tipoIdentificador: 'CNPJ',
			identificadorUnico: '11222333000181',
			quantidade: 9
		});
	});

	it('extrai Termo de Restituição corretamente', () => {
		const res = parseRelatorioPdf(SAMPLE_RESTITUICAO, 'rest.pdf', 'hash-2');

		expect(res.tipoDocumento).toBe('RESTITUICAO');
		expect(res.numeroProcedimento).toBe('479-0001/2025');
		expect(res.dataAto).toBe('2025-12-30');
		expect(res.parteNome).toBe('MARIA DE SOUZA');
		expect(res.itens).toHaveLength(2);
	});

	it('remove cabeçalhos/rodapés de quebra de página e normaliza I.P. e meses em português', () => {
		const textoComQuebra = `AUTO DE APRESENTAÇÃO E APREENSÃO
I.P. Nº 479 - 5426 / 2025
Aos 5 dia(s) do mês de março de 2025, presente achava-se DR. EXEMPLO, Delegado(a), aí compareceu :
CICRANO DE TAL, nacionalidade Brasil, CPF: 999.888.777-66 e apresentou:
ELETRO-ELETRONICO - UNIDADE CENTRAL DE PROCESSAMENTO (CPU) FAB:
MARCA X Qtde: 1 UN
Impresso em: 21/08/2025 07:30 Página 1 de 2
GOVERNO DO ESTADO DO CEARÁ - POLICIA CIVIL
DIVERSO (OUTROS) - CADERNOS PEQUENOS Qtde: 3 UN
tendo a mesma autoridade declarado apreendido.`;

		const res = parseRelatorioPdf(textoComQuebra, 'ip.pdf', 'hash-3');

		expect(res.tipoProcedimento).toBe('IP');
		expect(res.numeroProcedimento).toBe('479-5426/2025');
		expect(res.dataAto).toBe('2025-03-05');
		expect(res.itens).toHaveLength(2);
		expect(res.itens[0].descricaoOriginal).toBe(
			'ELETRO-ELETRONICO - UNIDADE CENTRAL DE PROCESSAMENTO (CPU) FAB: MARCA X Qtde: 1 UN'
		);
		expect(res.itens[1]).toMatchObject({
			categoria: 'DIVERSO (OUTROS)',
			quantidade: 3,
			unidade: 'UN'
		});
	});

	it('extrai corretamente Auto de Apreensão e Restituição com INQUÉRITO (ex: imagens 2 e 3)', () => {
		const textoInquerito = `GOVERNO DO ESTADO DO CEARÁ
SECRETARIA DA SEGURANÇA PÚBLICA E DEFESA SOCIAL
POLICIA CIVIL
DELEGACIA REGIONAL DE IGUATU

AUTO DE APRESENTAÇÃO E APREENSÃO

INQUÉRITO Nº 479 - 54 / 2025

Aos 19 dia(s) do mês de February de 2026, nesta cidade de Iguatu, Estado do Ceará, onde
pela(s) 14:08 hora(s) presente achava-se MARCOS SANDRO NAZARÉ DE LIRA, Delegado(a),
comigo JULIO APARECIDO BORGES JUNIOR, Escrivã(o), ao final assinado, aí compareceu :
JULIO APARECIDO BORGES JUNIOR, nacionalidade Brasil, homem cis, heterossexual, casado(a),
superior completo, escrivão de polícia civil, filho(a) de JULIO APARECIDO BORGES e
ANTONIA CLAUZENEIDE BATISTA BORGES, nascido(a) em 25/08/1990, natural de Iguatu/CE,
CPF: 030.107.183-73, RG: 2005029070718 SSPDS/CE, residente na Avenida Juscelino Kubitschek,
1225 Deelgacia de Policia, Esplanada, Iguatu/CE, Brasil, telefone (88) 3581-0307 e apresentou:
AUTOMOVEL - PLACA: PNZ1C10 UF: CE MARCA/MOD: TOYOTA/COROLLA XEI20FLEX COR: BRANCA Qtde: 1 UN
tendo a mesma autoridade declarado apreendido, por se achar vinculado a um fato delituoso
objeto de apuração através de procedimento policial.`;

		const res = parseRelatorioPdf(textoInquerito, 'inquerito.pdf', 'hash-inq');
		expect(res.tipoProcedimento).toBe('INQUÉRITO');
		expect(res.numeroProcedimento).toBe('479-54/2025');
		expect(res.tipoDocumento).toBe('APREENSAO');
		expect(res.dataAto).toBe('2026-02-19');
		expect(res.itens).toHaveLength(1);
		expect(res.itens[0]).toMatchObject({
			categoria: 'AUTOMOVEL',
			tipoIdentificador: 'PLACA',
			identificadorUnico: 'PNZ1C10',
			quantidade: 1
		});
	});

	it('aceita outros tipos de procedimentos como ATO INFRACIONAL, BOC, TCO e PORTARIA', () => {
		const template = (tipoLinha: string) => `GOVERNO DO ESTADO DO CEARÁ
POLICIA CIVIL
AUTO DE APRESENTAÇÃO E APREENSÃO

${tipoLinha}

Aos 10 dia(s) do mês de janeiro de 2025, presente achava-se DEL, Delegado(a), aí compareceu:
PARTE, nacionalidade Brasil, CPF: 111.111.111-11 e apresentou:
DIVERSO - OBJETO TESTE Qtde: 1 UN
tendo a mesma autoridade declarado apreendido.`;

		const r1 = parseRelatorioPdf(template('ATO INFRACIONAL Nº 479 - 10 / 2025'), 'ai.pdf', 'h-ai');
		expect(r1.tipoProcedimento).toBe('ATO INFRACIONAL');
		expect(r1.numeroProcedimento).toBe('479-10/2025');

		const r2 = parseRelatorioPdf(template('BOC Nº 479 - 20 / 2025'), 'boc.pdf', 'h-boc');
		expect(r2.tipoProcedimento).toBe('BOC');
		expect(r2.numeroProcedimento).toBe('479-20/2025');

		const r3 = parseRelatorioPdf(template('TCO Nº 479 - 30 / 2025'), 'tco.pdf', 'h-tco');
		expect(r3.tipoProcedimento).toBe('TCO');
		expect(r3.numeroProcedimento).toBe('479-30/2025');

		const r4 = parseRelatorioPdf(template('PORTARIA Nº 479 - 40 / 2025'), 'port.pdf', 'h-port');
		expect(r4.tipoProcedimento).toBe('PORTARIA');
		expect(r4.numeroProcedimento).toBe('479-40/2025');
	});
});
