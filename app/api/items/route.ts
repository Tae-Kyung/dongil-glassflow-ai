import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

// GET /api/items?site_name=&customer=&status=&date_from=&date_to=&include_past=
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const site_name  = searchParams.get('site_name')
  const customer   = searchParams.get('customer')
  const status     = searchParams.get('status')
  const date_from  = searchParams.get('date_from')
  const date_to    = searchParams.get('date_to')
  const include_past = searchParams.get('include_past') === 'true'

  let query = supabaseAdmin
    .from('glassflow_item_status')
    .select('*')
    .order('due_date', { ascending: true })
    .limit(500)

  if (!include_past && !date_from) {
    const today = new Date().toISOString().slice(0, 10)
    query = query.or(`due_date.gte.${today},due_date.is.null`)
  }
  if (date_from) query = query.gte('due_date', date_from)
  if (date_to)   query = query.lte('due_date', date_to)
  if (site_name) query = query.ilike('site_name', `%${site_name}%`)
  if (customer)  query = query.ilike('customer', `%${customer}%`)
  if (status)    query = query.eq('status', status)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
