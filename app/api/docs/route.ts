import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { embedText } from '@/lib/openai'
import type { ParsedPdfResult } from '@/types'

// POST /api/docs — 직접 입력으로 신규 발주서 생성
export async function POST(request: NextRequest) {
  const body: ParsedPdfResult = await request.json()

  if (!body.doc_no?.trim()) {
    return NextResponse.json({ error: '의뢰번호는 필수입니다.' }, { status: 400 })
  }
  if (!body.site_name?.trim()) {
    return NextResponse.json({ error: '현장명은 필수입니다.' }, { status: 400 })
  }

  try {
    const embedding = await embedText(body.site_name)

    const { data: doc, error: docError } = await supabaseAdmin
      .from('glassflow_order_docs')
      .insert({
        doc_no: body.doc_no.trim(),
        customer: body.customer ?? null,
        site_name: body.site_name.trim(),
        request_date: body.request_date ?? null,
        due_date: body.due_date ?? null,
        source: 'manual',
        site_name_embedding: JSON.stringify(embedding),
      })
      .select('id')
      .single()

    if (docError) {
      const msg = docError.code === '23505'
        ? `의뢰번호 "${body.doc_no}"가 이미 존재합니다.`
        : docError.message
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    if (body.items.length > 0) {
      const { error: itemsError } = await supabaseAdmin
        .from('glassflow_order_items')
        .insert(
          body.items.map((item) => ({
            doc_id: doc.id,
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

    return NextResponse.json({ success: true, doc_id: doc.id })
  } catch (err) {
    console.error('POST /api/docs error:', err)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
