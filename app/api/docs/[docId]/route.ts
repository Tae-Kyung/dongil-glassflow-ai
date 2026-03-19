import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { embedText } from '@/lib/openai'
import type { ParsedPdfResult } from '@/types'

// PATCH /api/docs/[docId] — 미리보기 수정 후 저장 확정
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ docId: string }> }
) {
  const { docId } = await params
  const body: ParsedPdfResult = await request.json()

  try {
    // 현장명이 변경됐을 수 있으므로 임베딩 재생성
    const embedding = await embedText(body.site_name)

    const { error: docError } = await supabaseAdmin
      .from('glassflow_order_docs')
      .update({
        doc_no: body.doc_no,
        customer: body.customer,
        site_name: body.site_name,
        request_date: body.request_date,
        due_date: body.due_date,
        site_name_embedding: JSON.stringify(embedding),
        updated_at: new Date().toISOString(),
      })
      .eq('id', docId)

    if (docError) {
      return NextResponse.json({ error: docError.message }, { status: 500 })
    }

    // 품목 교체
    await supabaseAdmin.from('glassflow_order_items').delete().eq('doc_id', docId)

    if (body.items.length > 0) {
      const { error: itemsError } = await supabaseAdmin
        .from('glassflow_order_items')
        .insert(
          body.items.map((item) => ({
            doc_id: docId,
            item_no: item.item_no,
            item_name: item.item_name,
            width_mm: item.width_mm,
            height_mm: item.height_mm,
            order_qty: item.order_qty,
            area_m2: item.area_m2,
            location: item.location,
          }))
        )

      if (itemsError) {
        return NextResponse.json({ error: itemsError.message }, { status: 500 })
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('PATCH /api/docs/[docId] error:', err)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
