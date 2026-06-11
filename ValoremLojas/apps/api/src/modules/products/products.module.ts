import { Module } from '@nestjs/common'
import { ProductsController } from './products.controller'
import { ProductsService } from './products.service'
import { SearchModule } from '../search/search.module'
import { MediaModule } from '../media/media.module'
import { PlansModule } from '../plans/plans.module'

@Module({
  imports: [SearchModule, MediaModule, PlansModule],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
