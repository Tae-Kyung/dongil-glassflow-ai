import { NextRequest, NextResponse } from 'next/server'
import { openai } from '@/lib/openai'
import { searchSite } from '@/lib/site-search'
import { supabaseAdmin } from '@/lib/supabase'
import type { ChatMessage } from '@/types'

// glassflow_item_status VIEW 스키마 (SQL 생성 시 Hallucination 방지)
const ITEM_STATUS_SCHEMA = `
VIEW: glassflow_item_status
컬럼 목록 (이 외의 컬럼은 존재하지 않음):
- id           uuid
- doc_id       uuid
- doc_no       text          -- 의뢰번호 (예: '26-0385')
- customer     text          -- 업체명/거래처
- site_name    text          -- 현장명
- due_date     date          -- 납품일자
- item_no      integer       -- 항번
- item_name    text          -- 품명 (유리 스펙)
- width_mm     integer       -- 규격 가로(mm)
- height_mm    integer       -- 규격 세로(mm)
- order_qty    integer       -- 의뢰수량
- area_m2      numeric       -- 면적(㎡)
- location     text          -- 위치/비고
- total_produced_qty integer -- 총 생산수량
- total_shipped_qty  integer -- 총 출고수량
- pending_qty        integer -- 미출수량 (order_qty - total_shipped_qty)
- status             text    -- 'pending'|'in_progress'|'produced'|'partial'|'shipped'
`

const SQL_SYSTEM_PROMPT = `당신은 PostgreSQL 전문가입니다.
사용자의 질문을 분석하여 glassflow_item_status VIEW를 조회하는 SELECT SQL을 생성하세요.

${ITEM_STATUS_SCHEMA}

**규칙**:
1. SELECT 문만 생성 (INSERT/UPDATE/DELETE/DROP 등 절대 금지)
2. 위 컬럼 목록 외의 컬럼 사용 금지
3. 현장명은 WHERE site_name = '확정된_현장명' 형태로 정확히 일치 검색
4. 기본 조건 (사용자가 명시하지 않아도 자동 적용):
   - pending_qty > 0 (미출고 건 우선)
   - due_date >= CURRENT_DATE (오늘 이후 납기 건)
   단, 사용자가 "전체", "완료", "출고완료" 등을 명시하면 해당 조건 제거
5. SQL만 반환 (설명, 마크다운 코드블록 없이 순수 SQL만)`

const ANSWER_SYSTEM_PROMPT = `당신은 동일유리 발주 현황 안내 AI 어시스턴트입니다.
조회 결과를 바탕으로 한국어로 친절하고 명확하게 답변하세요.

규칙:
- 현장명, 품명, 수량, 날짜를 구체적으로 언급
- 표 형태보다 자연스러운 문장으로 요약
- 미출수량이 있으면 강조
- 단가, 가격 정보는 절대 언급하지 말 것
- 결과가 없으면 "해당 조건의 데이터가 없습니다"라고 안내`

interface ChatRequest {
  messages: ChatMessage[]
  confirmed_site?: string  // 복수 후보 중 사용자가 선택한 현장명
}

export async function POST(request: NextRequest) {
  const { messages, confirmed_site }: ChatRequest = await request.json()
  const latestUserMessage = messages.filter((m) => m.role === 'user').at(-1)?.content ?? ''

  // ── Step 1: 현장명 키워드 추출 ──────────────────────────────
  let siteName: string | null = null

  if (confirmed_site) {
    siteName = confirmed_site
  } else {
    const extractRes = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 50,
      messages: [
        {
          role: 'system',
          content: '사용자 메시지에서 현장명(건설 현장 이름) 키워드만 추출하세요. 현장명이 없으면 빈 문자열을 반환하세요. 키워드만 반환 (설명 없이).',
        },
        { role: 'user', content: latestUserMessage },
      ],
    })
    const keyword = extractRes.choices[0].message.content?.trim() ?? ''

    if (keyword) {
      // ── Step 2: 하이브리드 현장명 검색 ───────────────────────
      const candidates = await searchSite(keyword)

      if (candidates.length === 0) {
        return streamText(`"${keyword}" 현장을 찾을 수 없습니다. 현장명을 다시 확인해주세요.`)
      }

      if (candidates.length === 1) {
        siteName = candidates[0]
      } else {
        // 복수 후보 → 클라이언트에서 선택 UI 표시
        return NextResponse.json({ type: 'clarify', candidates })
      }
    }
  }

  // ── Step 3: SQL 생성 ─────────────────────────────────────────
  const sqlPromptContent = siteName
    ? `현장명 "${siteName}"에 대해 다음 질문에 답하는 SQL을 생성하세요:\n${latestUserMessage}`
    : `다음 질문에 답하는 SQL을 생성하세요 (특정 현장 없음):\n${latestUserMessage}`

  const sqlRes = await openai.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 500,
    messages: [
      { role: 'system', content: SQL_SYSTEM_PROMPT },
      { role: 'user', content: sqlPromptContent },
    ],
  })

  const generatedSql = sqlRes.choices[0].message.content?.trim() ?? ''

  // DML 안전 검사
  const upperSql = generatedSql.toUpperCase()
  const dangerKeywords = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'TRUNCATE', 'ALTER', 'CREATE']
  if (dangerKeywords.some((kw) => upperSql.includes(kw))) {
    return streamText('죄송합니다. 데이터 조회 질문만 처리할 수 있습니다.')
  }

  // ── Step 4: Supabase 쿼리 실행 ───────────────────────────────
  let queryResult: Record<string, unknown>[] = []

  const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc(
    'glassflow_execute_select',
    { query: generatedSql }
  )

  if (rpcError) {
    console.error('SQL execution error:', rpcError.message, '\nSQL:', generatedSql)
    return streamText(`SQL 실행 중 오류가 발생했습니다: ${rpcError.message}`)
  }

  queryResult = Array.isArray(rpcData) ? rpcData : (rpcData ?? [])

  // ── Step 5: 한국어 답변 생성 (스트리밍) ─────────────────────
  const resultSummary = queryResult.length === 0
    ? '조회 결과가 없습니다.'
    : JSON.stringify(queryResult.slice(0, 20), null, 2)  // 최대 20건

  const answerStream = await openai.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 1024,
    stream: true,
    messages: [
      { role: 'system', content: ANSWER_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `사용자 질문: "${latestUserMessage}"\n\n조회된 데이터:\n${resultSummary}\n\n위 데이터를 바탕으로 친절하게 답변해주세요.`,
      },
    ],
  })

  // SSE 스트리밍 응답
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of answerStream) {
          const text = chunk.choices[0]?.delta?.content ?? ''
          if (text) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`))
          }
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

function streamText(text: string): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`))
      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      controller.close()
    },
  })
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
