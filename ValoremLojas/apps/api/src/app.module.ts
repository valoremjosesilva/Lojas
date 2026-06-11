import { Module, MiddlewareConsumer, RequestMethod } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { BullModule } from '@nestjs/bull'

import { DatabaseModule } from './infra/database/database.module'
import { CacheModule } from './infra/cache/cache.module'
import { TenantMiddleware } from './common/middleware/tenant.middleware'

import { AuthModule } from './modules/auth/auth.module'
import { StoresModule } from './modules/stores/stores.module'
import { ProductsModule } from './modules/products/products.module'
import { CategoriesModule } from './modules/categories/categories.module'
import { CustomersModule } from './modules/customers/customers.module'
import { OrdersModule } from './modules/orders/orders.module'
import { CheckoutModule } from './modules/checkout/checkout.module'
import { PaymentsModule } from './modules/payments/payments.module'
import { CouponsModule } from './modules/coupons/coupons.module'
import { InventoryModule } from './modules/inventory/inventory.module'
import { PlansModule } from './modules/plans/plans.module'
import { SearchModule } from './modules/search/search.module'
import { MediaModule } from './modules/media/media.module'
import { NotificationsModule } from './modules/notifications/notifications.module'
import { JobsModule } from './modules/jobs/jobs.module'

@Module({
  imports: [
    // Config global
    ConfigModule.forRoot({ isGlobal: true }),

    // Fila de jobs (BullMQ)
    BullModule.forRoot({
      redis: process.env.REDIS_URL,
    }),

    // Infra
    DatabaseModule,
    CacheModule,

    // Módulos de negócio
    AuthModule,
    StoresModule,
    ProductsModule,
    CategoriesModule,
    CustomersModule,
    OrdersModule,
    CheckoutModule,
    PaymentsModule,
    CouponsModule,
    InventoryModule,
    PlansModule,
    SearchModule,
    MediaModule,
    NotificationsModule,
    JobsModule,
  ],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    // Aplica o middleware de tenant em todas as rotas exceto auth e webhooks
    consumer
      .apply(TenantMiddleware)
      .exclude(
        { path: 'auth/(.*)', method: RequestMethod.ALL },
        { path: 'payments/webhook', method: RequestMethod.POST },
        { path: 'health', method: RequestMethod.GET },
      )
      .forRoutes('*')
  }
}
