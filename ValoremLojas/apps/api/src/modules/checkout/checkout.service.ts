import { Injectable, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../../infra/database/prisma.service'
import { PaymentsService } from '../payments/payments.service'
import { NotificationsService } from '../notifications/notifications.service'

export interface CartItem {
  productId: string
  variantId?: string
  quantity: number
}

export interface CheckoutDto {
  items: CartItem[]
  customer: {
    name: string
    email: string
    phone?: string
    cpf?: string
  }
  shipping?: {
    zipCode: string
    street: string
    number: string
    city: string
    state: string
    complement?: string
  }
  couponCode?: string
  payment: {
    method: 'CREDIT_CARD' | 'PIX' | 'BOLETO' | 'DEBIT_CARD'
    installments?: number
    card?: { token: string }
  }
}

@Injectable()
export class CheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentsService: PaymentsService,
    private readonly notifications: NotificationsService,
  ) {}

  async process(storeId: string, dto: CheckoutDto) {
    // 1. Valida produtos e calcula subtotal
    const products = await this.prisma.product.findMany({
      where: {
        id: { in: dto.items.map((i) => i.productId) },
        storeId,
        active: true,
      },
    })

    if (products.length !== dto.items.length) {
      throw new BadRequestException('Um ou mais produtos não encontrados')
    }

    // Busca variantes necessárias (batch)
    const itemsWithVariant = dto.items.filter((i) => i.variantId)
    const variantMap = new Map<string, any>()
    if (itemsWithVariant.length > 0) {
      const fetched = await this.prisma.productVariant.findMany({
        where: {
          id: { in: itemsWithVariant.map((i) => i.variantId!) },
          storeId,
          active: true,
        },
      })
      fetched.forEach((v) => variantMap.set(v.id, v))
    }

    // Descobre quais produtos têm variantes ativas (para items sem variantId)
    const itemsWithoutVariant = dto.items.filter((i) => !i.variantId)
    const productsWithVariants = new Set<string>()
    if (itemsWithoutVariant.length > 0) {
      const pv = await this.prisma.productVariant.findMany({
        where: {
          productId: { in: itemsWithoutVariant.map((i) => i.productId) },
          storeId,
          active: true,
        },
        select: { productId: true },
        distinct: ['productId'],
      })
      pv.forEach((v) => productsWithVariants.add(v.productId))
    }

    // Verifica estoque
    for (const item of dto.items) {
      const product = products.find((p) => p.id === item.productId)!
      if (item.variantId) {
        const variant = variantMap.get(item.variantId)
        if (!variant || variant.productId !== item.productId) {
          throw new BadRequestException(`Variante indisponível: ${product.name}`)
        }
        if (variant.stock < item.quantity) {
          throw new BadRequestException(`Estoque insuficiente: ${product.name}`)
        }
      } else {
        if (productsWithVariants.has(item.productId)) {
          throw new BadRequestException(`Selecione uma variante para: ${product.name}`)
        }
        if (product.stock < item.quantity) {
          throw new BadRequestException(`Estoque insuficiente: ${product.name}`)
        }
      }
    }

    let subtotal = dto.items.reduce((acc, item) => {
      const product = products.find((p) => p.id === item.productId)!
      const price = item.variantId
        ? Number(variantMap.get(item.variantId)!.price)
        : Number(product.price)
      return acc + price * item.quantity
    }, 0)

    // 2. Aplica cupom (se houver)
    let discount = 0
    if (dto.couponCode) {
      const coupon = await this.prisma.coupon.findUnique({
        where: { storeId_code: { storeId, code: dto.couponCode } },
      })

      if (!coupon || !coupon.active) {
        throw new BadRequestException('Cupom inválido ou inativo')
      }
      if (coupon.expiresAt && coupon.expiresAt < new Date()) {
        throw new BadRequestException('Cupom expirado')
      }
      if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
        throw new BadRequestException('Cupom atingiu o limite de usos')
      }
      if (coupon.minValue !== null && subtotal < Number(coupon.minValue)) {
        throw new BadRequestException(
          `Pedido mínimo de ${Number(coupon.minValue).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} para usar este cupom`,
        )
      }

      if (coupon.type === 'PERCENTAGE') {
        discount = subtotal * (Number(coupon.value) / 100)
      } else {
        discount = Math.min(Number(coupon.value), subtotal)
      }

      await this.prisma.coupon.update({
        where: { id: coupon.id },
        data: { usedCount: { increment: 1 } },
      })
    }

    const total = Math.max(0, subtotal - discount)

    // 3. Upsert de cliente
    let customer = await this.prisma.customer.upsert({
      where: { storeId_email: { storeId, email: dto.customer.email } },
      update: { name: dto.customer.name, phone: dto.customer.phone },
      create: {
        storeId,
        name: dto.customer.name,
        email: dto.customer.email,
        phone: dto.customer.phone,
        cpf: dto.customer.cpf,
      },
    })

    // 4. Cria o pedido
    const order = await this.prisma.order.create({
      data: {
        storeId,
        customerId: customer.id,
        status: 'PENDING',
        subtotal,
        discount,
        total,
        couponCode: dto.couponCode,
        shippingZipCode: dto.shipping?.zipCode,
        shippingStreet: dto.shipping?.street,
        shippingNumber: dto.shipping?.number,
        shippingCity: dto.shipping?.city,
        shippingState: dto.shipping?.state,
        items: {
          create: dto.items.map((item) => {
            const product = products.find((p) => p.id === item.productId)!
            const variant = item.variantId ? variantMap.get(item.variantId) : null
            const price = variant ? Number(variant.price) : Number(product.price)
            return {
              productId: item.productId,
              variantId: item.variantId ?? null,
              name: product.name,
              price,
              quantity: item.quantity,
            }
          }),
        },
      },
    })

    // 5. Desconta estoque
    for (const item of dto.items) {
      if (item.variantId) {
        await this.prisma.productVariant.update({
          where: { id: item.variantId },
          data: { stock: { decrement: item.quantity } },
        })
      } else {
        await this.prisma.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.quantity } },
        })
      }
    }

    // 6. Processa pagamento
    const paymentResult = await this.paymentsService.processPayment(order.id, {
      method: dto.payment.method as any,
      installments: dto.payment.installments,
      card: dto.payment.card as any,
    })

    // 7. Envia e-mails (fire-and-forget — não bloqueia a resposta)
    this.dispatchOrderEmails(
      storeId,
      order.id,
      dto.customer.name,
      dto.customer.email,
      dto.payment.method,
      paymentResult.status,
    )

    const pr = paymentResult as any
    return {
      order,
      payment: paymentResult.payment,
      pix: pr.intent?.pixCode
        ? {
            code: pr.intent.pixCode,
            qrCode: pr.intent.pixQrCode,
          }
        : undefined,
      boleto: pr.intent?.boletoUrl
        ? { url: pr.intent.boletoUrl }
        : undefined,
      checkoutUrl: paymentResult.checkoutUrl,
    }
  }

  private async dispatchOrderEmails(
    storeId: string,
    orderId: string,
    customerName: string,
    customerEmail: string,
    paymentMethod: string,
    paymentStatus: string,
  ) {
    try {
      const [fullOrder, store] = await Promise.all([
        this.prisma.order.findUnique({
          where: { id: orderId },
          include: { items: true },
        }),
        this.prisma.store.findUnique({
          where: { id: storeId },
          include: { tenant: { select: { email: true } } },
        }),
      ])

      if (!fullOrder) return

      const emailData = {
        orderId,
        customerName,
        customerEmail,
        storeName: store?.name ?? 'Sua Loja',
        storeEmail: store?.tenant?.email,
        items: fullOrder.items.map((item: any) => ({
          name: item.name,
          quantity: item.quantity,
          price: Number(item.price),
        })),
        subtotal: Number(fullOrder.subtotal),
        discount: Number(fullOrder.discount),
        total: Number(fullOrder.total),
        paymentMethod,
        status: paymentStatus,
      }

      if (paymentStatus === 'approved') {
        await this.notifications.sendPaymentConfirmed(emailData)
      } else {
        await this.notifications.sendOrderConfirmation(emailData)
      }

      await this.notifications.sendNewOrderAlert(emailData)
    } catch {
      // silently ignore — notificações nunca devem quebrar o checkout
    }
  }
}
