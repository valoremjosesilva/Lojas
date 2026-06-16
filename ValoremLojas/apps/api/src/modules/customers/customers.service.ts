import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../infra/database/prisma.service'

// Status que contam como receita efetiva do cliente
const PAID_STATUSES: Prisma.EnumOrderStatusFilter['in'] = [
  'PAID',
  'PROCESSING',
  'SHIPPED',
  'DELIVERED',
]

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureExists(storeId: string, id: string) {
    const customer = await this.prisma.customer.findFirst({ where: { id, storeId } })
    if (!customer) throw new NotFoundException('Cliente não encontrado')
    return customer
  }

  async findAll(storeId: string, filters?: { search?: string; page?: number }) {
    const page = filters?.page && filters.page > 0 ? filters.page : 1
    const take = 20

    const where: Prisma.CustomerWhereInput = {
      storeId,
      ...(filters?.search && {
        OR: [
          { name: { contains: filters.search, mode: 'insensitive' } },
          { email: { contains: filters.search, mode: 'insensitive' } },
        ],
      }),
    }

    return this.prisma.customer.findMany({
      where,
      include: { _count: { select: { orders: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * take,
      take,
    })
  }

  async findOne(storeId: string, id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, storeId },
      include: {
        addresses: true,
        orders: {
          orderBy: { createdAt: 'desc' },
          include: {
            payment: { select: { status: true, method: true } },
            items: { select: { name: true, quantity: true, price: true } },
          },
        },
      },
    })
    if (!customer) throw new NotFoundException('Cliente não encontrado')

    const totalSpent = customer.orders
      .filter((o) => (PAID_STATUSES as string[]).includes(o.status))
      .reduce((acc, o) => acc + Number(o.total), 0)

    return {
      ...customer,
      stats: {
        orderCount: customer.orders.length,
        totalSpent: Math.round(totalSpent * 100) / 100,
      },
    }
  }

  async getOrders(storeId: string, id: string) {
    await this.ensureExists(storeId, id)
    return this.prisma.order.findMany({
      where: { storeId, customerId: id },
      orderBy: { createdAt: 'desc' },
      include: {
        payment: { select: { status: true, method: true } },
        items: { select: { name: true, quantity: true, price: true } },
      },
    })
  }

  async create(storeId: string, data: { name: string; email: string; phone?: string; cpf?: string }) {
    try {
      return await this.prisma.customer.create({
        data: {
          storeId,
          name: data.name,
          email: data.email.toLowerCase().trim(),
          phone: data.phone,
          cpf: data.cpf,
        },
      })
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new BadRequestException('Já existe um cliente com este e-mail nesta loja')
      }
      throw e
    }
  }

  async update(
    storeId: string,
    id: string,
    data: { name?: string; email?: string; phone?: string; cpf?: string },
  ) {
    await this.ensureExists(storeId, id)
    try {
      return await this.prisma.customer.update({
        where: { id },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.email !== undefined && { email: data.email.toLowerCase().trim() }),
          ...(data.phone !== undefined && { phone: data.phone }),
          ...(data.cpf !== undefined && { cpf: data.cpf }),
        },
      })
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new BadRequestException('Já existe um cliente com este e-mail nesta loja')
      }
      throw e
    }
  }

  async remove(storeId: string, id: string) {
    await this.ensureExists(storeId, id)

    const orderCount = await this.prisma.order.count({ where: { storeId, customerId: id } })
    if (orderCount > 0) {
      throw new BadRequestException(
        'Não é possível excluir um cliente com pedidos. O histórico precisa ser preservado.',
      )
    }

    // Cliente sem pedidos — remove endereços vinculados e o cliente em uma transação
    await this.prisma.$transaction([
      this.prisma.address.deleteMany({ where: { customerId: id } }),
      this.prisma.customer.delete({ where: { id } }),
    ])
  }
}
