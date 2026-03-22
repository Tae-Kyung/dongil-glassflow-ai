/**
 * Excel과 DB의 의뢰번호별 품목 수를 비교하여 불일치 항목을 출력합니다.
 *
 * 사용법:
 *   npx tsx scripts/audit-excel-db.ts
 *   npx tsx scripts/audit-excel-db.ts --fix   # 불일치 항목 자동 재처리
 */

import * as XLSX from 'xlsx'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

const EXCEL_PATH = path.resolve(__dirname, '../docs/발주서.xlsx')

const COL = {
  DOC_NO:       0,
  CUSTOMER:     1,
  SITE_NAME:    2,
  ORDER_QTY:    3,
  ITEM_NAME:    6,
  TPS:          7,
  ARRIVAL:     10,
  REQUEST_DATE:11,
  DUE_DATE:    12,
  PROD_START:  13,
  PROD_END:    22,
  SHIP_START:  23,
  SHIP_END:    35,
}

async function main() {
  const args = process.argv.slice(2)
  const doFix = args.includes('--fix')

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Excel 읽기 → doc_no별 행 수 집계
  const wb = XLSX.readFile(EXCEL_PATH)
  const ws = wb.Sheets['발주현황']
  if (!ws) throw new Error("시트 '발주현황'을 찾을 수 없습니다.")

  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: null })

  const excelCount: Record<string, number> = {}
  for (let i = 1; i < raw.length; i++) {
    const row = raw[i] as (string | null)[]
    const docNo = row[COL.DOC_NO] ? String(row[COL.DOC_NO]).trim() : null
    const siteName = row[COL.SITE_NAME] ? String(row[COL.SITE_NAME]).trim() : null
    if (!docNo || docNo === '의뢰번호' || !siteName) continue
    excelCount[docNo] = (excelCount[docNo] ?? 0) + 1
  }

  // DB에서 doc_no별 item 수 조회
  const { data: dbItems, error } = await supabase
    .from('glassflow_order_items')
    .select('doc_id, glassflow_order_docs!inner(doc_no)')

  if (error) throw new Error(`DB 조회 실패: ${error.message}`)

  const dbCount: Record<string, number> = {}
  for (const item of dbItems ?? []) {
    const docNo = (item as any).glassflow_order_docs?.doc_no
    if (docNo) dbCount[docNo] = (dbCount[docNo] ?? 0) + 1
  }

  // DB에만 있고 Excel에 없는 doc_no (수동 입력 등)
  const dbOnlyDocNos = Object.keys(dbCount).filter((d) => !excelCount[d])

  // 비교
  const mismatches = Object.keys(excelCount)
    .filter((docNo) => (excelCount[docNo] ?? 0) !== (dbCount[docNo] ?? 0))
    .map((docNo) => ({ docNo, excel: excelCount[docNo], db: dbCount[docNo] ?? 0 }))
    .sort((a, b) => a.docNo.localeCompare(b.docNo, undefined, { numeric: true }))

  console.log(`\n=== Excel vs DB 전수조사 ===`)
  console.log(`Excel 총 의뢰번호: ${Object.keys(excelCount).length}건`)
  console.log(`DB 총 의뢰번호:    ${Object.keys(dbCount).length}건 (DB 전용: ${dbOnlyDocNos.length}건)`)
  console.log(`불일치:            ${mismatches.length}건\n`)

  if (mismatches.length === 0) {
    console.log('모든 의뢰번호의 품목 수가 일치합니다.')
    return
  }

  console.log('의뢰번호         Excel   DB  차이')
  console.log('──────────────────────────────────')
  for (const m of mismatches) {
    const diff = m.excel - m.db
    console.log(`${m.docNo.padEnd(16)} ${String(m.excel).padStart(5)}  ${String(m.db).padStart(3)}  ${diff > 0 ? `+${diff}` : diff}`)
  }

  if (!doFix) {
    console.log(`\n재처리하려면: npx tsx scripts/migrate-excel.ts --run --doc-no=<의뢰번호>`)
    console.log(`전체 자동 수정: npx tsx scripts/audit-excel-db.ts --fix`)
    return
  }

  // --fix: 불일치 항목 자동 재처리
  console.log(`\n=== 자동 재처리 시작 (${mismatches.length}건) ===`)

  for (const m of mismatches) {
    if (m.db > m.excel) {
      console.log(`[SKIP] ${m.docNo}: DB(${m.db}) > Excel(${m.excel}), 수동 확인 필요`)
      continue
    }
    console.log(`[FIX]  ${m.docNo}: Excel ${m.excel}건 → DB 재처리 중...`)
    process.argv = ['', '', '--run', `--doc-no=${m.docNo}`]
    // 스크립트를 직접 재호출하는 대신 spawn 사용
    const { spawnSync } = await import('child_process')
    const result = spawnSync(
      'npx',
      ['tsx', path.resolve(__dirname, 'migrate-excel.ts'), '--run', `--doc-no=${m.docNo}`],
      { cwd: path.resolve(__dirname, '..'), encoding: 'utf-8', env: process.env }
    )
    if (result.stdout) console.log(result.stdout.trim())
    if (result.stderr && !result.stderr.includes('[dotenv')) console.error(result.stderr.trim())
  }

  console.log('\n=== 재처리 완료 ===')
}

main().catch(console.error)
