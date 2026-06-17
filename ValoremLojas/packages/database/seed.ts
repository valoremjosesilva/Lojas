import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  // Tenant + Store de demonstração
  const tenant = await prisma.tenant.upsert({
    where: { email: 'contato@demo.com.br' },
    update: {},
    create: { name: 'Demo Comércio', email: 'contato@demo.com.br', plan: 'PRO' },
  })

  const store = await prisma.store.upsert({
    where: { subdomain: 'demo' },
    update: {},
    create: {
      tenantId: tenant.id,
      name: 'Loja Demo',
      subdomain: 'demo',
      description: 'Loja de demonstração da Valorem Lojas',
    },
  })

  // Usuário admin (senha: password123)
  const password = await bcrypt.hash('password123', 10)
  const admin = await prisma.user.upsert({
    where: { storeId_email: { storeId: store.id, email: 'admin@demo.com.br' } },
    update: {},
    create: {
      storeId: store.id,
      name: 'Admin Demo',
      email: 'admin@demo.com.br',
      password,
      role: 'ADMIN',
    },
  })

  // Produto
  const product = await prisma.product.upsert({
    where: { storeId_slug: { storeId: store.id, slug: 'camiseta-basica' } },
    update: {},
    create: {
      storeId: store.id,
      name: 'Camiseta Básica',
      slug: 'camiseta-basica',
      price: 79.9,
      stock: 100,
      description: 'Camiseta 100% algodão',
    },
  })

  // Cliente com histórico de pedidos
  const maria = await prisma.customer.upsert({
    where: { storeId_email: { storeId: store.id, email: 'maria@cliente.com' } },
    update: {},
    create: {
      storeId: store.id,
      name: 'Maria Silva',
      email: 'maria@cliente.com',
      phone: '(11) 98888-7777',
      cpf: '123.456.789-00',
    },
  })

  const existingOrders = await prisma.order.count({ where: { customerId: maria.id } })
  if (existingOrders === 0) {
    await prisma.order.create({
      data: {
        storeId: store.id,
        customerId: maria.id,
        status: 'PAID',
        subtotal: 159.8,
        total: 159.8,
        items: { create: [{ productId: product.id, name: product.name, price: 79.9, quantity: 2 }] },
      },
    })
    await prisma.order.create({
      data: {
        storeId: store.id,
        customerId: maria.id,
        status: 'PENDING',
        subtotal: 79.9,
        total: 79.9,
        items: { create: [{ productId: product.id, name: product.name, price: 79.9, quantity: 1 }] },
      },
    })
  }

  const existingAddr = await prisma.address.count({ where: { customerId: maria.id } })
  if (existingAddr === 0) {
    await prisma.address.create({
      data: {
        customerId: maria.id,
        label: 'Casa',
        zipCode: '01310-100',
        street: 'Av. Paulista',
        number: '1000',
        district: 'Bela Vista',
        city: 'São Paulo',
        state: 'SP',
        isDefault: true,
      },
    })
  }

  console.log('✅ Seed concluído:')
  console.log(`   Store:    ${store.name} (subdomínio: ${store.subdomain})`)
  console.log(`   Admin:    ${admin.email} / password123`)
  console.log(`   Cliente:  ${maria.name} (${await prisma.order.count({ where: { customerId: maria.id } })} pedidos)`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
