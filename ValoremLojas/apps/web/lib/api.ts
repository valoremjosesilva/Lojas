/**
 * Cliente HTTP centralizado para comunicação com a API NestJS
 * Injeta automaticamente o header x-tenant (subdomínio)
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

type FetchOptions = RequestInit & {
  tenant?: string
  token?: string
}

export async function apiClient<T = any>(
  path: string,
  options: FetchOptions = {},
): Promise<T> {
  const { tenant, token, ...fetchOptions } = options

  const headers = new Headers(fetchOptions.headers)
  headers.set('Content-Type', 'application/json')

  if (tenant) headers.set('x-tenant', tenant)
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(`${API_URL}${path}`, {
    ...fetchOptions,
    headers,
  })

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error(error.message || 'Erro na requisição')
  }

  if (res.status === 204 || res.headers.get('content-length') === '0') {
    return null as T
  }

  return res.json()
}

// Helpers
export const api = {
  get: <T = any>(path: string, opts?: FetchOptions) =>
    apiClient<T>(path, { ...opts, method: 'GET' }),

  post: <T = any>(path: string, body: any, opts?: FetchOptions) =>
    apiClient<T>(path, { ...opts, method: 'POST', body: JSON.stringify(body) }),

  put: <T = any>(path: string, body: any, opts?: FetchOptions) =>
    apiClient<T>(path, { ...opts, method: 'PUT', body: JSON.stringify(body) }),

  patch: <T = any>(path: string, body: any, opts?: FetchOptions) =>
    apiClient<T>(path, { ...opts, method: 'PATCH', body: JSON.stringify(body) }),

  delete: <T = any>(path: string, opts?: FetchOptions) =>
    apiClient<T>(path, { ...opts, method: 'DELETE' }),
}
