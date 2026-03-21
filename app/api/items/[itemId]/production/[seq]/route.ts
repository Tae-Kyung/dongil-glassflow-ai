import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

type Params = Promise<{ itemId: string; seq: string }>

// PATCH /api/items/[itemId]/production/[seq]
export async function PATCH(request: NextRequest, { params }: { params: Params }) {
  const { itemId, seq } = await params
  const body = await request.json()

  const { data, error } = await supabaseAdmin
    .from('glassflow_production_logs')
    .update({
      produced_date: body.produced_date ?? null,
      produced_qty:  body.produced_qty,
      is_completed:  body.is_completed ?? false,
      note:          body.note ?? null,
      updated_by:    body.updated_by ?? null,
      updated_at:    new Date().toISOString(),
    })
    .eq('item_id', itemId)
    .eq('seq', Number(seq))
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE /api/items/[itemId]/production/[seq]
export async function DELETE(_request: NextRequest, { params }: { params: Params }) {
  const { itemId, seq } = await params

  const { error } = await supabaseAdmin
    .from('glassflow_production_logs')
    .delete()
    .eq('item_id', itemId)
    .eq('seq', Number(seq))

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
