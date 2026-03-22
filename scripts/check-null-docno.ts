/**
 * DB에서 의뢰번호(doc_no)가 null이거나 비어있는 발주 문서를 조회합니다.
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

  // doc_no가 null이거나 빈 문자열인 레코드 조회
  const { data: nullDocs, error: e1 } = await supabase
    .from('glassflow_order_docs')
    .select('id, doc_no, customer, site_name, due_date, created_at')
    .or('doc_no.is.null,doc_no.eq.')
    .order('created_at', { ascending: false })

  if (e1) throw new Error(e1.message)

  console.log(`\n=== 의뢰번호 없는 발주 문서 ===`)
  console.log(`총 ${nullDocs?.length ?? 0}건\n`)

  if (!nullDocs?.length) {
    console.log('없음')
    return
  }

  for (const doc of nullDocs) {
    console.log(`id: ${doc.id}`)
    console.log(`  doc_no:    ${doc.doc_no ?? '(null)'}`)
    console.log(`  customer:  ${doc.customer ?? '(null)'}`)
    console.log(`  site_name: ${doc.site_name ?? '(null)'}`)
    console.log(`  due_date:  ${doc.due_date ?? '(null)'}`)
    console.log(`  created:   ${doc.created_at}`)
    console.log()
  }

  // 각 doc의 품목 수도 확인
  console.log('=== 품목 수 ===')
  for (const doc of nullDocs) {
    const { count } = await supabase
      .from('glassflow_order_items')
      .select('id', { count: 'exact', head: true })
      .eq('doc_id', doc.id)
    console.log(`id ${doc.id} (${doc.site_name ?? 'unknown'}): ${count}개 품목`)
  }
}

main().catch(console.error)
