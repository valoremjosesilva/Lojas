# Billing — Assinatura e Upgrade de Plano

**Data:** 2026-06-11
**Status:** Aprovado

## Contexto

Os planos BASIC/PRO/ENTERPRISE e seus limites já estão implementados no `PlansModule`. Este documento especifica o módulo de Billing responsável pelo fluxo de upgrade manual (sem gateway de pagamento por ora), trial configurável e endpoints internos para a equipe Valorem ativar planos.

**Fora do escopo:** cobrança automática recorrente, integração com gateway de pagamento, self-service de cadastro de tenants.

---

## Schema

### Alterações em `Tenant`

```prisma
model Tenant {
  // campos existentes mantidos
  billingEmail      String?               // e-mail para contato de billing
  trialPlan         Plan?                 // plano concedido durante trial
  trialEndsAt       DateTime?             // expira → reverte para tenant.plan
  upgradeRequests   UpgradeRequest[]
}
```

### Novo modelo `UpgradeRequest`

```prisma
model UpgradeRequest {
  id          String               @id @default(uuid())
  tenantId    String
  fromPlan    Plan
  toPlan      Plan
  status      UpgradeRequestStatus @default(PENDING)
  notes       String?
  createdAt   DateTime             @default(now())
  resolvedAt  DateTime?

  tenant      Tenant               @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId])
  @@map("upgrade_requests")
}

enum UpgradeRequestStatus {
  PENDING
  APPROVED
  REJECTED
}
```

### Plano efetivo (lógica)

| Condição | Plano efetivo |
|---|---|
| `trialPlan` definido E `trialEndsAt > now` | `trialPlan` |
| Caso contrário | `tenant.plan` |

Qualquer verificação de limites usa o plano efetivo, não `tenant.plan` diretamente.

---

## Backend — BillingModule

**Localização:** `apps/api/src/modules/billing/`

Arquivos:
- `billing.module.ts`
- `billing.service.ts`
- `billing.controller.ts`

### BillingService

**`getEffectivePlan(tenant)`** — helper privado:
```typescript
private getEffectivePlan(tenant: Tenant & { trialPlan: Plan | null; trialEndsAt: Date | null }): Plan {
  if (tenant.trialPlan && tenant.trialEndsAt && tenant.trialEndsAt > new Date()) {
    return tenant.trialPlan
  }
  return tenant.plan
}
```

**`getBillingStatus(storeId)`** — retorna:
```typescript
{
  plan: Plan              // tenant.plan (plano contratado)
  effectivePlan: Plan     // plano efetivo (considera trial)
  trial: {
    active: boolean
    plan: Plan | null
    endsAt: Date | null
    daysRemaining: number | null
  }
  pendingRequest: {
    id: string
    toPlan: Plan
    createdAt: Date
  } | null
  billingEmail: string | null
}
```

**`requestUpgrade(storeId, toPlan)`**:
1. Busca store → tenant
2. Valida: `toPlan` deve ser superior ao plano efetivo atual (BASIC < PRO < ENTERPRISE)
3. Verifica se não existe `UpgradeRequest` com status `PENDING` para este tenant
4. Se existe pendente: lança `ConflictException("Já existe uma solicitação de upgrade pendente")`
5. Cria `UpgradeRequest { tenantId, fromPlan: effectivePlan, toPlan, status: PENDING }`
6. Dispara e-mail de notificação via `NotificationsService` (fire-and-forget)
7. Retorna a request criada

**`approvePlan(tenantId, plan, apiKey)`** — endpoint interno:
1. Valida `apiKey === process.env.PLATFORM_ADMIN_KEY`; caso contrário `UnauthorizedException`
2. Atualiza `tenant.plan = plan`
3. Resolve todas as `UpgradeRequest` PENDING do tenant para `APPROVED` com `resolvedAt = now`
4. Retorna tenant atualizado

**`rejectPlan(tenantId, requestId, apiKey)`** — endpoint interno:
1. Valida `apiKey`
2. Atualiza `UpgradeRequest.status = REJECTED`, `resolvedAt = now`
3. Retorna request atualizada

**`startTrial(tenantId, plan, days, apiKey)`** — endpoint interno:
1. Valida `apiKey`
2. Atualiza `tenant.trialPlan = plan`, `tenant.trialEndsAt = now + days`
3. Retorna tenant atualizado

### BillingController — Endpoints

```
GET  /billing/status
     JwtAuthGuard + @StoreId()
     → BillingService.getBillingStatus(storeId)

POST /billing/upgrade
     JwtAuthGuard + @StoreId()
     body: { toPlan: 'PRO' | 'ENTERPRISE' }
     → BillingService.requestUpgrade(storeId, toPlan)

PATCH /admin/tenants/:tenantId/plan
     header: x-admin-key
     body: { plan: Plan }
     → BillingService.approvePlan(tenantId, plan, adminKey)

PATCH /admin/tenants/:tenantId/requests/:requestId/reject
     header: x-admin-key
     → BillingService.rejectPlan(tenantId, requestId, adminKey)

POST /admin/tenants/:tenantId/trial
     header: x-admin-key
     body: { plan: Plan, days: number }
     → BillingService.startTrial(tenantId, plan, days, adminKey)
```

### Integração com PlansService

Atualizar `PlansService` para:
1. Incluir `trialPlan` e `trialEndsAt` na query `store → tenant`
2. Usar `BillingService.getEffectivePlan` (extraído para um helper compartilhado) em `getUsage`, `checkProductLimit` e `checkStoreLimit`

Para evitar dependência circular (`PlansModule` ↔ `BillingModule`), o helper `getEffectivePlan` será uma **função utilitária pura** exportada de `billing.service.ts` (não um método de instância):

```typescript
export function resolveEffectivePlan(
  plan: Plan,
  trialPlan: Plan | null,
  trialEndsAt: Date | null,
): Plan {
  if (trialPlan && trialEndsAt && trialEndsAt > new Date()) return trialPlan
  return plan
}
```

`PlansService` importa e usa essa função diretamente, sem importar `BillingModule`.

### Variável de ambiente

```
PLATFORM_ADMIN_KEY="..."   # chave para endpoints internos /admin/tenants/*
```

### Notificação de upgrade

`NotificationsService` (já existente) receberá um novo método `sendUpgradeRequest(data)` que enfileira um e-mail para a equipe Valorem com os dados da solicitação (tenant name, email, fromPlan, toPlan).

---

## Frontend

### `apps/web/app/(admin)/admin/settings/page.tsx`

Nova seção "Plano atual" adicionada no **topo** da página (antes das seções existentes).

Consome `GET /billing/status` com o token admin.

**Estados visuais:**

| Situação | Visual |
|---|---|
| Plano normal, sem trial | Badge do plano + botões de upgrade para planos superiores |
| Em trial | Badge do plano + badge "EM TRIAL" + "expira em X dias" |
| Request pendente | Sem botões de upgrade + "✓ Upgrade para PRO solicitado — aguardando aprovação" |
| ENTERPRISE | Sem botões de upgrade + "Você está no plano máximo" |

**Botões de upgrade:**
- BASIC: mostra botões "Solicitar PRO" e "Solicitar ENTERPRISE"
- PRO: mostra botão "Solicitar ENTERPRISE"

**Modal de confirmação:**
```
Solicitar upgrade para PRO

Sua solicitação será enviada para a equipe Valorem.
Entraremos em contato em até 24h para confirmar o upgrade.

[Cancelar]   [Confirmar solicitação]
```

Após confirmação: desabilita botões, exibe "✓ Solicitação enviada".

### `apps/web/app/(admin)/admin/page.tsx`

Atualizar a seção de plano existente (já mostra usage bars):
- Se `trial.active`: adicionar badge amarelo "EM TRIAL" ao lado do badge do plano; exibir "⏱ Expira em X dias" abaixo
- Se `pendingRequest`: substituir o botão "Upgrade →" por "Upgrade solicitado ✓" (sem link)

---

## Tratamento de Erros

| Situação | Resposta |
|---|---|
| toPlan igual ou inferior ao plano atual | `400 BadRequest` |
| Já existe UpgradeRequest PENDING | `409 Conflict` |
| x-admin-key inválida | `401 Unauthorized` |
| Tenant não encontrado (endpoints internos) | `404 NotFound` |

---

## O que NÃO está no escopo

- Cobrança automática recorrente
- Downgrade de plano (apenas upgrade)
- Histórico de invoices
- Self-service de cadastro de tenants
- Notificação de expiração de trial (cron job)
