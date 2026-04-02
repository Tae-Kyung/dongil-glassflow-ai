import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

// GET /api/items?site_name=&customer=&status=&keyword=&date_from=&date_to=&include_past=&overdue=&page=&page_size=
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const site_name    = searchParams.get('site_name')
  const customer     = searchParams.get('customer')
  const status       = searchParams.get('status')
  const keyword      = searchParams.get('keyword')   // item_name, note 통합 검색
  const date_from    = searchParams.get('date_from')
  const date_to      = searchParams.get('date_to')
  const include_past = searchParams.get('include_past') === 'true'
  const overdue      = searchParams.get('overdue') === 'true'
  const page         = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const page_size    = Math.min(200, Math.max(10, parseInt(searchParams.get('page_size') ?? '50', 10)))

  const today     = new Date().toISOString().slice(0, 10)
  const yearStart = `${new Date().getFullYear()}-01-01`
  const from = (page - 1) * page_size
  const to   = from + page_size - 1

  let query = supabaseAdmin
    .from('glassflow_item_status')
    .select('*', { count: 'exact' })
    .order('due_date', { ascending: true })
    .range(from, to)

  if (overdue) {
    query = query.gte('due_date', yearStart).lt('due_date', today).neq('status', 'shipped')
  } else {
    if (!include_past && !date_from) {
      query = query.gte('due_date', today)
    }
    if (date_from) query = query.gte('due_date', date_from)
    if (date_to)   query = query.lte('due_date', date_to)
  }

  if (site_name) query = query.ilike('site_name', `%${site_name}%`)
  if (customer)  query = query.ilike('customer', `%${customer}%`)
  if (status)    query = query.eq('status', status)

  // 비고/품명 통합 키워드 검색 (item_name OR note)
  if (keyword) {
    query = query.or(`item_name.ilike.%${keyword}%,note.ilike.%${keyword}%`)
  }

  const { data, count, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data, total: count ?? 0, page, page_size })
}
