/// <reference types="@cloudflare/workers-types" />

export type RoleUnidade = 'ADMIN' | 'UNIDADE';

export interface UnidadeAutenticada {
	id: number;
	nome: string;
	email: string;
	role: RoleUnidade;
	deve_trocar_senha: boolean;
}

declare global {
	namespace App {
		interface Locals {
			unidade: UnidadeAutenticada | null;
		}
		interface Platform {
			env: {
				DB: D1Database;
				ADMIN_INITIAL_PASSWORD?: string;
			};
			context: ExecutionContext;
			caches: CacheStorage;
		}
	}
}

export {};
