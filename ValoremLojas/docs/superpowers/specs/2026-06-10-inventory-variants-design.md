# Inventory — Variantes de Produto

**Data:** 2026-06-10
**Status:** Aprovado

## Contexto

O sistema atual gerencia estoque como um campo `Int` simples no modelo `Product`. Não há suporte a variantes (tamanho, cor, etc.). Este documento especifica a implementação do módulo Inventory com suporte a múltiplos atributos combinados — modelo Shopify.

---

## Modelo de Dados

### Novos modelos Prisma

```prisma
model ProductAttribute {
  id        String           @id @default(uuid())
  productId String
  storeId   String
  name      String           // ex: "Tamanho", "Cor"
  position  Int              @default(0)

  product   Product          @relation(fields: [productId], references: [id], onDelete: Cascade)
  values    AttributeValue[]

  @@index([productId])
  @@map("product_attributes")
}

model AttributeValue {
  id          String                  @id @default(uuid())
  attributeId String
  value       String                  // ex: "P", "M", "G", "Azul"
  position    Int                     @default(0)

  attribute   ProductAttribute        @relation(fields: [attributeId], references: [id], onDelete: Cascade)
  variantValues VariantAttributeValue[]

  @@index([attributeId])
  @@map("attribute_values")
}

model ProductVariant {
  id           String    @id @default(uuid())
  productId    String
  storeId      String
  sku          String?
  price        Decimal
  comparePrice Decimal?
  costPrice    Decimal?
  stock        Int       @default(0)
  active       Boolean   @default(true)
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  product         Product                 @relation(fields: [productId], references: [id], onDelete: Cascade)
  attributeValues VariantAttributeValue[]
  images          VariantImage[]
  orderItems      OrderItem[]

  @@index([productId])
  @@index([storeId])
  @@map("product_variants")
}

model VariantAttributeValue {
  variantId        String
  attributeValueId String

  variant        ProductVariant @relation(fields: [variantId], references: [id], onDelete: Cascade)
  attributeValue AttributeValue @relation(fields: [attributeValueId], references: [id], onDelete: Restrict)

  @@id([variantId, attributeValueId])
  @@map("variant_attribute_values")
}

model VariantImage {
  id        String  @id @default(uuid())
  variantId String
  url       String
  alt       String?
  order     Int     @default(0)

  variant   ProductVariant @relation(fields: [variantId], references: [id], onDelete: Cascade)

  @@map("variant_images")
}
```

### Mudanças em modelos existentes

**`Product`** — sem alterações de schema. `price` e `stock` continuam como fallback para produtos sem variantes. A lógica de negócio detecta a presença de variantes e ignora esses campos quando existirem.

**`OrderItem`** — adicionar campo nullable:
```prisma
variantId  String?
variant    ProductVariant? @relation(fields: [variantId], references: [id])
```

### Produto simples vs. produto com variantes

| Situação | Preço | Estoque |
|---|---|---|
| Sem variantes | `product.price` | `product.stock` |
| Com variantes | `variant.price` | `variant.stock` |

---

## Backend — Módulo Inventory

**Localização:** `apps/api/src/modules/inventory/`

Arquivos:
- `inventory.module.ts`
- `inventory.controller.ts`
- `inventory.service.ts`

### Endpoints

#### Atributos

```
GET    /products/:productId/attributes
POST   /products/:productId/attributes          body: { name, position? }
DELETE /products/:productId/attributes/:id

POST   /products/:productId/attributes/:id/values        body: { value, position? }
DELETE /products/:productId/attributes/:id/values/:vid
```

#### Variantes

```
GET    /products/:productId/variants
POST   /products/:productId/variants            body: { sku?, price, comparePrice?, stock, active?, attributeValueIds[] }
PATCH  /products/:productId/variants/:id        body: { sku?, price?, comparePrice?, stock?, active? }
DELETE /products/:productId/variants/:id

POST   /products/:productId/variants/generate   — gera produto cartesiano dos atributos existentes
```

#### Imagens de variante

```
GET    /products/:productId/variants/:id/images
POST   /products/:productId/variants/:id/images   body: { url, alt? }
DELETE /products/:productId/variants/:id/images/:imageId
```

Todos os endpoints são protegidos por `JwtGuard` e validam ownership via `storeId`.

### Ajustes em módulos existentes

**`products.service.ts` — `findBySlug`:**
Passar a incluir:
```ts
attributes: { include: { values: true }, orderBy: { position: 'asc' } },
variants: {
  where: { active: true },
  include: {
    images: { orderBy: { order: 'asc' } },
    attributeValues: { include: { attribute: true } },
  },
},
```

**`checkout.service.ts`:**
1. Validação de estoque: quando item tem `variantId`, busca `ProductVariant` e valida `variant.stock`. Caso contrário, usa `product.stock`.
2. Validações adicionais: variante deve pertencer ao produto, e variante deve estar ativa.
3. Deducão de estoque: decrementa `variant.stock` quando `variantId` presente, senão `product.stock`.
4. `OrderItem.create`: inclui `variantId` quando presente.

**`search` (Meilisearch):**
Ao indexar produto com variantes:
- `price`: `Math.min(...variants.map(v => v.price))`
- `stock`: `variants.reduce((acc, v) => acc + v.stock, 0)`

---

## Frontend

### Storefront — `/product/[slug]`

Quando `product.variants.length > 0`:

1. Renderizar seletores de atributo (botões de toggle por valor).
2. Estado local `selectedValues: Record<attributeId, attributeValueId>`.
3. Quando todos os atributos tiverem valor selecionado, derivar a variante correspondente (`selectedVariant`).
4. Exibir `selectedVariant.price`, estoque e imagens (fallback para galeria do produto).
5. "Adicionar ao carrinho" desabilitado até seleção completa.
6. Valores de variante com `stock === 0` exibidos como disabled (acinzentados/riscados).
7. Carrinho armazena `{ productId, variantId, quantity }` — `variantId: null` para produtos simples.

### Admin — `/admin/products`

Adicionar aba "Variantes" no formulário de edição (somente na edição, não na criação):

1. **Seção Atributos:** lista de atributos com seus valores. Botão "+ Adicionar atributo", input inline para novo valor.
2. **Botão "Gerar combinações":** chama `POST /products/:id/variants/generate`. Confirmação antes de executar.
3. **Tabela de variantes:** colunas SKU | Atributos | Preço | Estoque | Ativo. Edição inline de preço, estoque e SKU. Toggle de ativo.
4. **Imagens por variante:** linha expansível com mini-galeria (mesmo padrão de upload da galeria do produto).
5. Produto sem variantes: formulário atual sem alterações visuais.

---

## Tratamento de Erros

| Situação | Resposta |
|---|---|
| `variantId` não pertence ao `productId` | `400 BadRequestException` |
| Variante inativa | `400 variante indisponível` |
| Estoque insuficiente na variante | `400 estoque insuficiente` |
| Produto com variantes, sem `variantId` no item | `400 selecione uma variante` |
| Deletar `AttributeValue` em uso por variante | `400 remova a variante antes` |
| Deletar `ProductAttribute` com variantes associadas | `400 remova as variantes antes` |
| Deletar variante presente em `OrderItem` | soft-delete (`active: false`), nunca delete físico |

### Gerador de combinações — idempotência

O endpoint `generate` verifica combinações já existentes (por conjunto de `attributeValueIds`) e cria apenas as faltantes. Executar duas vezes não duplica variantes.

---

## Migração

Uma única migration Prisma:
- Cria as 5 novas tabelas.
- Adiciona `variantId String?` em `order_items`.
- Zero impacto em dados existentes (nullable + fallback no `Product`).
