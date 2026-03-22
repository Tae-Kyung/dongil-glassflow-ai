/**
 * 납기 초과 카운트를 10회 반복 조회해서 변동 여부를 확인합니다.
 * 또한 현재 DB의 뷰 정의를 출력합니다.
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

  // 10회 반복 조회
  console.log('=== 납기 초과 카운트 10회 반복 ===')
  const counts: number[] = []
  for (let i = 0; i < 10; i++) {
    const { count, error } = await supabase
      .from('glassflow_item_status')
      .select('*', { count: 'exact', head: true })
      .lt('due_date', today)
      .not('status', 'eq', 'shipped')
    if (error) { console.error(error.message); break }
    counts.push(count ?? 0)
    process.stdout.write(`${count} `)
  }
  console.log()

  const unique = [...new Set(counts)]
  if (unique.length === 1) {
    console.log(`✅ 안정적: 항상 ${unique[0]}건`)
  } else {
    console.log(`❌ 불안정: ${unique.join(', ')} (${unique.length}가지 값)`)
  }

  // 뷰 정의 확인 (production_logs, shipment_logs 조인 방식)
  console.log('\n=== 뷰 정의 (JOIN 방식 확인) ===')
  const { data: viewDef, error: ve } = await supabase
    .rpc('get_view_definition', { view_name: 'glassflow_item_status' })
    .single()

  if (ve) {
    // rpc 없으면 pg_views로 직접 조회
    const { data: pgView, error: pe } = await supabase
      .from('pg_views')
      .select('definition')
      .eq('viewname', 'glassflow_item_status')
      .single()
    if (pe) {
      console.log('뷰 정의 조회 불가 (권한 부족)')
    } else {
      const def = (pgView as any)?.definition ?? ''
      // group by 포함 여부 확인
      if (def.includes('group by')) {
        console.log('✅ 서브쿼리 집계 방식 (GROUP BY 포함) - migration 004 적용됨')
      } else {
        console.log('❌ 직접 JOIN 방식 - migration 004 미적용!')
      }
      console.log('\n뷰 정의 요약:')
      console.log(def.substring(0, 500) + '...')
    }
  } else {
    console.log(viewDef)
  }

  // 샘플 데이터로 중복 여부 확인
  console.log('\n=== 납기초과 샘플 10건 (중복 id 확인) ===')
  const { data: samples } = await supabase
    .from('glassflow_item_status')
    .select('id, doc_no, item_name, total_produced_qty, total_shipped_qty, status')
    .lt('due_date', today)
    .not('status', 'eq', 'shipped')
    .limit(10)

  if (samples) {
    const ids = samples.map(s => s.id)
    const uniqueIds = new Set(ids)
    if (ids.length !== uniqueIds.size) {
      console.log(`❌ 중복 id 발견! (${ids.length}건 중 ${uniqueIds.size}개 unique)`)
    } else {
      console.log(`✅ id 중복 없음 (${ids.length}건 모두 unique)`)
    }
    for (const s of samples.slice(0, 5)) {
      console.log(`  id:${s.id} ${s.doc_no} "${s.item_name}" produced:${s.total_produced_qty} shipped:${s.total_shipped_qty} [${s.status}]`)
    }
  }
}

main().catch(console.error)
