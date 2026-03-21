import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

type Params = Promise<{ itemId: string; seq: string }>

// PATCH /api/items/[itemId]/shipment/[seq]
export async function PATCH(request: NextRequest, { params }: { params: Params }) {
  const { itemId, seq } = await params
  const body = await request.json()

  const { data, error } = await supabaseAdmin
    .from('glassflow_shipment_logs')
    .update({
      shipped_date: body.shipped_date ?? null,
      shipped_qty:  body.shipped_qty,
      note:         body.note ?? null,
      updated_by:   body.updated_by ?? null,
      updated_at:   new Date().toISOString(),
    })
    .eq('item_id', itemId)
    .eq('seq', Number(seq))
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE /api/items/[itemId]/shipment/[seq]
export async function DELETE(_request: NextRequest, { params }: { params: Params }) {
  const { itemId, seq } = await params

  const { error } = await supabaseAdmin
    .from('glassflow_shipment_logs')
    .delete()
    .eq('item_id', itemId)
    .eq('seq', Number(seq))

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
