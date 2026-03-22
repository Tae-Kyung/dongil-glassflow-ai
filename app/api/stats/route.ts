import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET() {
  const today = new Date().toISOString().slice(0, 10)
  const weekLater = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const monthStart = today.slice(0, 8) + '01'
  const monthEnd = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0)
    .toISOString().slice(0, 10)

  const [
    pendingRes, inProgressRes, producedRes, partialRes, shippedRes,
    overdueRes, dueThisWeekRes, dueThisMonthRes,
  ] = await Promise.all([
    supabaseAdmin.from('glassflow_item_status').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabaseAdmin.from('glassflow_item_status').select('*', { count: 'exact', head: true }).eq('status', 'in_progress'),
    supabaseAdmin.from('glassflow_item_status').select('*', { count: 'exact', head: true }).eq('status', 'produced'),
    supabaseAdmin.from('glassflow_item_status').select('*', { count: 'exact', head: true }).eq('status', 'partial'),
    supabaseAdmin.from('glassflow_item_status').select('*', { count: 'exact', head: true }).eq('status', 'shipped'),
    // 납기 초과: 납기일 < 오늘 & 미출고
    supabaseAdmin.from('glassflow_item_status').select('*', { count: 'exact', head: true })
      .lt('due_date', today).not('status', 'eq', 'shipped'),
    // 이번주 납기: 오늘 ~ 7일 후 & 미출고
    supabaseAdmin.from('glassflow_item_status').select('*', { count: 'exact', head: true })
      .gte('due_date', today).lte('due_date', weekLater).not('status', 'eq', 'shipped'),
    // 이번달 납기: 수량 집계용
    supabaseAdmin.from('glassflow_item_status').select('order_qty, total_produced_qty, status')
      .gte('due_date', monthStart).lte('due_date', monthEnd),
  ])

  // 이번달 수량 집계
  const thisMonthItems = dueThisMonthRes.data ?? []
  const thisMonthOrderQty    = thisMonthItems.reduce((s, i) => s + (i.order_qty ?? 0), 0)
  const thisMonthProducedQty = thisMonthItems.reduce((s, i) => s + (i.total_produced_qty ?? 0), 0)
  const thisMonthCount       = thisMonthItems.length
  const thisMonthDoneCount   = thisMonthItems.filter((i) =>
    i.status === 'produced' || i.status === 'partial' || i.status === 'shipped'
  ).length

  return NextResponse.json({
    status_counts: {
      pending:     pendingRes.count ?? 0,
      in_progress: inProgressRes.count ?? 0,
      produced:    producedRes.count ?? 0,
      partial:     partialRes.count ?? 0,
      shipped:     shippedRes.count ?? 0,
    },
    overdue:               overdueRes.count ?? 0,
    due_this_week:         dueThisWeekRes.count ?? 0,
    this_month_count:      thisMonthCount,
    this_month_done_count: thisMonthDoneCount,
    this_month_order_qty:  thisMonthOrderQty,
    this_month_produced_qty: thisMonthProducedQty,
  })
}
