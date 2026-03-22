import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export type RiskLevel = 'critical' | 'danger' | 'warning'

export interface RiskItem {
  id: string
  doc_no: string
  site_name: string
  customer: string | null
  item_name: string | null
  order_qty: number
  total_produced_qty: number
  due_date: string
  status: string
  days_left: number   // 음수면 초과
  risk: RiskLevel
}

export async function GET() {
  const now = new Date()
  const today     = now.toISOString().slice(0, 10)
  const in7days   = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const yearStart = `${now.getFullYear()}-01-01`

  // 납기 7일 이내(또는 초과) & 미출고 & 올해 데이터 (전체 조회)
  let all: any[] = []
  let offset = 0
  while (true) {
    const { data, error } = await supabaseAdmin
      .from('glassflow_item_status')
      .select('id, doc_no, site_name, customer, item_name, order_qty, total_produced_qty, due_date, status')
      .gte('due_date', yearStart)
      .lte('due_date', in7days)
      .not('status', 'eq', 'shipped')
      .not('due_date', 'is', null)
      .order('due_date', { ascending: true })
      .range(offset, offset + 999)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data?.length) break
    all = all.concat(data)
    if (data.length < 1000) break
    offset += 1000
  }

  const items: RiskItem[] = all.map((item) => {
    const due    = new Date(item.due_date)
    const todayD = new Date(today)
    const msPerDay = 24 * 60 * 60 * 1000
    const days_left = Math.round((due.getTime() - todayD.getTime()) / msPerDay)

    let risk: RiskLevel
    if (days_left < 0 && item.status === 'pending') {
      risk = 'critical'  // 납기 지남 + 생산도 안 됨
    } else if (days_left < 0) {
      risk = 'danger'    // 납기 지남 + 생산중/생산완료/일부출고
    } else if (days_left <= 3 && item.status === 'pending') {
      risk = 'critical'  // 3일 이내 + 생산대기
    } else if (days_left <= 3) {
      risk = 'danger'    // 3일 이내 + 생산중
    } else {
      risk = 'warning'   // 4~7일 이내
    }

    return { ...item, days_left, risk }
  })

  const summary = {
    critical: items.filter(i => i.risk === 'critical').length,
    danger:   items.filter(i => i.risk === 'danger').length,
    warning:  items.filter(i => i.risk === 'warning').length,
  }

  return NextResponse.json({ items, summary })
}
