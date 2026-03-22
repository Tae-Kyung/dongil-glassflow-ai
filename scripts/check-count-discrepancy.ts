/**
 * HEAD count vs 실제 rows count 불일치 원인 분석
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

  // 방법 1: count: exact, head: true (현재 API 방식)
  const { count: headCount } = await supabase
    .from('glassflow_item_status')
    .select('*', { count: 'exact', head: true })
    .lt('due_date', today)
    .not('status', 'eq', 'shipped')
  console.log(`HEAD count: ${headCount}`)

  // 방법 2: 실제 행을 select하면서 count도 같이 받기
  const { data: rows, count: rowCount } = await supabase
    .from('glassflow_item_status')
    .select('id', { count: 'exact' })
    .lt('due_date', today)
    .not('status', 'eq', 'shipped')
    .limit(2000)  // 충분히 큰 값
  console.log(`Row count (select): ${rowCount}, 실제 rows: ${rows?.length}`)

  // 방법 3: 수동 페이지네이션으로 전체 합산
  let total = 0
  let allIds: string[] = []
  let from = 0
  while (true) {
    const { data } = await supabase
      .from('glassflow_item_status')
      .select('id')
      .lt('due_date', today)
      .not('status', 'eq', 'shipped')
      .range(from, from + 999)
    if (!data?.length) break
    total += data.length
    allIds = allIds.concat(data.map(r => r.id))
    if (data.length < 1000) break
    from += 1000
  }
  console.log(`페이지네이션 합산: ${total}건`)

  // 중복 id 확인
  const uniqueIds = new Set(allIds)
  console.log(`고유 id: ${uniqueIds.size}건 (중복: ${total - uniqueIds.size}건)`)

  // null due_date 포함 여부 확인 (혹시 lt 조건이 null을 포함하는지)
  const { count: nullDueDate } = await supabase
    .from('glassflow_item_status')
    .select('*', { count: 'exact', head: true })
    .is('due_date', null)
    .not('status', 'eq', 'shipped')
  console.log(`\ndue_date = NULL 미출고: ${nullDueDate}건`)
  console.log('→ PostgREST lt 조건에 NULL이 포함되면 count 오염 가능')

  // status별 카운트 확인
  console.log('\n=== status별 카운트 (납기초과 기간) ===')
  for (const s of ['pending', 'in_progress', 'produced', 'partial']) {
    const { count } = await supabase
      .from('glassflow_item_status')
      .select('*', { count: 'exact', head: true })
      .lt('due_date', today)
      .eq('status', s)
    console.log(`  ${s}: ${count}건`)
  }
}

main().catch(console.error)
