/**
 * 의뢰번호 형식이 이상한 레코드를 조회합니다.
 * 정상 형식: 숫자2자리-숫자4자리 (예: 25-1234)
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

  // 전체 doc_no 목록 가져오기 (페이지네이션)
  let allDocs: any[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('glassflow_order_docs')
      .select('id, doc_no, customer, site_name, due_date')
      .range(from, from + 999)
    if (error) throw new Error(error.message)
    if (!data?.length) break
    allDocs = allDocs.concat(data)
    if (data.length < 1000) break
    from += 1000
  }

  console.log(`\n총 ${allDocs.length}건 조회\n`)

  // 정상 형식: ^\d{2}-\d{4}$
  const normalPattern = /^\d{2}-\d{4}$/
  const invalid = allDocs.filter(d => !normalPattern.test(d.doc_no ?? ''))

  console.log(`=== 형식 이상 의뢰번호 (${invalid.length}건) ===\n`)

  if (!invalid.length) {
    console.log('없음 - 모든 의뢰번호가 정상 형식입니다.')
    return
  }

  for (const doc of invalid) {
    console.log(`doc_no: "${doc.doc_no}"`)
    console.log(`  customer:  ${doc.customer ?? '(null)'}`)
    console.log(`  site_name: ${doc.site_name ?? '(null)'}`)
    console.log(`  due_date:  ${doc.due_date ?? '(null)'}`)
    console.log()
  }

  // 연도별 분포도 확인 (정상 데이터)
  const yearCount: Record<string, number> = {}
  for (const doc of allDocs) {
    const m = doc.doc_no?.match(/^(\d{2})-/)
    const yr = m ? m[1] : 'unknown'
    yearCount[yr] = (yearCount[yr] ?? 0) + 1
  }
  console.log('=== 연도별 분포 ===')
  for (const [yr, cnt] of Object.entries(yearCount).sort()) {
    console.log(`  ${yr}: ${cnt}건`)
  }
}

main().catch(console.error)
