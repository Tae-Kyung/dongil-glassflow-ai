import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

type Params = Promise<{ itemId: string }>

// POST /api/items/[itemId]/production — 회차 추가
export async function POST(request: NextRequest, { params }: { params: Params }) {
  const { itemId } = await params
  const body = await request.json()

  // 현재 max(seq) 조회 후 +1
  const { data: seqData } = await supabaseAdmin
    .from('glassflow_production_logs')
    .select('seq')
    .eq('item_id', itemId)
    .order('seq', { ascending: false })
    .limit(1)
    .single()

  const nextSeq = (seqData?.seq ?? 0) + 1

  const { data, error } = await supabaseAdmin
    .from('glassflow_production_logs')
    .insert({
      item_id:       itemId,
      seq:           nextSeq,
      produced_date: body.produced_date ?? null,
      produced_qty:  body.produced_qty,
      is_completed:  body.is_completed ?? false,
      note:          body.note ?? null,
      updated_by:    body.updated_by ?? null,
      updated_at:    new Date().toISOString(),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

// GET /api/items/[itemId]/production — 회차 목록 조회
export async function GET(_request: NextRequest, { params }: { params: Params }) {
  const { itemId } = await params

  const { data, error } = await supabaseAdmin
    .from('glassflow_production_logs')
    .select('*')
    .eq('item_id', itemId)
    .order('seq', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
