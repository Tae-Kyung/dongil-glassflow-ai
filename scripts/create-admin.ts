/**
 * 최고 관리자 계정 생성 스크립트 (최초 1회 실행)
 *
 * 사용법:
 *   npx tsx scripts/create-admin.ts
 */

import path from 'path'
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

async function main() {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: 'admin@dongilglass.co.kr',
    password: 'admin1234!',
    email_confirm: true,
  })

  if (error) {
    console.error('생성 실패:', error.message)
    process.exit(1)
  }

  console.log('관리자 계정 생성 완료')
  console.log('  이메일:', data.user?.email)
  console.log('  ID:', data.user?.id)
}

main().catch(console.error)
