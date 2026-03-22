import { createClient } from '@supabase/supabase-js'
import path from 'path'
import * as dotenv from 'dotenv'

dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const docNo = process.argv[2] ?? '26-0304'

  // 1. 발주 문서 확인
  const { data: doc } = await supabase
    .from('glassflow_order_docs')
    .select('*')
    .eq('doc_no', docNo)
    .single()

  if (!doc) {
    console.log(`❌ "${docNo}" 문서가 DB에 없습니다.`)
    return
  }

  console.log(`✅ 문서 발견:`)
  console.log(`  id:        ${doc.id}`)
  console.log(`  doc_no:    ${doc.doc_no}`)
  console.log(`  customer:  ${doc.customer}`)
  console.log(`  site_name: ${doc.site_name}`)
  console.log(`  due_date:  ${doc.due_date ?? '(null)'}`)
  console.log(`  source:    ${doc.source}`)

  // 2. 품목 확인
  const { data: items } = await supabase
    .from('glassflow_order_items')
    .select('*')
    .eq('doc_id', doc.id)

  console.log(`\n품목 ${items?.length ?? 0}건:`)
  for (const i of items ?? []) {
    console.log(`  item_no:${i.item_no} "${i.item_name}" qty:${i.order_qty}`)
  }

  // 3. 뷰에서 확인
  const { data: viewItems } = await supabase
    .from('glassflow_item_status')
    .select('id, doc_no, item_name, status, due_date, order_qty')
    .eq('doc_no', docNo)

  console.log(`\n뷰(glassflow_item_status)에서 ${viewItems?.length ?? 0}건:`)
  for (const v of viewItems ?? []) {
    console.log(`  ${v.doc_no} "${v.item_name}" [${v.status}] due:${v.due_date ?? '(null)'}`)
  }

  // 4. 왜 대시보드에 안 보이는지 (기본 필터: due_date >= 오늘)
  const today = new Date().toISOString().slice(0, 10)
  if (!doc.due_date) {
    console.log(`\n⚠️  due_date가 null → 기본 대시보드 필터(납기일 >= 오늘)에서 제외됨`)
  } else if (doc.due_date < today) {
    console.log(`\n⚠️  due_date(${doc.due_date})가 오늘(${today})보다 과거 → 기본 필터에서 제외됨`)
    console.log(`   → 납기 초과 필터 또는 "이전 데이터 포함" 체크 시 표시됨`)
  } else {
    console.log(`\n✅ due_date(${doc.due_date})가 오늘 이후 → 기본 필터에 포함되어야 함`)
    console.log(`   → 다른 원인 확인 필요 (status=shipped 제외 여부 등)`)
  }
}

main().catch(console.error)
