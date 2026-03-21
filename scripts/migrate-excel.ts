/**
 * 발주현황.xlsx → Supabase DB 마이그레이션 스크립트
 *
 * 사용법:
 *   npx tsx scripts/migrate-excel.ts --dry-run          # 드라이런 (DB 저장 없음)
 *   npx tsx scripts/migrate-excel.ts --run              # 실제 저장
 *   npx tsx scripts/migrate-excel.ts --run --limit=100  # 처음 100행만
 *   npx tsx scripts/migrate-excel.ts --run --from=3178  # 특정 행부터
 */

import * as XLSX from 'xlsx'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

// ── 설정 ──────────────────────────────────────────────────────
const EXCEL_PATH = path.resolve(__dirname, '../docs/발주서.xlsx')
const SHEET_NAME = '발주현황'

// 컬럼 인덱스 (0-based)
const COL = {
  DOC_NO:       0,   // A: 의뢰번호
  CUSTOMER:     1,   // B: 거래처/업체명
  SITE_NAME:    2,   // C: 현장명
  ORDER_QTY:    3,   // D: 의뢰수량
  ITEM_NAME:    6,   // G: 품명 (신형식 행 3178~)
  TPS:          7,   // H: TPS 일자 (구형식) / 비고 (신형식)
  ARRIVAL:     10,   // K: 주문서도착일
  REQUEST_DATE:11,   // L: 생산의뢰일
  DUE_DATE:    12,   // M: 납품요청일
  PROD_START:  13,   // N: 생산 1회차 시작
  PROD_END:    22,   // W: 생산 10회차 끝
  SHIP_START:  23,   // X: 출고 1회차 시작
  SHIP_END:    35,   // AJ: 출고 13회차 끝
}

// ── 날짜 파싱 ─────────────────────────────────────────────────
function parseExcelDate(raw: unknown, docNo?: string): string | null {
  if (!raw && raw !== 0) return null

  // Excel 시리얼 숫자 (예: 44853)
  if (typeof raw === 'number') {
    const d = XLSX.SSF.parse_date_code(raw)
    if (!d) return null
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  }

  const s = String(raw).trim()
  if (!s) return null

  // "MM월 DD일" 형식 → 연도는 의뢰번호 앞 2자리에서 추출 (예: "25-0001" → 2025)
  const mdMatch = s.match(/^(\d{1,2})월\s*(\d{1,2})일$/)
  if (mdMatch) {
    const year = docNo ? inferYear(docNo) : new Date().getFullYear()
    return `${year}-${String(Number(mdMatch[1])).padStart(2, '0')}-${String(Number(mdMatch[2])).padStart(2, '0')}`
  }

  // "YYYY-MM-DD" 형식
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s

  return null
}

function inferYear(docNo: string): number {
  const m = docNo.match(/^(\d{2})-/)
  if (m) return 2000 + Number(m[1])
  return new Date().getFullYear()
}

// ── 생산/출고 셀 파싱 ─────────────────────────────────────────
interface LogEntry {
  seq: number
  date: string | null
  qty: number | null
  is_completed: boolean
  note: string | null
}

/**
 * "1/29 16조" → { date: "2025-01-29", qty: 16 }
 * "MM월 DD일" → { date: "2025-MM-DD", qty: order_qty }
 * "완료"      → { is_completed: true, qty: order_qty }
 * 숫자(엑셀 시리얼) → { date: "...", qty: order_qty }
 * 기타 텍스트 → { note: 텍스트 }
 */
function parseLogCell(raw: unknown, seq: number, orderQty: number, docNo: string): LogEntry | null {
  if (raw === undefined || raw === null || raw === '') return null

  // 엑셀 시리얼 숫자 → 날짜, 수량=order_qty
  if (typeof raw === 'number') {
    const date = parseExcelDate(raw, docNo)
    return { seq, date, qty: orderQty, is_completed: false, note: null }
  }

  const s = String(raw).trim()
  if (!s) return null

  // "완료"
  if (s === '완료') {
    return { seq, date: null, qty: orderQty, is_completed: true, note: null }
  }

  // "M/D N조" or "MM/DD N조" (예: "1/29 16조", "12/3 200조")
  const slashQtyMatch = s.match(/^(\d{1,2})\/(\d{1,2})\s+(\d+)조?$/)
  if (slashQtyMatch) {
    const year = inferYear(docNo)
    const date = `${year}-${String(Number(slashQtyMatch[1])).padStart(2, '0')}-${String(Number(slashQtyMatch[2])).padStart(2, '0')}`
    return { seq, date, qty: Number(slashQtyMatch[3]), is_completed: false, note: null }
  }

  // "MM월 DD일" → 날짜만, 수량=order_qty
  const mdMatch = s.match(/^(\d{1,2})월\s*(\d{1,2})일$/)
  if (mdMatch) {
    const date = parseExcelDate(raw, docNo)
    return { seq, date, qty: orderQty, is_completed: false, note: null }
  }

  // 순수 숫자 문자열 → order_qty 로 간주 (수량만 기재된 경우)
  if (/^\d+$/.test(s)) {
    return { seq, date: null, qty: Number(s), is_completed: false, note: null }
  }

  // 기타 메모성 텍스트 (예: "5/16 전무님", "공장확인중")
  return { seq, date: null, qty: null, is_completed: false, note: s }
}

// ── 메인 ──────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2)
  const isDryRun = !args.includes('--run')
  const limitArg = args.find((a) => a.startsWith('--limit='))
  const fromArg  = args.find((a) => a.startsWith('--from='))
  const limit    = limitArg ? Number(limitArg.split('=')[1]) : Infinity
  const fromRow  = fromArg  ? Number(fromArg.split('=')[1])  : 1

  console.log(`\n=== GlassFlow Excel Migration ===`)
  console.log(`모드: ${isDryRun ? 'DRY-RUN (저장 없음)' : '실제 저장'}`)
  console.log(`파일: ${EXCEL_PATH}`)
  console.log(`시작 행: ${fromRow}, 최대: ${limit === Infinity ? '전체' : limit}행\n`)

  // Supabase 클라이언트
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Excel 읽기
  const wb = XLSX.readFile(EXCEL_PATH)
  const ws = wb.Sheets[SHEET_NAME]
  if (!ws) throw new Error(`시트 '${SHEET_NAME}'를 찾을 수 없습니다.`)

  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: null })
  console.log(`전체 행수: ${raw.length}`)

  // 통계
  let processed = 0, inserted = 0, skipped = 0
  const errors: Array<{ row: number; reason: string }> = []
  const deletedDocIds = new Set<string>()  // doc_id별 첫 삽입 시만 기존 items 삭제

  for (let i = fromRow; i < raw.length; i++) {
    if (processed >= limit) break

    const row = raw[i] as (string | number | null)[]

    // 빈 행 / 헤더 행 스킵
    const docNo = row[COL.DOC_NO] ? String(row[COL.DOC_NO]).trim() : null
    if (!docNo || docNo === '의뢰번호') {
      skipped++
      continue
    }

    const siteNameRaw = row[COL.SITE_NAME] ? String(row[COL.SITE_NAME]).trim() : null
    if (!siteNameRaw) {
      skipped++
      continue
    }

    const orderQtyRaw = row[COL.ORDER_QTY]
    const orderQty = orderQtyRaw ? Number(String(orderQtyRaw).replace(/[^0-9]/g, '')) : 0

    // 날짜 파싱
    const tpsDate      = parseExcelDate(row[COL.TPS], docNo)
    const arrivalDate  = parseExcelDate(row[COL.ARRIVAL], docNo)
    const requestDate  = parseExcelDate(row[COL.REQUEST_DATE], docNo)
    const dueDate      = parseExcelDate(row[COL.DUE_DATE], docNo)

    // 생산 로그 파싱 (N~W, 10칸)
    const prodLogs: LogEntry[] = []
    for (let c = COL.PROD_START; c <= COL.PROD_END; c++) {
      const seq = c - COL.PROD_START + 1
      const entry = parseLogCell(row[c], seq, orderQty, docNo)
      if (entry) prodLogs.push(entry)
    }

    // 출고 로그 파싱 (X~AJ, 13칸)
    const shipLogs: LogEntry[] = []
    for (let c = COL.SHIP_START; c <= COL.SHIP_END; c++) {
      const seq = c - COL.SHIP_START + 1
      const entry = parseLogCell(row[c], seq, orderQty, docNo)
      if (entry) shipLogs.push(entry)
    }

    processed++

    if (isDryRun) {
      console.log(`[DRY] row ${i + 1} | ${docNo} | ${siteNameRaw} | qty:${orderQty} | prod:${prodLogs.length} | ship:${shipLogs.length}`)
      continue
    }

    // ── DB 저장 ──
    try {
      // 1. order_docs upsert
      const { data: docData, error: docErr } = await supabase
        .from('glassflow_order_docs')
        .upsert(
          {
            doc_no: docNo,
            customer: row[COL.CUSTOMER] ? String(row[COL.CUSTOMER]).trim() : null,
            site_name: siteNameRaw,
            request_date: requestDate,
            due_date: dueDate,
            tps_date: tpsDate,
            arrival_date: arrivalDate,
            source: 'excel',
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'doc_no' }
        )
        .select('id')
        .single()

      if (docErr || !docData) {
        errors.push({ row: i + 1, reason: `order_docs upsert: ${docErr?.message}` })
        continue
      }

      const docId = docData.id

      // 2. order_items insert (같은 doc_id의 첫 행에서만 기존 items 삭제)
      if (!deletedDocIds.has(docId)) {
        await supabase.from('glassflow_order_items').delete().eq('doc_id', docId)
        deletedDocIds.add(docId)
      }

      const itemName = row[COL.ITEM_NAME] ? String(row[COL.ITEM_NAME]).trim() : null

      const { data: itemData, error: itemErr } = await supabase
        .from('glassflow_order_items')
        .insert({ doc_id: docId, item_name: itemName, order_qty: orderQty || null })
        .select('id')
        .single()

      if (itemErr || !itemData) {
        errors.push({ row: i + 1, reason: `order_items insert: ${itemErr?.message}` })
        continue
      }

      const itemId = itemData.id

      // 3. production_logs
      if (prodLogs.length > 0) {
        await supabase.from('glassflow_production_logs').delete().eq('item_id', itemId)
        const validProd = prodLogs.filter((l) => l.qty !== null)
        if (validProd.length > 0) {
          await supabase.from('glassflow_production_logs').insert(
            validProd.map((l) => ({
              item_id:       itemId,
              seq:           l.seq,
              produced_date: l.date,
              produced_qty:  l.qty!,
              is_completed:  l.is_completed,
              note:          l.note,
              updated_at:    new Date().toISOString(),
            }))
          )
        }
      }

      // 4. shipment_logs
      if (shipLogs.length > 0) {
        await supabase.from('glassflow_shipment_logs').delete().eq('item_id', itemId)
        const validShip = shipLogs.filter((l) => l.qty !== null)
        if (validShip.length > 0) {
          await supabase.from('glassflow_shipment_logs').insert(
            validShip.map((l) => ({
              item_id:      itemId,
              seq:          l.seq,
              shipped_date: l.date,
              shipped_qty:  l.qty!,
              note:         l.note,
              updated_at:   new Date().toISOString(),
            }))
          )
        }
      }

      inserted++
      if (inserted % 100 === 0) console.log(`  저장: ${inserted}행 완료...`)
    } catch (e) {
      errors.push({ row: i + 1, reason: String(e) })
    }
  }

  // ── 결과 리포트 ──
  console.log('\n=== 완료 ===')
  console.log(`처리: ${processed}행 | 저장: ${inserted}행 | 스킵: ${skipped}행 | 오류: ${errors.length}건`)

  if (errors.length > 0) {
    console.log('\n[오류 목록]')
    errors.slice(0, 20).forEach((e) => console.log(`  row ${e.row}: ${e.reason}`))
    if (errors.length > 20) console.log(`  ... 외 ${errors.length - 20}건`)
  }
}

main().catch(console.error)
