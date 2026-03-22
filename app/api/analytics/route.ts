import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET() {
  const today = new Date().toISOString().slice(0, 10)

  // 최근 12개월 범위 (이번달 말까지)
  const from12m = new Date()
  from12m.setMonth(from12m.getMonth() - 11)
  from12m.setDate(1)
  const rangeStart = from12m.toISOString().slice(0, 10)
  const rangeEnd = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0)
    .toISOString().slice(0, 10)

  // 납기일이 있는 품목 전체 조회 (최근 12개월, 이번달 말까지)
  let all: any[] = []
  let offset = 0
  while (true) {
    const { data, error } = await supabaseAdmin
      .from('glassflow_item_status')
      .select('due_date, order_qty, area_m2, status, total_produced_qty, total_shipped_qty')
      .gte('due_date', rangeStart)
      .lte('due_date', rangeEnd)
      .not('due_date', 'is', null)
      .range(offset, offset + 999)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data?.length) break
    all = all.concat(data)
    if (data.length < 1000) break
    offset += 1000
  }

  // 월별 집계
  const monthMap: Record<string, {
    month: string
    total: number
    shipped: number
    order_qty: number
    area_m2: number
    produced_qty: number
    shipped_qty: number
  }> = {}

  for (const item of all) {
    const month = item.due_date.slice(0, 7) // "2025-03"
    if (!monthMap[month]) {
      monthMap[month] = { month, total: 0, shipped: 0, order_qty: 0, area_m2: 0, produced_qty: 0, shipped_qty: 0 }
    }
    const m = monthMap[month]
    m.total += 1
    if (item.status === 'shipped') m.shipped += 1
    m.order_qty     += item.order_qty ?? 0
    m.area_m2       += item.area_m2 ?? 0
    m.produced_qty  += item.total_produced_qty ?? 0
    m.shipped_qty   += item.total_shipped_qty ?? 0
  }

  // 월 정렬 후 납기준수율 계산
  const monthly = Object.values(monthMap)
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((m) => {
      const isPast = m.month < today.slice(0, 7)
      return {
        ...m,
        area_m2: Math.round(m.area_m2 * 10) / 10,
        // 완료된 달만 준수율 계산, 이번달은 진행중
        compliance_rate: isPast && m.total > 0
          ? Math.round((m.shipped / m.total) * 1000) / 10
          : null,
      }
    })

  // 연간 요약
  const yearStart = `${new Date().getFullYear()}-01-01`
  const thisYearItems = all.filter(i => i.due_date >= yearStart)
  const pastThisYear  = thisYearItems.filter(i => i.due_date < today)
  const ytdCompliance = pastThisYear.length > 0
    ? Math.round((pastThisYear.filter(i => i.status === 'shipped').length / pastThisYear.length) * 1000) / 10
    : null

  return NextResponse.json({ monthly, ytd_compliance: ytdCompliance })
}
