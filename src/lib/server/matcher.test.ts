import { describe, expect, it } from 'vitest';
import { conciliarRestituicao, type CandidatoBem } from './matcher';
import { normalizarTexto } from '$lib/pdf/parser';

describe('conciliarRestituicao', () => {
	it('concilia em lote misto por texto exato, IMEI e aplica restituição parcial', () => {
		const pool: CandidatoBem[] = [
			{
				key: 'tmp:0:0',
				origem: 'LOTE',
				descricaoOriginal: 'CELULAR - Fabricante: APPLE Modelo: IPHONE 13 Imei: 111111111111111 Qtde: 1 UN',
				descricaoNormalizada: normalizarTexto(
					'CELULAR - Fabricante: APPLE Modelo: IPHONE 13 Imei: 111111111111111 Qtde: 1 UN'
				),
				identificadorUnico: '111111111111111',
				qtdDisponivel: 1
			},
			{
				key: 'db:42',
				origem: 'BANCO',
				descricaoOriginal: 'EQUIP/UTENS.(OUTROS) - MAQUINA DE CARTÃO MOD: CIELO Qtde: 2 UN',
				descricaoNormalizada: normalizarTexto(
					'EQUIP/UTENS.(OUTROS) - MAQUINA DE CARTÃO MOD: CIELO Qtde: 2 UN'
				),
				identificadorUnico: null,
				qtdDisponivel: 2
			}
		];

		const matches = conciliarRestituicao(
			[
				{
					categoria: 'CELULAR',
					descricaoOriginal: 'IPHONE 13 PRO IMEI 111111111111111',
					descricaoNormalizada: normalizarTexto('IPHONE 13 PRO IMEI 111111111111111'),
					tipoIdentificador: 'IMEI',
					identificadorUnico: '111111111111111',
					quantidade: 1,
					unidade: 'UN'
				},
				{
					categoria: 'EQUIP/UTENS.(OUTROS)',
					descricaoOriginal: 'EQUIP/UTENS.(OUTROS) - MAQUINA DE CARTÃO MOD: CIELO Qtde: 1 UN',
					descricaoNormalizada: normalizarTexto(
						'EQUIP/UTENS.(OUTROS) - MAQUINA DE CARTÃO MOD: CIELO Qtde: 1 UN'
					),
					tipoIdentificador: null,
					identificadorUnico: null,
					quantidade: 1,
					unidade: 'UN'
				}
			],
			pool
		);

		expect(matches[0]).toMatchObject({
			alvoKey: 'tmp:0:0',
			camada: 'IDENTIFICADOR',
			novoStatusSugerido: 'RESTITUIDO'
		});

		expect(matches[1]).toMatchObject({
			alvoKey: 'db:42',
			camada: 'SIMILARIDADE',
			novoStatusSugerido: 'RESTITUIDO_PARCIAL'
		});
		expect(pool[1].qtdDisponivel).toBe(1);
	});

	it('concilia na Camada 1 (EXATO - 100%) e retorna NAO_ENCONTRADO quando não há candidato compatível', () => {
		const descCartao = 'CARTAO MAGNETICO - Administradora: ELO Nº: 6504897144540207';
		const pool: CandidatoBem[] = [
			{
				key: 'tmp:0:5',
				origem: 'LOTE',
				descricaoOriginal: descCartao,
				descricaoNormalizada: normalizarTexto(descCartao),
				identificadorUnico: '6504897144540207',
				qtdDisponivel: 1
			}
		];

		const matches = conciliarRestituicao(
			[
				{
					categoria: 'CARTAO MAGNETICO',
					descricaoOriginal: descCartao,
					descricaoNormalizada: normalizarTexto(descCartao),
					tipoIdentificador: 'CARTAO',
					identificadorUnico: '6504897144540207',
					quantidade: 1,
					unidade: 'UN'
				},
				{
					categoria: 'DIVERSO (OUTROS)',
					descricaoOriginal: 'DIVERSO (OUTROS) - OBJETO INEXISTENTE NO DEPOSITO Qtde: 1 UN',
					descricaoNormalizada: normalizarTexto(
						'DIVERSO (OUTROS) - OBJETO INEXISTENTE NO DEPOSITO Qtde: 1 UN'
					),
					tipoIdentificador: null,
					identificadorUnico: null,
					quantidade: 1,
					unidade: 'UN'
				}
			],
			pool
		);

		expect(matches[0]).toMatchObject({
			alvoKey: 'tmp:0:5',
			camada: 'EXATO',
			confianca: 100,
			novoStatusSugerido: 'RESTITUIDO'
		});

		expect(matches[1]).toMatchObject({
			alvoKey: '__CRIAR_RESTITUIDO__',
			camada: 'NAO_ENCONTRADO',
			confianca: 0,
			novoStatusSugerido: 'RESTITUIDO'
		});
	});
});
