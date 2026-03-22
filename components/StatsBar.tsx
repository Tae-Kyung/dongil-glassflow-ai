'use client'

import { useEffect, useState } from 'react'

interface Stats {
  status_counts: {
    pending: number
    in_progress: number
    produced: number
    partial: number
    shipped: number
  }
  overdue: number
  due_this_week: number
  this_month_count: number
  this_month_done_count: number
  this_month_order_qty: number
  this_month_produced_qty: number
}

export function StatsBar() {
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => {
    fetch('/api/stats').then((r) => r.json()).then(setStats)
  }, [])

  if (!stats) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border p-4 animate-pulse h-24" />
        ))}
      </div>
    )
  }

  const { status_counts: sc } = stats
  const totalActive = sc.pending + sc.in_progress + sc.produced + sc.partial
  const productionRate = stats.this_month_order_qty > 0
    ? Math.round((stats.this_month_produced_qty / stats.this_month_order_qty) * 100)
    : 0

  return (
    <div className="space-y-3 mb-6">
      {/* 액션 지표 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* 납기 초과 */}
        <div className={`rounded-xl border p-4 ${stats.overdue > 0 ? 'bg-red-50 border-red-200' : 'bg-white'}`}>
          <p className="text-xs font-medium text-gray-500 mb-1">납기 초과</p>
          <p className={`text-2xl font-bold ${stats.overdue > 0 ? 'text-red-600' : 'text-gray-400'}`}>
            {stats.overdue.toLocaleString()}건
          </p>
          <p className="text-xs text-gray-400 mt-1">미출고 기준</p>
        </div>

        {/* 이번주 납기 */}
        <div className={`rounded-xl border p-4 ${stats.due_this_week > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white'}`}>
          <p className="text-xs font-medium text-gray-500 mb-1">이번주 납기</p>
          <p className={`text-2xl font-bold ${stats.due_this_week > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
            {stats.due_this_week.toLocaleString()}건
          </p>
          <p className="text-xs text-gray-400 mt-1">7일 이내 미출고</p>
        </div>

        {/* 이번달 납기 */}
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs font-medium text-gray-500 mb-1">이번달 납기</p>
          <p className="text-2xl font-bold text-blue-600">
            {stats.this_month_count.toLocaleString()}건
          </p>
          <p className="text-xs text-gray-400 mt-1">완료 {stats.this_month_done_count}건</p>
        </div>

        {/* 이번달 생산 완료율 */}
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs font-medium text-gray-500 mb-1">이번달 생산 완료율</p>
          <p className="text-2xl font-bold text-gray-800">{productionRate}%</p>
          <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all"
              style={{ width: `${productionRate}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-1">
            {stats.this_month_produced_qty.toLocaleString()} / {stats.this_month_order_qty.toLocaleString()}매
          </p>
        </div>
      </div>

      {/* 전체 파이프라인 상태 */}
      <div className="bg-white rounded-xl border px-5 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
        <span className="text-xs font-medium text-gray-400">전체 파이프라인</span>
        <PipelineItem label="생산대기" count={sc.pending}     color="text-gray-500"   dot="bg-gray-300" />
        <PipelineItem label="생산중"   count={sc.in_progress} color="text-blue-600"   dot="bg-blue-400" />
        <PipelineItem label="생산완료" count={sc.produced}    color="text-indigo-600" dot="bg-indigo-400" />
        <PipelineItem label="일부출고" count={sc.partial}     color="text-amber-600"  dot="bg-amber-400" />
        <PipelineItem label="출고완료" count={sc.shipped}     color="text-green-600"  dot="bg-green-400" />
        <span className="ml-auto text-xs text-gray-400">진행중 합계 {totalActive.toLocaleString()}건</span>
      </div>
    </div>
  )
}

function PipelineItem({ label, count, color, dot }: {
  label: string; count: number; color: string; dot: string
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full ${dot}`} />
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`text-sm font-semibold ${color}`}>{count.toLocaleString()}</span>
    </div>
  )
}
