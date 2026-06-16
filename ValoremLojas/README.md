# Valorem Lojas — SaaS E-commerce Multi-Tenant

Plataforma de loja virtual multi-tenant integrada à plataforma de pagamento Valorem.

---

## Stack

- **Backend:** NestJS + Prisma + PostgreSQL
- **Frontend:** Next.js 14 (App Router) + Tailwind CSS
- **Cache:** Redis
- **Busca:** Meilisearch
- **Filas:** BullMQ
- **Pagamento:** Plataforma Valorem (física + online)

---

## Início rápido

### 1. Pré-requisitos

- Node.js 20+
- Docker + Docker Compose

### 2. Configurar variáveis de ambiente

```bash
cp .env.example .env
# Edite .env com as credenciais da plataforma Valorem
```

### 3. Subir infraestrutura

```bash
npm run docker:up
# PostgreSQL :5432 | Redis :6379 | Meilisearch :7700
```

### 4. Instalar dependências e rodar migrations

```bash
npm install
npm run db:generate   # gera o Prisma Client
npm run db:migrate    # cria as tabelas
```

### 5. Rodar em desenvolvimento

```bash
npm run dev
# API: http://localhost:3001
# Web: http://localhost:3000
# Docs: http://localhost:3001/docs
```

---

## Estrutura do projeto

```
valorem-lojas/
├── apps/
│   ├── api/          # NestJS — API REST
│   └── web/          # Next.js — Storefront + Admin
├── packages/
│   └── database/     # Prisma schema
├── docker-compose.yml
└── .env.example
```

---

## Multi-tenancy

Cada cliente (lojista) tem uma **Store** identificada por subdomínio:

```
minhaloja.valorem.com.br  →  storeId resolvido pelo TenantMiddleware
```

Em desenvolvimento local, defina `NEXT_PUBLIC_DEV_STORE=minha-loja` no `.env`.

---

## Integração de pagamento

Edite `apps/api/src/modules/payments/providers/valorem.provider.ts` com:
- `PAYMENT_API_URL` — base URL da API Valorem
- `PAYMENT_API_KEY` — chave de autenticação
- `PAYMENT_WEBHOOK_SECRET` — segredo para validar webhooks

Métodos suportados: **PIX, Boleto, Cartão de crédito/débito, Físico (POS)**

---

## Próximos passos

- [x] Bull Board — UI de debug das filas em `/bull-board` (link em Admin → Jobs)
- [ ] Implementar `CategoriesModule` com CRUD completo
- [ ] Implementar `SearchModule` com Meilisearch
- [ ] Implementar `MediaModule` com upload S3/R2
- [ ] Implementar `CustomersModule` com histórico de pedidos
- [ ] Admin: páginas de Produtos e Pedidos
- [ ] Temas de loja (templates)
- [ ] Billing SaaS com planos (Stripe)
- [ ] Domínio próprio por tenant
