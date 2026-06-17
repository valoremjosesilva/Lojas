import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  // ─── Tenant + Store ───────────────────────────────────────────────
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
      primaryColor: '#111827',
      secondaryColor: '#ffffff',
    },
  })

  await prisma.storeSettings.upsert({
    where: { storeId: store.id },
    update: {},
    create: {
      storeId: store.id,
      allowGuestCheckout: true,
      currency: 'BRL',
      maxInstallments: 12,
      minOrderValue: 0,
      freeShippingFrom: 199.9,
    },
  })

  // ─── Usuário admin (senha: password123) ──────────────────────────
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

  // ─── Categorias ──────────────────────────────────────────────────
  const categoryData = [
    { name: 'Camisetas', slug: 'camisetas' },
    { name: 'Calçados', slug: 'calcados' },
    { name: 'Acessórios', slug: 'acessorios' },
  ]
  const categories: Record<string, string> = {}
  for (const c of categoryData) {
    const cat = await prisma.category.upsert({
      where: { storeId_slug: { storeId: store.id, slug: c.slug } },
      update: {},
      create: { storeId: store.id, name: c.name, slug: c.slug },
    })
    categories[c.slug] = cat.id
  }

  // ─── Produtos (com imagem) ───────────────────────────────────────
  const productData = [
    { name: 'Camiseta Básica', slug: 'camiseta-basica', price: 79.9, comparePrice: 99.9, stock: 100, category: 'camisetas', featured: true, img: 'https://picsum.photos/seed/camiseta/600' },
    { name: 'Camiseta Estampada', slug: 'camiseta-estampada', price: 99.9, stock: 60, category: 'camisetas', img: 'https://picsum.photos/seed/estampada/600' },
    { name: 'Tênis Runner', slug: 'tenis-runner', price: 299.9, comparePrice: 359.9, stock: 25, category: 'calcados', featured: true, img: 'https://picsum.photos/seed/tenis/600' },
    { name: 'Boné Aba Reta', slug: 'bone-aba-reta', price: 59.9, stock: 80, category: 'acessorios', img: 'https://picsum.photos/seed/bone/600' },
  ]
  const products: Record<string, { id: string; name: string; price: number }> = {}
  for (const p of productData) {
    const product = await prisma.product.upsert({
      where: { storeId_slug: { storeId: store.id, slug: p.slug } },
      update: {},
      create: {
        storeId: store.id,
        categoryId: categories[p.category],
        name: p.name,
        slug: p.slug,
        description: `${p.name} — produto de demonstração`,
        price: p.price,
        comparePrice: p.comparePrice,
        stock: p.stock,
        featured: p.featured ?? false,
      },
    })
    products[p.slug] = { id: product.id, name: product.name, price: p.price }

    const imgCount = await prisma.productImage.count({ where: { productId: product.id } })
    if (imgCount === 0) {
      await prisma.productImage.create({
        data: { productId: product.id, url: p.img, alt: p.name, order: 0 },
      })
    }
  }

  // ─── Cupom ───────────────────────────────────────────────────────
  await prisma.coupon.upsert({
    where: { storeId_code: { storeId: store.id, code: 'BEMVINDO10' } },
    update: {},
    create: {
      storeId: store.id,
      code: 'BEMVINDO10',
      type: 'PERCENTAGE',
      value: 10,
      minValue: 50,
      active: true,
    },
  })

  // ─── Clientes ────────────────────────────────────────────────────
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

  const joao = await prisma.customer.upsert({
    where: { storeId_email: { storeId: store.id, email: 'joao@cliente.com' } },
    update: {},
    create: {
      storeId: store.id,
      name: 'João Souza',
      email: 'joao@cliente.com',
      phone: '(21) 97777-1234',
    },
  })

  const ana = await prisma.customer.upsert({
    where: { storeId_email: { storeId: store.id, email: 'ana@cliente.com' } },
    update: {},
    create: {
      storeId: store.id,
      name: 'Ana Oliveira',
      email: 'ana@cliente.com',
      phone: '(31) 96666-4321',
      cpf: '987.654.321-00',
    },
  })

  // Endereço da Maria
  const mariaAddr = await prisma.address.count({ where: { customerId: maria.id } })
  if (mariaAddr === 0) {
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

  // ─── Pedidos + Pagamentos (só na primeira execução) ──────────────
  const orderCount = await prisma.order.count({ where: { storeId: store.id } })
  if (orderCount === 0) {
    const camiseta = products['camiseta-basica']
    const tenis = products['tenis-runner']
    const bone = products['bone-aba-reta']

    // Maria — pedido pago
    await prisma.order.create({
      data: {
        storeId: store.id,
        customerId: maria.id,
        status: 'PAID',
        subtotal: 159.8,
        total: 159.8,
        items: { create: [{ productId: camiseta.id, name: camiseta.name, price: 79.9, quantity: 2 }] },
        payment: {
          create: { provider: 'valorem', method: 'PIX', status: 'APPROVED', amount: 159.8, paidAt: new Date() },
        },
      },
    })

    // Maria — pedido pendente
    await prisma.order.create({
      data: {
        storeId: store.id,
        customerId: maria.id,
        status: 'PENDING',
        subtotal: 79.9,
        total: 79.9,
        items: { create: [{ productId: camiseta.id, name: camiseta.name, price: 79.9, quantity: 1 }] },
        payment: {
          create: { provider: 'valorem', method: 'BOLETO', status: 'PENDING', amount: 79.9 },
        },
      },
    })

    // Ana — pedido entregue
    await prisma.order.create({
      data: {
        storeId: store.id,
        customerId: ana.id,
        status: 'DELIVERED',
        subtotal: 299.9,
        shipping: 0,
        total: 299.9,
        items: { create: [{ productId: tenis.id, name: tenis.name, price: 299.9, quantity: 1 }] },
        payment: {
          create: { provider: 'valorem', method: 'CREDIT_CARD', status: 'APPROVED', amount: 299.9, installments: 3, paidAt: new Date() },
        },
      },
    })

    // Pedido de visitante (guest checkout) — sem cliente
    await prisma.order.create({
      data: {
        storeId: store.id,
        status: 'CANCELLED',
        subtotal: 59.9,
        total: 59.9,
        items: { create: [{ productId: bone.id, name: bone.name, price: 59.9, quantity: 1 }] },
      },
    })
  }

  // ─── Resumo ──────────────────────────────────────────────────────
  const [nProducts, nCustomers, nOrders] = await Promise.all([
    prisma.product.count({ where: { storeId: store.id } }),
    prisma.customer.count({ where: { storeId: store.id } }),
    prisma.order.count({ where: { storeId: store.id } }),
  ])

  console.log('✅ Seed concluído:')
  console.log(`   Store:     ${store.name} (subdomínio: ${store.subdomain})`)
  console.log(`   Admin:     ${admin.email} / password123`)
  console.log(`   Catálogo:  ${nProducts} produtos em ${categoryData.length} categorias`)
  console.log(`   Clientes:  ${nCustomers} (Maria, João, Ana)`)
  console.log(`   Pedidos:   ${nOrders}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
