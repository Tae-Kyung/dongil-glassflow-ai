import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

// POST /api/upload-url — 클라이언트가 Supabase Storage에 직접 업로드할 서명 URL 발급
export async function POST(request: NextRequest) {
  const { fileName } = await request.json()
  const storagePath = `${Date.now()}_${fileName ?? 'upload.pdf'}`

  const { data, error } = await supabaseAdmin.storage
    .from('order-pdfs')
    .createSignedUploadUrl(storagePath)

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? '업로드 URL 생성 실패' }, { status: 500 })
  }

  return NextResponse.json({ signedUrl: data.signedUrl, storagePath })
}
