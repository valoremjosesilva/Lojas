import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common'
import { PrismaService } from '../../infra/database/prisma.service'
import { NotificationsService } from '../notifications/notifications.service'
import { Plan, UpgradeRequestStatus } from '@prisma/client'

const PLAN_ORDER: Plan[] = [Plan.BASIC, Plan.PRO, Plan.ENTERPRISE]

export function resolveEffectivePlan(
  plan: Plan,
  trialPlan: Plan | null,
  trialEndsAt: Date | null,
): Plan {
  if (trialPlan && trialEndsAt && trialEndsAt > new Date()) return trialPlan
  return plan
}

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async getBillingStatus(storeId: string) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      include: {
        tenant: {
          include: {
            upgradeRequests: {
              where: { status: UpgradeRequestStatus.PENDING },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
      },
    })
    if (!store) throw new NotFoundException('Loja não encontrada')

    const { tenant } = store
    const effectivePlan = resolveEffectivePlan(tenant.plan, tenant.trialPlan, tenant.trialEndsAt)
    const trialActive = !!(tenant.trialPlan && tenant.trialEndsAt && tenant.trialEndsAt > new Date())
    const daysRemaining = trialActive && tenant.trialEndsAt
      ? Math.max(0, Math.ceil((tenant.trialEndsAt.getTime() - Date.now()) / 86_400_000))
      : null

    const pending = tenant.upgradeRequests[0] ?? null

    return {
      plan: tenant.plan,
      effectivePlan,
      trial: {
        active: trialActive,
        plan: trialActive ? tenant.trialPlan : null,
        endsAt: trialActive ? tenant.trialEndsAt : null,
        daysRemaining,
      },
      pendingRequest: pending
        ? { id: pending.id, toPlan: pending.toPlan, createdAt: pending.createdAt }
        : null,
      billingEmail: tenant.billingEmail,
    }
  }

  async requestUpgrade(storeId: string, toPlan: Plan) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      include: { tenant: true },
    })
    if (!store) throw new NotFoundException('Loja não encontrada')

    const { tenant } = store
    const effectivePlan = resolveEffectivePlan(tenant.plan, tenant.trialPlan, tenant.trialEndsAt)

    if (PLAN_ORDER.indexOf(toPlan) <= PLAN_ORDER.indexOf(effectivePlan)) {
      throw new BadRequestException(
        `Não é possível solicitar upgrade para ${toPlan} — plano efetivo atual é ${effectivePlan}`,
      )
    }

    const request = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.upgradeRequest.findFirst({
        where: { tenantId: tenant.id, status: UpgradeRequestStatus.PENDING },
      })
      if (existing) {
        throw new ConflictException('Já existe uma solicitação de upgrade pendente')
      }

      return tx.upgradeRequest.create({
        data: {
          tenantId: tenant.id,
          fromPlan: effectivePlan,
          toPlan,
          status: UpgradeRequestStatus.PENDING,
        },
      })
    }, { isolationLevel: 'Serializable' })

    this.notifications.sendUpgradeRequest({
      tenantId: tenant.id,
      tenantName: tenant.name,
      tenantEmail: tenant.email,
      billingEmail: tenant.billingEmail,
      fromPlan: effectivePlan,
      toPlan,
      requestId: request.id,
    }).catch(() => undefined)

    return request
  }

  async approvePlan(tenantId: string, plan: Plan, apiKey: string) {
    this.validateAdminKey(apiKey)

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } })
    if (!tenant) throw new NotFoundException('Tenant não encontrado')

    const [updated] = await this.prisma.$transaction([
      this.prisma.tenant.update({
        where: { id: tenantId },
        data: { plan },
      }),
      this.prisma.upgradeRequest.updateMany({
        where: { tenantId, status: UpgradeRequestStatus.PENDING },
        data: { status: UpgradeRequestStatus.APPROVED, resolvedAt: new Date() },
      }),
    ])

    return updated
  }

  async rejectRequest(tenantId: string, requestId: string, apiKey: string) {
    this.validateAdminKey(apiKey)

    const request = await this.prisma.upgradeRequest.findFirst({
      where: { id: requestId, tenantId },
    })
    if (!request) throw new NotFoundException('Solicitação não encontrada')

    return this.prisma.upgradeRequest.update({
      where: { id: requestId },
      data: { status: UpgradeRequestStatus.REJECTED, resolvedAt: new Date() },
    })
  }

  async startTrial(tenantId: string, plan: Plan, days: number, apiKey: string) {
    this.validateAdminKey(apiKey)

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } })
    if (!tenant) throw new NotFoundException('Tenant não encontrado')

    const trialEndsAt = new Date(Date.now() + days * 86_400_000)

    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: { trialPlan: plan, trialEndsAt },
    })
  }

  private validateAdminKey(apiKey: string) {
    if (!process.env.PLATFORM_ADMIN_KEY || apiKey !== process.env.PLATFORM_ADMIN_KEY) {
      throw new UnauthorizedException('Chave de administração inválida')
    }
  }
}
