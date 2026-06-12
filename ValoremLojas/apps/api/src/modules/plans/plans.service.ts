import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../infra/database/prisma.service'
import { Plan } from '@prisma/client'
import { resolveEffectivePlan } from '../billing/billing.service'

export const PLAN_LIMITS: Record<Plan, { stores: number; productsPerStore: number }> = {
  BASIC:      { stores: 1,        productsPerStore: 30  },
  PRO:        { stores: 3,        productsPerStore: 300 },
  ENTERPRISE: { stores: Infinity, productsPerStore: Infinity },
}

export interface UsageResult {
  plan: Plan
  limits: { stores: number | null; productsPerStore: number | null }
  usage:  { stores: number; products: number }
  warnings: { stores: boolean; products: boolean }
}

@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService) {}

  private upgradeMessage(current: Plan): string {
    if (current === Plan.BASIC) return 'Faça upgrade para o plano PRO.'
    if (current === Plan.PRO)   return 'Faça upgrade para o plano ENTERPRISE.'
    return ''
  }

  private finite(n: number): number | null {
    return n === Infinity ? null : n
  }

  async getUsage(storeId: string): Promise<UsageResult> {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      include: {
        tenant: {
          select: { plan: true, trialPlan: true, trialEndsAt: true, id: true },
        },
      },
    })
    if (!store) throw new NotFoundException('Loja não encontrada')

    const plan = resolveEffectivePlan(store.tenant.plan, store.tenant.trialPlan, store.tenant.trialEndsAt)
    const limits = PLAN_LIMITS[plan]

    const [products, stores] = await Promise.all([
      this.prisma.product.count({ where: { storeId } }),
      this.prisma.store.count({ where: { tenantId: store.tenantId } }),
    ])

    return {
      plan,
      limits: {
        stores: this.finite(limits.stores),
        productsPerStore: this.finite(limits.productsPerStore),
      },
      usage: { stores, products },
      warnings: {
        products: limits.productsPerStore !== Infinity && products / limits.productsPerStore >= 0.8,
        stores:   limits.stores !== Infinity          && stores   / limits.stores           >= 0.8,
      },
    }
  }

  async checkProductLimit(storeId: string): Promise<void> {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      include: {
        tenant: {
          select: { plan: true, trialPlan: true, trialEndsAt: true },
        },
      },
    })
    if (!store) throw new NotFoundException('Loja não encontrada')

    const plan = resolveEffectivePlan(store.tenant.plan, store.tenant.trialPlan, store.tenant.trialEndsAt)
    const limit = PLAN_LIMITS[plan].productsPerStore
    if (limit === Infinity) return

    const count = await this.prisma.product.count({ where: { storeId } })
    if (count >= limit) {
      throw new ForbiddenException(
        `Limite de produtos atingido (${count}/${limit}). ${this.upgradeMessage(plan)}`,
      )
    }
  }

  async checkStoreLimit(tenantId: string): Promise<void> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { plan: true, trialPlan: true, trialEndsAt: true },
    })
    if (!tenant) throw new NotFoundException('Tenant não encontrado')

    const plan = resolveEffectivePlan(tenant.plan, tenant.trialPlan, tenant.trialEndsAt)
    const limit = PLAN_LIMITS[plan].stores
    if (limit === Infinity) return

    const count = await this.prisma.store.count({ where: { tenantId } })
    if (count >= limit) {
      throw new ForbiddenException(
        `Limite de lojas atingido (${count}/${limit}). ${this.upgradeMessage(plan)}`,
      )
    }
  }
}
