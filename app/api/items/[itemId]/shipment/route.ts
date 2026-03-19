import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

type Params = Promise<{ itemId: string }>

// POST /api/items/[itemId]/shipment — 회차 추가
export async function POST(request: NextRequest, { params }: { params: Params }) {
  const { itemId } = await params
  const body = await request.json()

  const { data: seqData } = await supabaseAdmin
    .from('glassflow_shipment_logs')
    .select('seq')
    .eq('item_id', itemId)
    .order('seq', { ascending: false })
    .limit(1)
    .single()

  const nextSeq = (seqData?.seq ?? 0) + 1

  const { data, error } = await supabaseAdmin
    .from('glassflow_shipment_logs')
    .insert({
      item_id:      itemId,
      seq:          nextSeq,
      shipped_date: body.shipped_date ?? null,
      shipped_qty:  body.shipped_qty,
      note:         body.note ?? null,
      updated_by:   body.updated_by ?? null,
      updated_at:   new Date().toISOString(),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

// GET /api/items/[itemId]/shipment
export async function GET(_request: NextRequest, { params }: { params: Params }) {
  const { itemId } = await params

  const { data, error } = await supabaseAdmin
    .from('glassflow_shipment_logs')
    .select('*')
    .eq('item_id', itemId)
    .order('seq', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
