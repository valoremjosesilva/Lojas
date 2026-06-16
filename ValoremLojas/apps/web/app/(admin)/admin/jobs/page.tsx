'use client'

import { useEffect, useState, useCallback } from 'react'
import { api } from '../../../../lib/api'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

interface QueueCounts {
  waiting: number
  active: number
  completed: number
  failed: number
  delayed: number
  paused: number
}

interface OverviewData {
  queues: {
    email: QueueCounts
    search: QueueCounts
  }
}

interface FailedJob {
  id: string
  name: string
  failedReason: string
  attemptsMade: number
  timestamp: number
}

const QUEUE_LABELS: Record<string, string> = {
  email: 'E-mail',
  search: 'Indexação (Search)',
}

function QueueCard({ name, counts, onViewFailed }: { name: string; counts: QueueCounts; onViewFailed: () => void }) {
  const total = counts.waiting + counts.active + counts.failed + counts.delayed
  return (
    <div className="bg-white border rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">{QUEUE_LABELS[name] ?? name}</h3>
        {counts.failed > 0 && (
          <button onClick={onViewFailed}
            className="text-xs text-red-600 border border-red-200 px-2 py-1 rounded-lg hover:bg-red-50">
            Ver falhas ({counts.failed})
          </button>
        )}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Aguardando', value: counts.waiting, color: 'text-yellow-600 bg-yellow-50' },
          { label: 'Ativo', value: counts.active, color: 'text-blue-600 bg-blue-50' },
          { label: 'Concluído', value: counts.completed, color: 'text-green-600 bg-green-50' },
          { label: 'Falhou', value: counts.failed, color: 'text-red-600 bg-red-50' },
          { label: 'Agendado', value: counts.delayed, color: 'text-purple-600 bg-purple-50' },
          { label: 'Pausado', value: counts.paused, color: 'text-gray-600 bg-gray-50' },
        ].map((s) => (
          <div key={s.label} className={`rounded-lg px-3 py-2 ${s.color}`}>
            <div className="text-lg font-bold">{s.value}</div>
            <div className="text-xs opacity-75">{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function AdminJobsPage() {
  const [overview, setOverview] = useState<OverviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [failedQueue, setFailedQueue] = useState<string | null>(null)
  const [failedJobs, setFailedJobs] = useState<FailedJob[]>([])
  const [failedLoading, setFailedLoading] = useState(false)

  const load = useCallback(async () => {
    const token = localStorage.getItem('admin_token') ?? ''
    try {
      const data = await api.get<OverviewData>('/admin/jobs', { token })
      setOverview(data)
    } catch (e: any) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const token = localStorage.getItem('admin_token')
    if (!token) { window.location.href = '/admin/login'; return }
    load()
    const interval = setInterval(load, 5000)
    return () => clearInterval(interval)
  }, [load])

  async function viewFailed(queue: string) {
    const token = localStorage.getItem('admin_token') ?? ''
    setFailedQueue(queue)
    setFailedLoading(true)
    try {
      const jobs = await api.get<FailedJob[]>(`/admin/jobs/${queue}/failed`, { token })
      setFailedJobs(Array.isArray(jobs) ? jobs : [])
    } catch { setFailedJobs([]) }
    finally { setFailedLoading(false) }
  }

  async function retryJob(jobId: string) {
    if (!failedQueue) return
    const token = localStorage.getItem('admin_token') ?? ''
    try {
      await api.delete(`/admin/jobs/${failedQueue}/failed/${jobId}`, { token })
      await viewFailed(failedQueue)
      load()
    } catch (e: any) { alert(e.message) }
  }

  async function clearFailed(queue: string) {
    if (!confirm(`Limpar todos os jobs falhados da fila "${QUEUE_LABELS[queue]}"?`)) return
    const token = localStorage.getItem('admin_token') ?? ''
    try {
      await api.delete(`/admin/jobs/${queue}/failed`, { token })
      setFailedJobs([])
      load()
    } catch (e: any) { alert(e.message) }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Filas de Jobs</h1>
          <p className="text-sm text-gray-500 mt-1">Atualiza automaticamente a cada 5 segundos</p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`${API_URL}/bull-board`}
            target="_blank"
            rel="noopener noreferrer"
            className="border px-4 py-2 rounded-lg text-sm hover:bg-gray-50"
          >
            Abrir Bull Board ↗
          </a>
          <button onClick={load} className="border px-4 py-2 rounded-lg text-sm hover:bg-gray-50">
            Atualizar
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Carregando...</p>
      ) : !overview ? (
        <p className="text-red-500 text-sm">Erro ao carregar dados das filas.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          {Object.entries(overview.queues).map(([name, counts]) => (
            <QueueCard key={name} name={name} counts={counts} onViewFailed={() => viewFailed(name)} />
          ))}
        </div>
      )}

      {/* Painel de jobs falhados */}
      {failedQueue && (
        <div className="bg-white border rounded-xl">
          <div className="flex items-center justify-between p-4 border-b">
            <h2 className="font-semibold">
              Jobs falhados — {QUEUE_LABELS[failedQueue]}
            </h2>
            <div className="flex gap-2">
              {failedJobs.length > 0 && (
                <button onClick={() => clearFailed(failedQueue)}
                  className="text-xs border border-red-200 text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50">
                  Limpar todos
                </button>
              )}
              <button onClick={() => setFailedQueue(null)}
                className="text-xs border px-3 py-1.5 rounded-lg hover:bg-gray-50">
                Fechar
              </button>
            </div>
          </div>

          {failedLoading ? (
            <p className="p-4 text-sm text-gray-400">Carregando...</p>
          ) : failedJobs.length === 0 ? (
            <p className="p-4 text-sm text-gray-400">Nenhum job falhado.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['ID', 'Tipo', 'Motivo', 'Tentativas', 'Data', 'Ação'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {failedJobs.map((j) => (
                  <tr key={j.id} className="border-t">
                    <td className="px-4 py-3 font-mono text-xs text-gray-400">{j.id}</td>
                    <td className="px-4 py-3">
                      <span className="bg-gray-100 px-2 py-0.5 rounded text-xs font-mono">{j.name}</span>
                    </td>
                    <td className="px-4 py-3 text-red-600 text-xs max-w-xs truncate">{j.failedReason}</td>
                    <td className="px-4 py-3 text-center">{j.attemptsMade}</td>
                    <td className="px-4 py-3 text-xs text-gray-400">
                      {new Date(j.timestamp).toLocaleString('pt-BR')}
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => retryJob(j.id)}
                        className="text-xs text-blue-600 hover:underline">
                        Reprocessar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
