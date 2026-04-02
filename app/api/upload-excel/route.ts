import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { parseWorksheet } from '@/lib/excel-parser'

const SHEET_NAME = '발주현황'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) {
      return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 })
    }

    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!ext || !['xlsx', 'xls'].includes(ext)) {
      return NextResponse.json({ error: '.xlsx 또는 .xls 파일만 업로드 가능합니다.' }, { status: 400 })
    }

    // 파일 파싱
    const buffer = Buffer.from(await file.arrayBuffer())
    const wb = XLSX.read(buffer, { raw: false })
    const ws = wb.Sheets[SHEET_NAME]
    if (!ws) {
      return NextResponse.json(
        { error: `'${SHEET_NAME}' 시트를 찾을 수 없습니다. 올바른 발주현황 파일인지 확인해주세요.` },
        { status: 400 }
      )
    }

    const rows = parseWorksheet(ws)
    if (rows.length === 0) {
      return NextResponse.json({ error: '처리할 데이터가 없습니다.' }, { status: 400 })
    }

    // DB 저장
    let inserted = 0, updated = 0, errors = 0

    for (const row of rows) {
      try {
        // 1. order_docs upsert
        const { data: docData, error: docErr } = await supabaseAdmin
          .from('glassflow_order_docs')
          .upsert(
            {
              doc_no: row.doc_no,
              customer: row.customer,
              site_name: row.site_name,
              request_date: row.request_date,
              due_date: row.due_date,
              tps_date: row.tps_date,
              arrival_date: row.arrival_date,
              source: 'excel',
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'doc_no' }
          )
          .select('id, created_at, updated_at')
          .single()

        if (docErr || !docData) { errors++; continue }

        const docId = docData.id
        const isNewDoc = docData.created_at === docData.updated_at

        // 2. order_items upsert (doc_id + excel_row 복합키)
        const { data: itemData, error: itemErr } = await supabaseAdmin
          .from('glassflow_order_items')
          .upsert(
            {
              doc_id: docId,
              excel_row: row.excel_row,
              item_name: row.item_name,
              note: row.note,
              order_qty: row.order_qty || null,
              area_m2: row.area_m2,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'doc_id,excel_row' }
          )
          .select('id')
          .single()

        if (itemErr || !itemData) { errors++; continue }

        const itemId = itemData.id

        // 3. production_logs — 기존 삭제 후 재삽입
        if (row.prod_logs.length > 0) {
          await supabaseAdmin.from('glassflow_production_logs').delete().eq('item_id', itemId)
          const valid = row.prod_logs.filter(l => l.qty !== null)
          if (valid.length > 0) {
            await supabaseAdmin.from('glassflow_production_logs').insert(
              valid.map(l => ({
                item_id: itemId,
                seq: l.seq,
                produced_date: l.date,
                produced_qty: l.qty!,
                is_completed: l.is_completed,
                note: l.note,
                updated_at: new Date().toISOString(),
              }))
            )
          }
        }

        // 4. shipment_logs — 기존 삭제 후 재삽입
        if (row.ship_logs.length > 0) {
          await supabaseAdmin.from('glassflow_shipment_logs').delete().eq('item_id', itemId)
          const valid = row.ship_logs.filter(l => l.qty !== null)
          if (valid.length > 0) {
            await supabaseAdmin.from('glassflow_shipment_logs').insert(
              valid.map(l => ({
                item_id: itemId,
                seq: l.seq,
                shipped_date: l.date,
                shipped_qty: l.qty!,
                note: l.note,
                updated_at: new Date().toISOString(),
              }))
            )
          }
        }

        isNewDoc ? inserted++ : updated++
      } catch {
        errors++
      }
    }

    return NextResponse.json({
      success: true,
      total: rows.length,
      inserted,
      updated,
      errors,
    })
  } catch (e) {
    console.error('[upload-excel]', e)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
