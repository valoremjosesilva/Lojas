'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV = [
  { href: '/admin', label: '📊 Dashboard', exact: true },
  { href: '/admin/products', label: '📦 Produtos' },
  { href: '/admin/categories', label: '🏷️ Categorias' },
  { href: '/admin/orders', label: '🛍️ Pedidos' },
  { href: '/admin/customers', label: '👤 Clientes' },
  { href: '/admin/coupons', label: '🎟️ Cupons' },
  { href: '/admin/jobs', label: '⚙️ Filas' },
  { href: '/admin/settings', label: '🔧 Configurações' },
]

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r flex flex-col py-6 px-4 gap-1">
        <div className="font-bold text-lg mb-6 px-2">Valorem Lojas</div>
        {NAV.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href)
          return (
            <Link key={item.href} href={item.href}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition
                ${active ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
              {item.label}
            </Link>
          )
        })}
      </aside>

      {/* Conteúdo */}
      <main className="flex-1 p-8">{children}</main>
    </div>
  )
}
