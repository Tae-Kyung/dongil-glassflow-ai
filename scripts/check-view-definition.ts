/**
 * migration 004 적용 여부를 검증합니다.
 * - 납기초과 전체 id에서 중복 확인
 * - due_date 경계에 있는 항목 확인
 */
import { createClient } from '@supabase/supabase-js'
import path from 'path'
import * as dotenv from 'dotenv'

dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const today = new Date().toISOString().slice(0, 10)
  console.log(`오늘: ${today}\n`)

  // 납기초과 전체 조회 (id 중복 확인)
  let allItems: any[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('glassflow_item_status')
      .select('id, doc_no, item_name, order_qty, total_produced_qty, total_shipped_qty, status, due_date')
      .lt('due_date', today)
      .not('status', 'eq', 'shipped')
      .range(from, from + 999)
    if (error) throw new Error(error.message)
    if (!data?.length) break
    allItems = allItems.concat(data)
    if (data.length < 1000) break
    from += 1000
  }

  console.log(`=== 납기초과 전체 조회: ${allItems.length}건 ===`)

  // id 중복 확인
  const idCount: Record<string, number> = {}
  for (const item of allItems) {
    idCount[item.id] = (idCount[item.id] ?? 0) + 1
  }
  const duplicates = Object.entries(idCount).filter(([, cnt]) => cnt > 1)
  if (duplicates.length > 0) {
    console.log(`\n❌ 중복 id 발견: ${duplicates.length}건`)
    for (const [id, cnt] of duplicates.slice(0, 10)) {
      const rows = allItems.filter(i => i.id === id)
      console.log(`  id: ${id} (${cnt}회 중복)`)
      for (const r of rows) {
        console.log(`    doc_no:${r.doc_no} produced:${r.total_produced_qty} shipped:${r.total_shipped_qty} [${r.status}]`)
      }
    }
    console.log('\n→ migration 004 미적용 또는 다른 중복 원인')
  } else {
    console.log('✅ id 중복 없음')
  }

  // due_date = 오늘인 항목이 있는지 (경계값 확인)
  const { data: todayItems } = await supabase
    .from('glassflow_item_status')
    .select('id, doc_no, status, due_date')
    .eq('due_date', today)
    .not('status', 'eq', 'shipped')
    .limit(5)
  console.log(`\n=== due_date = 오늘(${today}) 미출고 항목: ${todayItems?.length ?? 0}건 ===`)
  if (todayItems?.length) {
    for (const t of todayItems) {
      console.log(`  ${t.doc_no} [${t.status}]`)
    }
    console.log('→ 오늘 납기 항목은 "납기 초과"에 포함되지 않음 (lt 조건)')
  }

  // 실제로 카운트가 왜 바뀌는지: item_id가 glassflow_order_items에 중복 저장된 건 없는지
  console.log('\n=== glassflow_order_items에 중복 item (같은 doc_id + item_no) 확인 ===')
  // Supabase에서 직접 확인하기 어려우므로 샘플로 확인
  const { data: dupCheck, error: de } = await supabase
    .rpc('check_duplicate_items')
  if (de) {
    console.log('(RPC 없음 - Supabase SQL Editor에서 직접 확인 필요)')
    console.log('\nSQL Editor에서 실행:')
    console.log(`SELECT doc_id, item_no, COUNT(*) as cnt
FROM glassflow_order_items
GROUP BY doc_id, item_no
HAVING COUNT(*) > 1
ORDER BY cnt DESC
LIMIT 20;`)
  } else {
    console.log(dupCheck)
  }

  // 생산로그/출고로그가 있는 항목 중 납기초과인 것들의 수량 이상 여부
  console.log('\n=== 수량 이상 항목 (produced > order_qty*2 또는 shipped > order_qty) ===')
  const suspicious = allItems.filter(i =>
    i.total_produced_qty > i.order_qty * 3 ||
    i.total_shipped_qty > i.order_qty
  )
  if (suspicious.length > 0) {
    console.log(`${suspicious.length}건 발견:`)
    for (const s of suspicious.slice(0, 10)) {
      console.log(`  ${s.doc_no} "${s.item_name}" order:${s.order_qty} produced:${s.total_produced_qty} shipped:${s.total_shipped_qty}`)
    }
    console.log('\n→ 수량이 order_qty보다 훨씬 크면 Cartesian product 잔존 가능성')
  } else {
    console.log('없음')
  }
}

main().catch(console.error)
