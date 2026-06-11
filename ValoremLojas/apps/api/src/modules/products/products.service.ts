import { Injectable, NotFoundException, Inject, Optional } from '@nestjs/common'
import { PrismaService } from '../../infra/database/prisma.service'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Cache } from 'cache-manager'
import { SearchService } from '../search/search.service'
import { MediaService } from '../media/media.service'

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private cache: Cache,
    @Optional() private readonly searchService?: SearchService,
    @Optional() private readonly mediaService?: MediaService,
  ) {}

  private cacheKey(storeId: string) {
    return `products:${storeId}`
  }

  async findAll(storeId: string, query?: { category?: string; search?: string; active?: boolean }) {
    // Redireciona busca textual para o Meilisearch
    if (query?.search && this.searchService) {
      const result = await this.searchService.search(storeId, query.search)
      return result.hits
    }

    // Tenta cache (lista básica sem filtros)
    if (!query?.category) {
      const cached = await this.cache.get(this.cacheKey(storeId))
      if (cached) return cached
    }

    const products = await this.prisma.product.findMany({
      where: {
        storeId,
        active: query?.active ?? true,
        ...(query?.category && { category: { slug: query.category } }),
      },
      include: {
        images: { orderBy: { order: 'asc' }, take: 1 },
        category: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    if (!query?.category) {
      await this.cache.set(this.cacheKey(storeId), products, 300)
    }

    return products
  }

  async findBySlug(storeId: string, slug: string) {
    const product = await this.prisma.product.findUnique({
      where: { storeId_slug: { storeId, slug } },
      include: {
        images: { orderBy: { order: 'asc' } },
        category: true,
        attributes: {
          orderBy: { position: 'asc' },
          include: { values: { orderBy: { position: 'asc' } } },
        },
        variants: {
          where: { active: true },
          orderBy: { createdAt: 'asc' },
          include: {
            images: { orderBy: { order: 'asc' } },
            attributeValues: {
              include: { attributeValue: { include: { attribute: true } } },
            },
          },
        },
      },
    })

    if (!product) throw new NotFoundException('Produto não encontrado')
    return product
  }

  async create(storeId: string, data: any) {
    const product = await this.prisma.product.create({
      data: { ...data, storeId },
      include: {
        images: { take: 1, orderBy: { order: 'asc' } },
        category: { select: { name: true } },
        variants: { where: { active: true }, select: { price: true, stock: true } },
      },
    })
    await this.cache.del(this.cacheKey(storeId))
    this.indexProduct(product)
    return product
  }

  async update(storeId: string, id: string, data: any) {
    await this.ensureOwnership(storeId, id)
    const product = await this.prisma.product.update({
      where: { id },
      data,
      include: {
        images: { take: 1, orderBy: { order: 'asc' } },
        category: { select: { name: true } },
        variants: { where: { active: true }, select: { price: true, stock: true } },
      },
    })
    await this.cache.del(this.cacheKey(storeId))
    this.indexProduct(product)
    return product
  }

  async remove(storeId: string, id: string) {
    const product = await this.ensureOwnership(storeId, id)
    await this.prisma.product.delete({ where: { id } })
    await this.cache.del(this.cacheKey(storeId))
    this.searchService?.deleteProduct(product.id)
  }

  private indexProduct(product: any) {
    const hasVariants = product.variants && product.variants.length > 0
    const price = hasVariants
      ? product.variants.reduce((min: number, v: any) => Math.min(min, Number(v.price)), Infinity)
      : Number(product.price)
    const stock = hasVariants
      ? product.variants.reduce((acc: number, v: any) => acc + v.stock, 0)
      : product.stock

    this.searchService?.indexProduct({
      id: product.id,
      storeId: product.storeId,
      name: product.name,
      slug: product.slug,
      description: product.description,
      price,
      comparePrice: product.comparePrice ? Number(product.comparePrice) : null,
      stock,
      active: product.active,
      featured: product.featured,
      categoryId: product.categoryId,
      categoryName: product.category?.name ?? null,
      imageUrl: product.images?.[0]?.url ?? null,
      sku: product.sku,
    })
  }

  async getImages(storeId: string, productId: string) {
    await this.ensureOwnership(storeId, productId)
    return this.prisma.productImage.findMany({
      where: { productId },
      orderBy: { order: 'asc' },
    })
  }

  async addImage(storeId: string, productId: string, data: { url: string; alt?: string }) {
    await this.ensureOwnership(storeId, productId)
    const count = await this.prisma.productImage.count({ where: { productId } })
    const image = await this.prisma.productImage.create({
      data: { productId, url: data.url, alt: data.alt ?? null, order: count },
    })
    // Atualiza índice de busca com nova imagem se for a primeira
    if (count === 0) {
      const product = await this.prisma.product.findUnique({
        where: { id: productId },
        include: {
          images: { take: 1, orderBy: { order: 'asc' } },
          category: { select: { name: true } },
          variants: { where: { active: true }, select: { price: true, stock: true } },
        },
      })
      if (product) this.indexProduct(product)
    }
    await this.cache.del(this.cacheKey(storeId))
    return image
  }

  async removeImage(storeId: string, productId: string, imageId: string) {
    await this.ensureOwnership(storeId, productId)
    const image = await this.prisma.productImage.findFirst({
      where: { id: imageId, productId },
    })
    if (!image) throw new NotFoundException('Imagem não encontrada')
    await this.prisma.productImage.delete({ where: { id: imageId } })
    // Remove do storage se possível derivar a chave
    if (this.mediaService) {
      const key = this.mediaService.extractKey(image.url)
      if (key) this.mediaService.deleteFile(key)
    }
    await this.cache.del(this.cacheKey(storeId))
  }

  private async ensureOwnership(storeId: string, productId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, storeId },
    })
    if (!product) throw new NotFoundException('Produto não encontrado')
    return product
  }
}
