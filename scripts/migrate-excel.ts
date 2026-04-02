/**
 * 발주현황.xlsx → Supabase DB 마이그레이션 스크립트
 *
 * 사용법:
 *   npx tsx scripts/migrate-excel.ts --dry-run                    # 드라이런
 *   npx tsx scripts/migrate-excel.ts --run                        # 전체 저장
 *   npx tsx scripts/migrate-excel.ts --run --limit=100            # 처음 100행만
 *   npx tsx scripts/migrate-excel.ts --run --from=3178            # 특정 행부터
 *   npx tsx scripts/migrate-excel.ts --run --doc-no=25-3020       # 특정 의뢰번호만
 *   npx tsx scripts/migrate-excel.ts --run --years=24,25,26       # 특정 연도만
 *
 * 최적화 전략:
 *   - CHUNK_SIZE 단위로 묶어 배치 처리
 *   - order_docs → order_items → logs 순으로 각 단계를 bulk upsert/insert
 *   - 행당 4~6회 순차 호출 → 청크당 6회 호출로 ~100배 감소
 */

import * as XLSX from 'xlsx'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { parseWorksheet, type ParsedExcelRow } from '../lib/excel-parser'

dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

const EXCEL_PATH  = path.resolve(__dirname, '../docs/발주서.xlsx')
const SHEET_NAME  = '발주현황'
const CHUNK_SIZE  = 100  // 배치 크기

// ── 유틸 ─────────────────────────────────────────────────────
function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size))
  return chunks
}

function printProgress(done: number, total: number, inserted: number, updated: number, errCount: number) {
  const pct    = total > 0 ? Math.floor((done / total) * 100) : 0
  const filled = Math.floor(pct / 2)
  const bar    = '█'.repeat(filled) + '░'.repeat(50 - filled)
  process.stdout.write(
    `\r[${bar}] ${pct}%  ${done}/${total}  신규:${inserted} 갱신:${updated} 오류:${errCount}`
  )
}

// ── 메인 ─────────────────────────────────────────────────────
async function main() {
  const args        = process.argv.slice(2)
  const isDryRun    = !args.includes('--run')
  const limitArg    = args.find(a => a.startsWith('--limit='))
  const fromArg     = args.find(a => a.startsWith('--from='))
  const docNoArg    = args.find(a => a.startsWith('--doc-no='))
  const yearsArg    = args.find(a => a.startsWith('--years='))
  const limit       = limitArg ? Number(limitArg.split('=')[1]) : Infinity
  const fromRow     = fromArg  ? Number(fromArg.split('=')[1]) - 1 : 1
  const filterDocNo = docNoArg ? docNoArg.split('=')[1] : null
  const filterYears = yearsArg ? yearsArg.split('=')[1].split(',').map(y => y.trim()) : null

  console.log(`\n=== GlassFlow Excel Migration ===`)
  console.log(`모드: ${isDryRun ? 'DRY-RUN (저장 없음)' : '실제 저장 (배치 처리)'}`)
  console.log(`파일: ${EXCEL_PATH}`)
  if (filterDocNo) console.log(`필터: 의뢰번호 = ${filterDocNo}`)
  if (filterYears) console.log(`필터: 연도 = ${filterYears.join(', ')}년`)
  console.log()

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Excel 파싱
  const wb = XLSX.readFile(EXCEL_PATH)
  const ws = wb.Sheets[SHEET_NAME]
  if (!ws) throw new Error(`시트 '${SHEET_NAME}'를 찾을 수 없습니다.`)

  let rows = parseWorksheet(ws, fromRow)

  if (filterDocNo) rows = rows.filter(r => r.doc_no === filterDocNo)
  if (filterYears) rows = rows.filter(r => {
    const y = r.doc_no.match(/^(\d{2})-/)?.[1]
    return y ? filterYears.includes(y) : false
  })
  if (limit !== Infinity) rows = rows.slice(0, limit)

  const total = rows.length
  console.log(`처리 대상: ${total}행 (청크 크기: ${CHUNK_SIZE})\n`)

  if (isDryRun) {
    rows.slice(0, 20).forEach(r =>
      console.log(`[DRY] row ${r.excel_row} | ${r.doc_no} | ${r.site_name} | qty:${r.order_qty} | prod:${r.prod_logs.length} | ship:${r.ship_logs.length}`)
    )
    if (rows.length > 20) console.log(`  ... 외 ${rows.length - 20}행`)
    return
  }

  let inserted = 0, updated = 0
  const errors: Array<{ row: number; reason: string }> = []
  let done = 0

  for (const chunkRows of chunk(rows, CHUNK_SIZE)) {
    // ── STEP 1: order_docs 배치 upsert ──────────────────────
    // 같은 청크 내 동일 doc_no 중복 제거 (마지막 행 우선)
    const docMap = new Map<string, ParsedExcelRow>()
    for (const r of chunkRows) docMap.set(r.doc_no, r)
    const uniqueDocs = [...docMap.values()]

    const { data: docResults, error: docErr } = await supabase
      .from('glassflow_order_docs')
      .upsert(
        uniqueDocs.map(r => ({
          doc_no:       r.doc_no,
          customer:     r.customer,
          site_name:    r.site_name,
          request_date: r.request_date,
          due_date:     r.due_date,
          tps_date:     r.tps_date,
          arrival_date: r.arrival_date,
          source:       'excel',
          updated_at:   new Date().toISOString(),
        })),
        { onConflict: 'doc_no' }
      )
      .select('id, doc_no, created_at, updated_at')

    if (docErr || !docResults) {
      chunkRows.forEach(r => errors.push({ row: r.excel_row, reason: `order_docs: ${docErr?.message}` }))
      done += chunkRows.length
      printProgress(done, total, inserted, updated, errors.length)
      continue
    }

    // doc_no → { id, isNew } 매핑
    const docIdMap = new Map(
      docResults.map(d => [d.doc_no, { id: d.id, isNew: d.created_at === d.updated_at }])
    )

    // ── STEP 2: order_items 배치 upsert ─────────────────────
    const validRows = chunkRows.filter(r => docIdMap.has(r.doc_no))
    const itemPayload = validRows.map(r => ({
      doc_id:     docIdMap.get(r.doc_no)!.id,
      excel_row:  r.excel_row,
      item_name:  r.item_name,
      note:       r.note,
      order_qty:  r.order_qty || null,
      area_m2:    r.area_m2,
      updated_at: new Date().toISOString(),
    }))

    const { data: itemResults, error: itemErr } = await supabase
      .from('glassflow_order_items')
      .upsert(itemPayload, { onConflict: 'doc_id,excel_row' })
      .select('id, doc_id, excel_row')

    if (itemErr || !itemResults) {
      validRows.forEach(r => errors.push({ row: r.excel_row, reason: `order_items: ${itemErr?.message}` }))
      done += chunkRows.length
      printProgress(done, total, inserted, updated, errors.length)
      continue
    }

    // (doc_id, excel_row) → item_id 매핑
    const itemIdMap = new Map(
      itemResults.map(i => [`${i.doc_id}:${i.excel_row}`, i.id])
    )

    // ── STEP 3: 로그 처리 (logs 있는 행만) ──────────────────
    const rowsWithProd = validRows.filter(r => r.prod_logs.length > 0)
    const rowsWithShip = validRows.filter(r => r.ship_logs.length > 0)

    if (rowsWithProd.length > 0) {
      const prodItemIds = rowsWithProd
        .map(r => itemIdMap.get(`${docIdMap.get(r.doc_no)!.id}:${r.excel_row}`))
        .filter((id): id is string => !!id)

      // 기존 로그 일괄 삭제
      await supabase.from('glassflow_production_logs').delete().in('item_id', prodItemIds)

      // 신규 로그 일괄 삽입
      const prodInsert = rowsWithProd.flatMap(r => {
        const itemId = itemIdMap.get(`${docIdMap.get(r.doc_no)!.id}:${r.excel_row}`)
        if (!itemId) return []
        return r.prod_logs
          .filter(l => l.qty !== null)
          .map(l => ({
            item_id:       itemId,
            seq:           l.seq,
            produced_date: l.date,
            produced_qty:  l.qty!,
            is_completed:  l.is_completed,
            note:          l.note,
            updated_at:    new Date().toISOString(),
          }))
      })
      if (prodInsert.length > 0) {
        await supabase.from('glassflow_production_logs').insert(prodInsert)
      }
    }

    if (rowsWithShip.length > 0) {
      const shipItemIds = rowsWithShip
        .map(r => itemIdMap.get(`${docIdMap.get(r.doc_no)!.id}:${r.excel_row}`))
        .filter((id): id is string => !!id)

      await supabase.from('glassflow_shipment_logs').delete().in('item_id', shipItemIds)

      const shipInsert = rowsWithShip.flatMap(r => {
        const itemId = itemIdMap.get(`${docIdMap.get(r.doc_no)!.id}:${r.excel_row}`)
        if (!itemId) return []
        return r.ship_logs
          .filter(l => l.qty !== null)
          .map(l => ({
            item_id:      itemId,
            seq:          l.seq,
            shipped_date: l.date,
            shipped_qty:  l.qty!,
            note:         l.note,
            updated_at:   new Date().toISOString(),
          }))
      })
      if (shipInsert.length > 0) {
        await supabase.from('glassflow_shipment_logs').insert(shipInsert)
      }
    }

    // ── 카운트 집계 ─────────────────────────────────────────
    for (const r of validRows) {
      const doc = docIdMap.get(r.doc_no)
      if (doc?.isNew) inserted++
      else updated++
    }
    done += chunkRows.length
    printProgress(done, total, inserted, updated, errors.length)
  }

  process.stdout.write('\n')
  console.log('\n=== 완료 ===')
  console.log(`신규: ${inserted}행 | 갱신: ${updated}행 | 오류: ${errors.length}건`)
  if (errors.length > 0) {
    console.log('\n[오류 목록]')
    errors.slice(0, 20).forEach(e => console.log(`  row ${e.row}: ${e.reason}`))
    if (errors.length > 20) console.log(`  ... 외 ${errors.length - 20}건`)
  }
}

main().catch(console.error)
