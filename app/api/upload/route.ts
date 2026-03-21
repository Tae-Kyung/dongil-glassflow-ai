import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { openai } from '@/lib/openai'
import { embedText } from '@/lib/openai'
import { preparePdfForVision } from '@/lib/pdf-parser'
import type { ParsedPdfResult } from '@/types'

export const maxDuration = 60

const VISION_SYSTEM_PROMPT = `당신은 유리 제조업체의 작업 의뢰서(발주서) PDF를 분석하는 전문가입니다.
이미지에서 다음 필드를 정확하게 추출하여 JSON으로 반환하세요.

**추출 규칙**:
- doc_no: 의뢰번호 (예: "26-0385")
- customer: 업체명/거래처 (예: "(주)태영건설c")
- site_name: 현장명 (예: "부산 메디컬카운터 지역주택조합사업현장")
- request_date: 의뢰일자 → YYYY-MM-DD 형식
- due_date: 납품일자 → YYYY-MM-DD 형식
- items: 품목 배열 (소계·합계·빈 행 제외)
  - item_no: 항번(No) 숫자
  - item_name: 품명 전체 (예: "25.76T 8.76(4cl+0.76+4cl)접합+12A+5로이")
  - width_mm: 규격 가로(W) 숫자만 (콤마 제거, 예: 1445)
  - height_mm: 규격 세로(H) 숫자만 (예: 690)
  - order_qty: 수량 숫자
  - area_m2: 면적 소수점 2자리 숫자 (예: 4.00)
  - location: 비고/위치 텍스트 (없으면 null)

**주의사항**:
- 소계, 합계, 계 행은 items 배열에 포함하지 마세요
- 날짜는 반드시 YYYY-MM-DD 형식으로 변환하세요
- 추출 불가 필드는 null로 설정하세요
- 반드시 유효한 JSON만 반환하세요 (마크다운 코드블록 없이)`

export async function POST(request: NextRequest) {
  try {
    // storagePath를 받아 Supabase Storage에서 파일 다운로드
    const { storagePath } = await request.json()

    if (!storagePath) {
      return NextResponse.json({ error: 'storagePath가 없습니다.' }, { status: 400 })
    }

    const { data: fileData, error: downloadError } = await supabaseAdmin.storage
      .from('order-pdfs')
      .download(storagePath)

    if (downloadError || !fileData) {
      return NextResponse.json({ error: `파일 다운로드 실패: ${downloadError?.message}` }, { status: 500 })
    }

    const buffer = Buffer.from(await fileData.arrayBuffer())
    const rawPdfUrl = supabaseAdmin.storage.from('order-pdfs').getPublicUrl(storagePath).data.publicUrl

    // PDF → 이미지 변환
    const visionContent = await preparePdfForVision(buffer)

    // GPT-4o Vision으로 필드 추출
    const visionResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 4096,
      messages: [
        { role: 'system', content: VISION_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: '이 발주서 PDF에서 데이터를 추출해주세요.' },
            ...visionContent,
          ],
        },
      ],
    })

    const rawJson = visionResponse.choices[0].message.content ?? ''

    let parsed: ParsedPdfResult
    try {
      parsed = JSON.parse(rawJson)
    } catch {
      console.error('JSON parse error. Raw response:', rawJson)
      return NextResponse.json(
        { error: 'PDF 파싱에 실패했습니다. 파일을 확인해주세요.', raw: rawJson },
        { status: 422 }
      )
    }

    // site_name 임베딩 생성
    const embedding = await embedText(parsed.site_name)

    // order_docs upsert (doc_no 기준)
    const { data: docData, error: docError } = await supabaseAdmin
      .from('glassflow_order_docs')
      .upsert(
        {
          doc_no: parsed.doc_no,
          customer: parsed.customer,
          site_name: parsed.site_name,
          request_date: parsed.request_date,
          due_date: parsed.due_date,
          source: 'pdf',
          raw_pdf_url: rawPdfUrl,
          site_name_embedding: JSON.stringify(embedding),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'doc_no' }
      )
      .select('id')
      .single()

    if (docError || !docData) {
      console.error('order_docs upsert error:', docError)
      return NextResponse.json({ error: 'DB 저장에 실패했습니다.' }, { status: 500 })
    }

    const docId = docData.id

    // 기존 order_items 삭제 후 재삽입
    await supabaseAdmin.from('glassflow_order_items').delete().eq('doc_id', docId)

    if (parsed.items && parsed.items.length > 0) {
      const { error: itemsError } = await supabaseAdmin
        .from('glassflow_order_items')
        .insert(
          parsed.items.map((item) => ({
            doc_id: docId,
            item_no: item.item_no,
            item_name: item.item_name,
            width_mm: item.width_mm,
            height_mm: item.height_mm,
            order_qty: item.order_qty,
            area_m2: item.area_m2,
            location: item.location,
          }))
        )

      if (itemsError) {
        console.error('order_items insert error:', itemsError)
        return NextResponse.json({ error: '품목 저장에 실패했습니다.' }, { status: 500 })
      }
    }

    return NextResponse.json({
      success: true,
      doc_id: docId,
      parsed,
      item_count: parsed.items?.length ?? 0,
    })
  } catch (err) {
    console.error('Upload route error:', err)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
