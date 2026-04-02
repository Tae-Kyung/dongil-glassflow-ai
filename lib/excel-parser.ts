/**
 * 발주현황 엑셀 파싱 공유 모듈
 * migrate-excel.ts 와 /api/upload-excel 양쪽에서 사용
 */

import * as XLSX from 'xlsx'

// 컬럼 인덱스 (0-based)
export const COL = {
  DOC_NO:       0,   // A: 의뢰번호
  CUSTOMER:     1,   // B: 거래처
  SITE_NAME:    2,   // C: 현장명
  ORDER_QTY:    3,   // D: 의뢰수량
  AREA_M2:      4,   // E: 면적(m²)
  NOTE_F:       5,   // F: 간봉/비고1
  ITEM_NAME:    6,   // G: 품명/비고2
  TPS:          7,   // H: TPS 일자 (구형식)
  ARRIVAL:     10,   // K: 주문서도착일
  REQUEST_DATE:11,   // L: 생산의뢰일
  DUE_DATE:    12,   // M: 납품요청일
  PROD_START:  13,   // N: 생산 1회차
  PROD_END:    22,   // W: 생산 10회차
  SHIP_START:  23,   // X: 출고 1회차
  SHIP_END:    35,   // AJ: 출고 13회차
} as const

export interface LogEntry {
  seq: number
  date: string | null
  qty: number | null
  is_completed: boolean
  note: string | null
}

export interface ParsedExcelRow {
  excel_row: number       // 1-based 엑셀 행 번호
  doc_no: string
  customer: string | null
  site_name: string
  order_qty: number
  area_m2: number | null
  item_name: string | null
  note: string | null     // F열 + G열 통합 비고
  tps_date: string | null
  arrival_date: string | null
  request_date: string | null
  due_date: string | null
  prod_logs: LogEntry[]
  ship_logs: LogEntry[]
}

function inferYear(docNo: string): number {
  const m = docNo.match(/^(\d{2})-/)
  if (m) return 2000 + Number(m[1])
  return new Date().getFullYear()
}

export function parseExcelDate(raw: unknown, docNo?: string): string | null {
  if (!raw && raw !== 0) return null

  if (typeof raw === 'number') {
    const d = XLSX.SSF.parse_date_code(raw)
    if (!d) return null
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  }

  const s = String(raw).trim()
  if (!s) return null

  // "MM월 DD일"
  const mdMatch = s.match(/^(\d{1,2})월\s*(\d{1,2})일$/)
  if (mdMatch) {
    const year = docNo ? inferYear(docNo) : new Date().getFullYear()
    return `${year}-${String(Number(mdMatch[1])).padStart(2, '0')}-${String(Number(mdMatch[2])).padStart(2, '0')}`
  }

  // "YYYY-MM-DD"
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s

  return null
}

export function parseLogCell(
  raw: unknown,
  seq: number,
  orderQty: number,
  docNo: string
): LogEntry | null {
  if (raw === undefined || raw === null || raw === '') return null

  if (typeof raw === 'number') {
    const date = parseExcelDate(raw, docNo)
    return { seq, date, qty: orderQty, is_completed: false, note: null }
  }

  const s = String(raw).trim()
  if (!s) return null

  if (s === '완료') {
    return { seq, date: null, qty: orderQty, is_completed: true, note: null }
  }

  // "M/D NNN조" (예: "1/29 16조", "3/11 1,368조")
  const slashQtyMatch = s.match(/^(\d{1,2})\/(\d{1,2})\s+([\d,]+)조?$/)
  if (slashQtyMatch) {
    const year = inferYear(docNo)
    const date = `${year}-${String(Number(slashQtyMatch[1])).padStart(2, '0')}-${String(Number(slashQtyMatch[2])).padStart(2, '0')}`
    const qty = Number(slashQtyMatch[3].replace(/,/g, ''))
    return { seq, date, qty, is_completed: false, note: null }
  }

  // "MM월 DD일"
  const mdMatch = s.match(/^(\d{1,2})월\s*(\d{1,2})일$/)
  if (mdMatch) {
    const date = parseExcelDate(raw, docNo)
    return { seq, date, qty: orderQty, is_completed: false, note: null }
  }

  // 순수 숫자
  if (/^\d+$/.test(s)) {
    return { seq, date: null, qty: Number(s), is_completed: false, note: null }
  }

  // 기타 메모
  return { seq, date: null, qty: null, is_completed: false, note: s }
}

/**
 * 워크시트 데이터를 파싱하여 행 배열로 반환
 * @param ws XLSX 워크시트
 * @param fromRow 시작 행 인덱스 (0-based, 0 = 헤더)
 */
export function parseWorksheet(ws: XLSX.WorkSheet, fromRow = 1): ParsedExcelRow[] {
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    raw: false,
    defval: null,
  })

  const results: ParsedExcelRow[] = []

  for (let i = fromRow; i < raw.length; i++) {
    const row = raw[i] as (string | number | null)[]

    const docNo = row[COL.DOC_NO] ? String(row[COL.DOC_NO]).trim() : null
    if (!docNo || docNo === '의뢰번호') continue

    const siteName = row[COL.SITE_NAME] ? String(row[COL.SITE_NAME]).trim() : null
    if (!siteName) continue

    const orderQty = row[COL.ORDER_QTY]
      ? Number(String(row[COL.ORDER_QTY]).replace(/[^0-9]/g, ''))
      : 0

    const areaRaw = row[COL.AREA_M2]
    const area_m2 = areaRaw ? Number(String(areaRaw).replace(/[^0-9.]/g, '')) || null : null

    const noteF = row[COL.NOTE_F] ? String(row[COL.NOTE_F]).trim() : null
    const noteG = row[COL.ITEM_NAME] ? String(row[COL.ITEM_NAME]).trim() : null
    // F열이 규격 정보(비고)면 note로, G열이 품명이면 item_name으로 사용
    // 둘 다 있을 때는 합쳐서 note에 저장
    const note = [noteF, noteG].filter(Boolean).join(' / ') || null

    const prodLogs: LogEntry[] = []
    for (let c = COL.PROD_START; c <= COL.PROD_END; c++) {
      const entry = parseLogCell(row[c], c - COL.PROD_START + 1, orderQty, docNo)
      if (entry) prodLogs.push(entry)
    }

    const shipLogs: LogEntry[] = []
    for (let c = COL.SHIP_START; c <= COL.SHIP_END; c++) {
      const entry = parseLogCell(row[c], c - COL.SHIP_START + 1, orderQty, docNo)
      if (entry) shipLogs.push(entry)
    }

    results.push({
      excel_row: i + 1,  // 1-based (엑셀 화면의 행 번호와 동일)
      doc_no: docNo,
      customer: row[COL.CUSTOMER] ? String(row[COL.CUSTOMER]).trim() : null,
      site_name: siteName,
      order_qty: orderQty,
      area_m2,
      item_name: noteG,
      note,
      tps_date: parseExcelDate(row[COL.TPS], docNo),
      arrival_date: parseExcelDate(row[COL.ARRIVAL], docNo),
      request_date: parseExcelDate(row[COL.REQUEST_DATE], docNo),
      due_date: parseExcelDate(row[COL.DUE_DATE], docNo),
      prod_logs: prodLogs,
      ship_logs: shipLogs,
    })
  }

  return results
}
