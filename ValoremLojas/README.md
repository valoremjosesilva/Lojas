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

## Status do projeto

### Implementado

- [x] `ProductsModule` — CRUD de produtos com imagens e cache (Redis)
- [x] `CategoriesModule` — CRUD completo + página admin
- [x] `SearchModule` — Meilisearch (busca no storefront + indexação via fila)
- [x] `MediaModule` — upload via URL assinada (S3 / Cloudflare R2)
- [x] `InventoryModule` — variantes de produto (atributos, combinações, estoque)
- [x] `OrdersModule` + `CheckoutModule` — pedidos e checkout
- [x] `PaymentsModule` — integração com a plataforma Valorem (PIX, Boleto, Cartão, POS)
- [x] `CouponsModule` — cupons de desconto + página admin
- [x] `PlansModule` — limites de uso por plano (produtos / lojas)
- [x] `BillingModule` — trial, solicitação de upgrade e endpoints admin
- [x] `CustomersModule` — CRUD de clientes + histórico de pedidos
- [x] `NotificationsModule` + `JobsModule` — e-mails transacionais via BullMQ
- [x] Admin — Dashboard, Produtos, Pedidos, Clientes, Categorias, Cupons, Jobs e Configurações
- [x] Bull Board — UI de debug das filas em `/bull-board` (link em Admin → Jobs)

### Pendente

- [ ] Temas de loja (templates) — atualmente apenas logo + cores básicas
- [ ] Billing com gateway recorrente (ex.: Stripe) — upgrade ainda é manual/assistido
- [ ] Domínio próprio por tenant — campo `domain` já existe no schema, mas o `TenantMiddleware` resolve apenas por subdomínio
