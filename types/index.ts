// ============================================================
// GlassFlow AI — TypeScript Type Definitions
// ============================================================

export interface OrderDoc {
  id: string
  doc_no: string
  customer: string | null
  site_name: string
  request_date: string | null  // ISO date string
  due_date: string | null
  tps_date: string | null
  arrival_date: string | null
  source: 'excel' | 'pdf'
  raw_pdf_url: string | null
  created_at: string
  updated_at: string
}

export interface OrderItem {
  id: string
  doc_id: string
  excel_row: number | null  // 엑셀 원본 행 번호 (1-based). doc_id + excel_row 복합 유일키
  item_no: number | null
  item_name: string | null
  width_mm: number | null
  height_mm: number | null
  order_qty: number | null
  area_m2: number | null
  location: string | null
  created_at: string
  updated_at: string
}

export interface ProductionLog {
  id: string
  item_id: string
  seq: number
  produced_date: string | null  // ISO date string
  produced_qty: number
  is_completed: boolean
  note: string | null
  updated_by: string | null
  updated_at: string
}

export interface ShipmentLog {
  id: string
  item_id: string
  seq: number
  shipped_date: string | null  // ISO date string
  shipped_qty: number
  note: string | null
  updated_by: string | null
  updated_at: string
}

// item_status VIEW 결과 타입
export interface ItemStatus {
  id: string
  doc_id: string
  doc_no: string
  customer: string | null
  site_name: string
  due_date: string | null
  item_no: number | null
  item_name: string | null
  note: string | null
  width_mm: number | null
  height_mm: number | null
  order_qty: number
  area_m2: number | null
  location: string | null
  total_produced_qty: number
  total_shipped_qty: number
  pending_qty: number
  status: 'pending' | 'in_progress' | 'produced' | 'partial' | 'shipped'
}

// PDF Vision API 응답 타입
export interface ParsedPdfItem {
  item_no: number | null
  item_name: string | null
  width_mm: number | null
  height_mm: number | null
  order_qty: number | null
  area_m2: number | null
  location: string | null
}

export interface ParsedPdfResult {
  doc_no: string
  customer: string | null
  site_name: string
  request_date: string | null  // YYYY-MM-DD
  due_date: string | null      // YYYY-MM-DD
  items: ParsedPdfItem[]
}

// 챗봇 메시지 타입
export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}
