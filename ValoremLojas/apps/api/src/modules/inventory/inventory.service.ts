import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../infra/database/prisma.service'

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureProductOwnership(storeId: string, productId: string) {
    const product = await this.prisma.product.findFirst({ where: { id: productId, storeId } })
    if (!product) throw new NotFoundException('Produto não encontrado')
    return product
  }

  private async ensureVariantOwnership(storeId: string, productId: string, variantId: string) {
    const variant = await this.prisma.productVariant.findFirst({
      where: { id: variantId, productId, storeId },
    })
    if (!variant) throw new NotFoundException('Variante não encontrada')
    return variant
  }

  // ─── Atributos ────────────────────────────────────────────

  async getAttributes(storeId: string, productId: string) {
    await this.ensureProductOwnership(storeId, productId)
    return this.prisma.productAttribute.findMany({
      where: { productId },
      orderBy: { position: 'asc' },
      include: { values: { orderBy: { position: 'asc' } } },
    })
  }

  async createAttribute(storeId: string, productId: string, data: { name: string; position?: number }) {
    await this.ensureProductOwnership(storeId, productId)
    return this.prisma.productAttribute.create({
      data: { productId, storeId, name: data.name, position: data.position ?? 0 },
      include: { values: true },
    })
  }

  async deleteAttribute(storeId: string, productId: string, attributeId: string) {
    await this.ensureProductOwnership(storeId, productId)
    const attr = await this.prisma.productAttribute.findFirst({
      where: { id: attributeId, productId },
      include: { values: { include: { variantValues: true } } },
    })
    if (!attr) throw new NotFoundException('Atributo não encontrado')
    const inUse = attr.values.some((v) => v.variantValues.length > 0)
    if (inUse) throw new BadRequestException('Remova as variantes que usam este atributo antes de excluí-lo')
    await this.prisma.productAttribute.delete({ where: { id: attributeId } })
  }

  async addAttributeValue(
    storeId: string,
    productId: string,
    attributeId: string,
    data: { value: string; position?: number },
  ) {
    await this.ensureProductOwnership(storeId, productId)
    const attr = await this.prisma.productAttribute.findFirst({ where: { id: attributeId, productId } })
    if (!attr) throw new NotFoundException('Atributo não encontrado')
    return this.prisma.attributeValue.create({
      data: { attributeId, value: data.value, position: data.position ?? 0 },
    })
  }

  async deleteAttributeValue(
    storeId: string,
    productId: string,
    attributeId: string,
    valueId: string,
  ) {
    await this.ensureProductOwnership(storeId, productId)
    const value = await this.prisma.attributeValue.findFirst({
      where: { id: valueId, attributeId },
      include: { variantValues: true },
    })
    if (!value) throw new NotFoundException('Valor não encontrado')
    if (value.variantValues.length > 0) {
      throw new BadRequestException('Remova as variantes que usam este valor antes de excluí-lo')
    }
    await this.prisma.attributeValue.delete({ where: { id: valueId } })
  }

  // ─── Variantes ────────────────────────────────────────────

  async getVariants(storeId: string, productId: string) {
    await this.ensureProductOwnership(storeId, productId)
    return this.prisma.productVariant.findMany({
      where: { productId },
      orderBy: { createdAt: 'asc' },
      include: {
        images: { orderBy: { order: 'asc' } },
        attributeValues: {
          include: { attributeValue: { include: { attribute: true } } },
        },
      },
    })
  }

  async createVariant(
    storeId: string,
    productId: string,
    data: {
      sku?: string
      price: number
      comparePrice?: number
      costPrice?: number
      stock?: number
      active?: boolean
      attributeValueIds: string[]
    },
  ) {
    await this.ensureProductOwnership(storeId, productId)
    return this.prisma.productVariant.create({
      data: {
        productId,
        storeId,
        sku: data.sku,
        price: data.price,
        comparePrice: data.comparePrice,
        costPrice: data.costPrice,
        stock: data.stock ?? 0,
        active: data.active ?? true,
        attributeValues: {
          create: data.attributeValueIds.map((id) => ({ attributeValueId: id })),
        },
      },
      include: {
        images: true,
        attributeValues: { include: { attributeValue: { include: { attribute: true } } } },
      },
    })
  }

  async updateVariant(
    storeId: string,
    productId: string,
    variantId: string,
    data: { sku?: string; price?: number; comparePrice?: number; costPrice?: number; stock?: number; active?: boolean },
  ) {
    await this.ensureVariantOwnership(storeId, productId, variantId)
    return this.prisma.productVariant.update({
      where: { id: variantId },
      data,
      include: {
        images: true,
        attributeValues: { include: { attributeValue: { include: { attribute: true } } } },
      },
    })
  }

  async deleteVariant(storeId: string, productId: string, variantId: string) {
    await this.ensureVariantOwnership(storeId, productId, variantId)
    const inOrders = await this.prisma.orderItem.count({ where: { variantId } })
    if (inOrders > 0) {
      await this.prisma.productVariant.update({ where: { id: variantId }, data: { active: false } })
      return
    }
    await this.prisma.productVariant.delete({ where: { id: variantId } })
  }

  async generateVariants(storeId: string, productId: string) {
    const product = await this.ensureProductOwnership(storeId, productId)

    const attributes = await this.prisma.productAttribute.findMany({
      where: { productId },
      orderBy: { position: 'asc' },
      include: { values: { orderBy: { position: 'asc' } } },
    })

    if (attributes.length === 0) throw new BadRequestException('Crie ao menos um atributo antes de gerar variantes')
    if (attributes.some((a) => a.values.length === 0)) {
      throw new BadRequestException('Todos os atributos devem ter ao menos um valor')
    }

    const cartesian = (arrays: string[][]): string[][] =>
      arrays.reduce<string[][]>((acc, curr) => acc.flatMap((a) => curr.map((b) => [...a, b])), [[]])

    const valueIdArrays = attributes.map((a) => a.values.map((v) => v.id))
    const combinations = cartesian(valueIdArrays)

    const existing = await this.prisma.productVariant.findMany({
      where: { productId },
      include: { attributeValues: true },
    })
    const existingKeys = new Set(
      existing.map((v) => v.attributeValues.map((av) => av.attributeValueId).sort().join(','))
    )

    const created: any[] = []
    for (const combo of combinations) {
      const key = [...combo].sort().join(',')
      if (existingKeys.has(key)) continue
      const variant = await this.prisma.productVariant.create({
        data: {
          productId,
          storeId,
          price: product.price,
          stock: 0,
          attributeValues: { create: combo.map((id) => ({ attributeValueId: id })) },
        },
        include: {
          attributeValues: { include: { attributeValue: { include: { attribute: true } } } },
        },
      })
      created.push(variant)
    }
    return created
  }

  // ─── Imagens de variante ──────────────────────────────────

  async getVariantImages(storeId: string, productId: string, variantId: string) {
    await this.ensureVariantOwnership(storeId, productId, variantId)
    return this.prisma.variantImage.findMany({
      where: { variantId },
      orderBy: { order: 'asc' },
    })
  }

  async addVariantImage(
    storeId: string,
    productId: string,
    variantId: string,
    data: { url: string; alt?: string },
  ) {
    await this.ensureVariantOwnership(storeId, productId, variantId)
    const count = await this.prisma.variantImage.count({ where: { variantId } })
    return this.prisma.variantImage.create({
      data: { variantId, url: data.url, alt: data.alt ?? null, order: count },
    })
  }

  async deleteVariantImage(
    storeId: string,
    productId: string,
    variantId: string,
    imageId: string,
  ) {
    await this.ensureVariantOwnership(storeId, productId, variantId)
    const image = await this.prisma.variantImage.findFirst({ where: { id: imageId, variantId } })
    if (!image) throw new NotFoundException('Imagem não encontrada')
    await this.prisma.variantImage.delete({ where: { id: imageId } })
  }
}
