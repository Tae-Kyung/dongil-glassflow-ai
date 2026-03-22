'use client'

import { useEffect, useState } from 'react'
import type { RiskItem } from '@/app/api/risk/route'

interface RiskData {
  items: RiskItem[]
  summary: { critical: number; danger: number; warning: number }
}

const RISK_CONFIG = {
  critical: { label: '긴급',  bg: 'bg-red-50',    border: 'border-red-200',   text: 'text-red-700',    badge: 'bg-red-100 text-red-700',    dot: 'bg-red-500' },
  danger:   { label: '위험',  bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', badge: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500' },
  warning:  { label: '주의',  bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700', badge: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-400' },
}

const STATUS_LABEL: Record<string, string> = {
  pending: '생산대기', in_progress: '생산중', produced: '생산완료', partial: '일부출고',
}

export function RiskRadar() {
  const [data, setData] = useState<RiskData | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'critical' | 'danger' | 'warning'>('all')

  useEffect(() => {
    fetch('/api/risk').then(r => r.json()).then(d => { setData(d); setLoading(false) })
  }, [])

  const total = (data?.summary.critical ?? 0) + (data?.summary.danger ?? 0) + (data?.summary.warning ?? 0)
  const filtered = data?.items.filter(i => filter === 'all' || i.risk === filter) ?? []

  if (loading) {
    return <div className="bg-white rounded-xl border p-6 h-64 animate-pulse" />
  }

  return (
    <div className="bg-white rounded-xl border">
      {/* 헤더 */}
      <div className="px-6 py-4 border-b flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-800">납기 위험 레이더</h3>
          <p className="text-xs text-gray-400 mt-0.5">납기 7일 이내 미출고 품목 · 올해 기준</p>
        </div>
        {total > 0 && (
          <span className="text-sm font-semibold text-gray-500">총 {total}건</span>
        )}
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-3 gap-4 p-4 border-b">
        {(['critical', 'danger', 'warning'] as const).map((level) => {
          const cfg = RISK_CONFIG[level]
          const count = data?.summary[level] ?? 0
          const active = filter === level
          return (
            <button
              key={level}
              onClick={() => setFilter(active ? 'all' : level)}
              className={`rounded-lg border p-3 text-left transition-all ${cfg.bg} ${cfg.border} ${active ? 'ring-2 ring-offset-1 ring-gray-400' : 'hover:opacity-80'}`}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                <span className={`text-xs font-medium ${cfg.text}`}>{cfg.label}</span>
              </div>
              <p className={`text-2xl font-bold ${cfg.text}`}>{count}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {level === 'critical' ? '납기 지남·생산전 / 3일내 생산대기' :
                 level === 'danger'   ? '납기 지남·생산중 / 3일내 미완료' :
                                       '4~7일 이내 미출고'}
              </p>
            </button>
          )
        })}
      </div>

      {/* 목록 */}
      {total === 0 ? (
        <div className="px-6 py-12 text-center text-gray-400 text-sm">
          위험 품목이 없습니다 ✓
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-2.5 text-gray-500 font-medium text-xs w-8"></th>
                <th className="text-left px-4 py-2.5 text-gray-500 font-medium text-xs">의뢰번호</th>
                <th className="text-left px-4 py-2.5 text-gray-500 font-medium text-xs">현장명</th>
                <th className="text-left px-4 py-2.5 text-gray-500 font-medium text-xs">품명</th>
                <th className="text-right px-4 py-2.5 text-gray-500 font-medium text-xs">수량</th>
                <th className="text-center px-4 py-2.5 text-gray-500 font-medium text-xs">상태</th>
                <th className="text-center px-4 py-2.5 text-gray-500 font-medium text-xs">납기일</th>
                <th className="text-center px-4 py-2.5 text-gray-500 font-medium text-xs">D-day</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const cfg = RISK_CONFIG[item.risk]
                const dday = item.days_left === 0 ? 'D-day' :
                             item.days_left > 0   ? `D-${item.days_left}` :
                                                    `D+${Math.abs(item.days_left)}`
                return (
                  <tr key={item.id} className="border-t hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span className={`inline-block w-2 h-2 rounded-full ${cfg.dot}`} />
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{item.doc_no}</td>
                    <td className="px-4 py-3 max-w-[160px] truncate font-medium text-gray-800" title={item.site_name}>
                      {item.site_name}
                    </td>
                    <td className="px-4 py-3 max-w-[180px] truncate text-gray-600 text-xs" title={item.item_name ?? ''}>
                      {item.item_name ?? '-'}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">{item.order_qty}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.badge}`}>
                        {STATUS_LABEL[item.status] ?? item.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-gray-600 whitespace-nowrap">{item.due_date}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs font-bold ${cfg.text}`}>{dday}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
