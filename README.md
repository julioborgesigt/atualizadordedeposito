# Custódia PCCE

Sistema web em **SvelteKit (Svelte 5) + Cloudflare Pages + Cloudflare D1** para controle de bens apreendidos em depósito e restituições a partir do upload de PDFs de *Auto de Apresentação e Apreensão* e *Termo de Restituição*.

## Recursos incluídos
- Leitura de PDF 100% local no navegador via `pdfjs-dist` (sem envio de documentos a APIs externas).
- Deduplicação de documentos via hash SHA-256 salvo no D1.
- Upload em lote misto: aceita Apreensão e Restituição do mesmo BO juntos, ordenando e conciliando automaticamente na tela de pré-visualização.
- Conciliação em 3 camadas: texto normalizado exato, identificador único (IMEI, Placa, Cartão, CNPJ) e similaridade textual.
- Controle de restituição parcial por quantidade, caixas físicas e filtros de busca global.

## Como rodar localmente

```bash
# 1. Instalar dependências
npm install

# 2. Criar o banco D1 na sua conta Cloudflare (e copiar o database_id para o wrangler.toml)
npx wrangler d1 create custodia-pcce-db

# 3. Aplicar a migração no banco local emulado
npm run db:migrate:local

# 4. Rodar testes unitários (parser + matcher)
npm test

# 5. Iniciar servidor de desenvolvimento
npm run dev
```

## Deploy no Cloudflare Pages

```bash
# Aplicar migração em produção (D1 remoto)
npm run db:migrate:remote

# Build e deploy via Wrangler
npm run deploy
```

> Se conectar este repositório diretamente no painel do Cloudflare Pages, configure o build command como `npm run build`, output directory como `.svelte-kit/cloudflare` e adicione o binding D1 `DB` apontando para `custodia-pcce-db`.
