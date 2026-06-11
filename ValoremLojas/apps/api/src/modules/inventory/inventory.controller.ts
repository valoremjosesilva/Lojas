import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, UseGuards, HttpCode,
} from '@nestjs/common'
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger'
import { InventoryService } from './inventory.service'
import { JwtAuthGuard } from '../../common/guards/jwt.guard'
import { StoreId } from '../../common/decorators/tenant.decorator'
import { IsString, IsNumber, IsOptional, IsBoolean, IsArray, IsUUID } from 'class-validator'
import { Type } from 'class-transformer'

class CreateAttributeDto {
  @IsString() name: string
  @IsOptional() @IsNumber() @Type(() => Number) position?: number
}

class AddAttributeValueDto {
  @IsString() value: string
  @IsOptional() @IsNumber() @Type(() => Number) position?: number
}

class CreateVariantDto {
  @IsOptional() @IsString() sku?: string
  @IsNumber() @Type(() => Number) price: number
  @IsOptional() @IsNumber() @Type(() => Number) comparePrice?: number
  @IsOptional() @IsNumber() @Type(() => Number) costPrice?: number
  @IsOptional() @IsNumber() @Type(() => Number) stock?: number
  @IsOptional() @IsBoolean() active?: boolean
  @IsArray() @IsUUID('4', { each: true }) attributeValueIds: string[]
}

class UpdateVariantDto {
  @IsOptional() @IsString() sku?: string
  @IsOptional() @IsNumber() @Type(() => Number) price?: number
  @IsOptional() @IsNumber() @Type(() => Number) comparePrice?: number
  @IsOptional() @IsNumber() @Type(() => Number) costPrice?: number
  @IsOptional() @IsNumber() @Type(() => Number) stock?: number
  @IsOptional() @IsBoolean() active?: boolean
}

class AddVariantImageDto {
  @IsString() url: string
  @IsOptional() @IsString() alt?: string
}

@ApiTags('Inventory')
@Controller('products/:productId')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  // ─── Atributos ────────────────────────────────────────────

  @Get('attributes')
  getAttributes(@StoreId() storeId: string, @Param('productId') productId: string) {
    return this.inventoryService.getAttributes(storeId, productId)
  }

  @Post('attributes')
  createAttribute(
    @StoreId() storeId: string,
    @Param('productId') productId: string,
    @Body() dto: CreateAttributeDto,
  ) {
    return this.inventoryService.createAttribute(storeId, productId, dto)
  }

  @Delete('attributes/:attributeId')
  @HttpCode(204)
  deleteAttribute(
    @StoreId() storeId: string,
    @Param('productId') productId: string,
    @Param('attributeId') attributeId: string,
  ) {
    return this.inventoryService.deleteAttribute(storeId, productId, attributeId)
  }

  @Post('attributes/:attributeId/values')
  addAttributeValue(
    @StoreId() storeId: string,
    @Param('productId') productId: string,
    @Param('attributeId') attributeId: string,
    @Body() dto: AddAttributeValueDto,
  ) {
    return this.inventoryService.addAttributeValue(storeId, productId, attributeId, dto)
  }

  @Delete('attributes/:attributeId/values/:valueId')
  @HttpCode(204)
  deleteAttributeValue(
    @StoreId() storeId: string,
    @Param('productId') productId: string,
    @Param('attributeId') attributeId: string,
    @Param('valueId') valueId: string,
  ) {
    return this.inventoryService.deleteAttributeValue(storeId, productId, attributeId, valueId)
  }

  // ─── Variantes ────────────────────────────────────────────

  @Get('variants')
  getVariants(@StoreId() storeId: string, @Param('productId') productId: string) {
    return this.inventoryService.getVariants(storeId, productId)
  }

  @Post('variants/generate')
  generateVariants(@StoreId() storeId: string, @Param('productId') productId: string) {
    return this.inventoryService.generateVariants(storeId, productId)
  }

  @Post('variants')
  createVariant(
    @StoreId() storeId: string,
    @Param('productId') productId: string,
    @Body() dto: CreateVariantDto,
  ) {
    return this.inventoryService.createVariant(storeId, productId, dto)
  }

  @Patch('variants/:variantId')
  updateVariant(
    @StoreId() storeId: string,
    @Param('productId') productId: string,
    @Param('variantId') variantId: string,
    @Body() dto: UpdateVariantDto,
  ) {
    return this.inventoryService.updateVariant(storeId, productId, variantId, dto)
  }

  @Delete('variants/:variantId')
  @HttpCode(204)
  deleteVariant(
    @StoreId() storeId: string,
    @Param('productId') productId: string,
    @Param('variantId') variantId: string,
  ) {
    return this.inventoryService.deleteVariant(storeId, productId, variantId)
  }

  // ─── Imagens de variante ──────────────────────────────────

  @Get('variants/:variantId/images')
  getVariantImages(
    @StoreId() storeId: string,
    @Param('productId') productId: string,
    @Param('variantId') variantId: string,
  ) {
    return this.inventoryService.getVariantImages(storeId, productId, variantId)
  }

  @Post('variants/:variantId/images')
  addVariantImage(
    @StoreId() storeId: string,
    @Param('productId') productId: string,
    @Param('variantId') variantId: string,
    @Body() dto: AddVariantImageDto,
  ) {
    return this.inventoryService.addVariantImage(storeId, productId, variantId, dto)
  }

  @Delete('variants/:variantId/images/:imageId')
  @HttpCode(204)
  deleteVariantImage(
    @StoreId() storeId: string,
    @Param('productId') productId: string,
    @Param('variantId') variantId: string,
    @Param('imageId') imageId: string,
  ) {
    return this.inventoryService.deleteVariantImage(storeId, productId, variantId, imageId)
  }
}
