import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// 클라이언트 컴포넌트용 (anon key, RLS 적용)
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// 서버 사이드 전용 (service role key, RLS 우회)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)
