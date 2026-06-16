import {
  Controller, Get, Post, Put, Delete,
  Param, Body, Query, UseGuards, HttpCode,
} from '@nestjs/common'
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger'
import { IsString, IsEmail, IsOptional, MinLength } from 'class-validator'
import { CustomersService } from './customers.service'
import { JwtAuthGuard } from '../../common/guards/jwt.guard'
import { StoreId } from '../../common/decorators/tenant.decorator'

class CreateCustomerDto {
  @IsString() @MinLength(2) name: string
  @IsEmail() email: string
  @IsOptional() @IsString() phone?: string
  @IsOptional() @IsString() cpf?: string
}

class UpdateCustomerDto {
  @IsOptional() @IsString() @MinLength(2) name?: string
  @IsOptional() @IsEmail() email?: string
  @IsOptional() @IsString() phone?: string
  @IsOptional() @IsString() cpf?: string
}

@ApiTags('Customers')
@Controller('customers')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  findAll(
    @StoreId() storeId: string,
    @Query('search') search?: string,
    @Query('page') page?: number,
  ) {
    return this.customersService.findAll(storeId, { search, page: page ? Number(page) : undefined })
  }

  @Get(':id')
  findOne(@StoreId() storeId: string, @Param('id') id: string) {
    return this.customersService.findOne(storeId, id)
  }

  @Get(':id/orders')
  getOrders(@StoreId() storeId: string, @Param('id') id: string) {
    return this.customersService.getOrders(storeId, id)
  }

  @Post()
  create(@StoreId() storeId: string, @Body() dto: CreateCustomerDto) {
    return this.customersService.create(storeId, dto)
  }

  @Put(':id')
  update(
    @StoreId() storeId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.customersService.update(storeId, id, dto)
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@StoreId() storeId: string, @Param('id') id: string) {
    return this.customersService.remove(storeId, id)
  }
}
