import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// 서버 사이드 전용 (service role key, RLS 우회)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)
