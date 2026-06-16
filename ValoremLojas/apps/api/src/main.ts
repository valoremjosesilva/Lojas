import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger'
import { AppModule } from './app.module'
import { BULL_BOARD_ROUTER } from './infra/bull-board/bull-board.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  // CORS — permite o frontend e storefronts dos tenants
  app.enableCors({
    origin: [
      process.env.FRONTEND_URL || 'http://localhost:3000',
      /\.valorem\.lojas$/,         // subdomínios dos tenants (dev)
      /\.valorem\.com\.br$/,       // produção
    ],
    credentials: true,
  })

  // Validação global de DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  )

  // Swagger (docs)
  const config = new DocumentBuilder()
    .setTitle('Valorem Lojas API')
    .setDescription('SaaS E-commerce Multi-Tenant — API Docs')
    .setVersion('1.0')
    .addBearerAuth()
    .build()
  const document = SwaggerModule.createDocument(app, config)
  SwaggerModule.setup('docs', app, document)

  // Bull Board — UI de debug das filas (sem auth; proteger via proxy no deploy)
  const bullBoardRouter = app.get(BULL_BOARD_ROUTER)
  app.use('/bull-board', bullBoardRouter)

  const port = process.env.PORT || 3001
  await app.listen(port)
  console.log(`🚀 API rodando em http://localhost:${port}`)
  console.log(`📄 Docs em http://localhost:${port}/docs`)
  console.log(`🐂 Bull Board em http://localhost:${port}/bull-board`)
}

bootstrap()
