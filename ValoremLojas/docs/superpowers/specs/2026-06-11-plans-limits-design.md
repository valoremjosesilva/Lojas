# Plano de Assinatura — Limites de Uso

**Data:** 2026-06-11
**Status:** Aprovado

## Contexto

O modelo `Tenant` já possui o campo `plan Plan @default(BASIC)` com três tiers (`BASIC`, `PRO`, `ENTERPRISE`), mas nenhum limite é aplicado em nenhum serviço. Este documento especifica a implementação do módulo `Plans` que aplica limites de uso por plano.

Escopo desta implementação: **limites de quantidade** (lojas por tenant, produtos por loja). Preços dos planos e cobrança recorrente (billing) ficam para um módulo futuro.

---

## Limites por Plano

| Dimensão            | BASIC | PRO | ENTERPRISE |
|---------------------|-------|-----|------------|
| Lojas por tenant    | 1     | 3   | ∞          |
| Produtos por loja   | 30    | 300 | ∞          |

Limites são constantes no código. Revisáveis quando o módulo de billing for construído.

---

## Comportamento nos Limites

| Situação              | Comportamento                                                       |
|-----------------------|---------------------------------------------------------------------|
| `usage / limit < 0.8` | Normal — sem aviso                                                  |
| `usage / limit >= 0.8`| `warning: true` na resposta de usage — frontend exibe aviso visual |
| `usage >= limit`      | `ForbiddenException` com mensagem descritiva de upgrade             |

**Mensagens de erro (403):**
- `"Limite de produtos atingido (30/30). Faça upgrade para o plano PRO."`
- `"Limite de lojas atingido (1/1). Faça upgrade para o plano PRO."`
- Para ENTERPRISE já no limite (não ocorre; `Infinity` nunca bloqueia)
- Quando já está no PRO: citar ENTERPRISE no lugar de PRO

---

## Backend — PlansModule

**Localização:** `apps/api/src/modules/plans/`

Arquivos:
- `plans.module.ts`
- `plans.service.ts`
- `plans.controller.ts`

### Constantes

```typescript
export const PLAN_LIMITS: Record<Plan, { stores: number; productsPerStore: number }> = {
  BASIC:      { stores: 1,        productsPerStore: 30  },
  PRO:        { stores: 3,        productsPerStore: 300 },
  ENTERPRISE: { stores: Infinity, productsPerStore: Infinity },
}
```

### PlansService

```typescript
interface UsageResult {
  plan: Plan
  limits: { stores: number; productsPerStore: number }
  usage: { stores: number; products: number }
  warnings: { stores: boolean; products: boolean }
}
```

Métodos:

**`getUsage(storeId: string): Promise<UsageResult>`**
1. Busca a store + tenant: `prisma.store.findUnique({ where: { id: storeId }, include: { tenant: true } })`
2. Conta produtos: `prisma.product.count({ where: { storeId } })`
3. Conta lojas do tenant: `prisma.store.count({ where: { tenantId } })`
4. Retorna UsageResult com `warning = usage/limit >= 0.8` (false quando limit é Infinity)

**`checkProductLimit(storeId: string): Promise<void>`**
1. Chama `getUsage(storeId)`
2. Se `usage.products >= limits.productsPerStore`: lança `ForbiddenException` com mensagem de upgrade
3. Caso contrário: retorna sem erro

**`checkStoreLimit(tenantId: string): Promise<void>`**
1. Busca tenant: `prisma.tenant.findUnique({ where: { id: tenantId } })`
2. Conta lojas: `prisma.store.count({ where: { tenantId } })`
3. Se `count >= limits.stores`: lança `ForbiddenException` com mensagem de upgrade
4. Caso contrário: retorna sem erro

**Mensagem de upgrade** — helper privado:
```typescript
private upgradeMessage(current: Plan): string {
  if (current === 'BASIC') return 'Faça upgrade para o plano PRO.'
  if (current === 'PRO')   return 'Faça upgrade para o plano ENTERPRISE.'
  return ''
}
```

### PlansController

```
GET /plan/usage   — JwtAuthGuard + @StoreId()
```

Retorna `UsageResult`. Exemplo:
```json
{
  "plan": "BASIC",
  "limits": { "stores": 1, "productsPerStore": 30 },
  "usage":  { "stores": 1, "products": 24 },
  "warnings": { "stores": false, "products": true }
}
```

Quando `plan === 'ENTERPRISE'`:
```json
{
  "plan": "ENTERPRISE",
  "limits": { "stores": null, "productsPerStore": null },
  "usage":  { "stores": 2, "products": 140 },
  "warnings": { "stores": false, "products": false }
}
```
(Substitui `Infinity` por `null` na serialização JSON)

### Módulo e Exports

`PlansModule` exporta `PlansService`. `ProductsModule` e `AuthModule` importam `PlansModule`.

### Integração nos módulos existentes

**`products.service.ts` — método `create`:**
Chamar `await this.plansService.checkProductLimit(storeId)` como primeira operação.

**`auth.service.ts` (registro) — criação da loja:**
Chamar `await this.plansService.checkStoreLimit(tenantId)` antes de `prisma.store.create`.
Verificar qual método do auth service cria a loja (pode ser `register` ou equivalente).

---

## Frontend — Dashboard

**Arquivo:** `apps/web/app/(admin)/admin/page.tsx`

Adicionar seção "Seu plano" acima dos stats existentes. Consome `GET /plan/usage` com o token admin.

**Layout:**
```
┌─────────────────────────────────────────────────────┐
│ Plano BASIC                              [Upgrade →] │
├──────────────────────┬──────────────────────────────┤
│ Produtos             │ Lojas                         │
│ ████████░░  24/30    │ ██████████  1/1               │
│ ⚠ 80% do limite      │ No limite                    │
└──────────────────────┴──────────────────────────────┘
```

**Regras visuais:**
- Barra de progresso: verde (`< 80%`), amarela (`80–99%`), vermelha (`100%`)
- Aviso `⚠` aparece quando `warnings.X === true`
- Texto "No limite" quando `usage === limit`
- Botão "Upgrade →" com `href="#"` (link configurável no futuro)
- Quando `plan === 'ENTERPRISE'`: **não renderizar a seção** (sem limites)
- Quando `limits.X === null` (ENTERPRISE serializado): tratar como ilimitado

**Tratamento de erros no frontend:**
Nenhuma mudança necessária. O fluxo atual de `products/page.tsx` e `auth` já faz `alert(e.message)` quando a API retorna erro — a mensagem descritiva de upgrade chegará automaticamente.

---

## O que NÃO está no escopo

- Cobrança recorrente / billing
- Página de upgrade com pagamento
- Emails de aviso de limite
- Limites de pedidos por mês
- Feature flags por plano (ex: variantes só no PRO)
