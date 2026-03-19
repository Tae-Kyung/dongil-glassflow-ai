'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import type { ChatMessage } from '@/types'

interface DisplayMessage {
  role: 'user' | 'assistant'
  content: string
  type?: 'clarify'
  candidates?: string[]
}

export function ChatInterface() {
  const [messages, setMessages] = useState<DisplayMessage[]>([
    {
      role: 'assistant',
      content: '안녕하세요! 동일유리 발주 현황 AI입니다.\n"울산다운2 현장 미출 유리 언제 나와요?" 처럼 자연어로 질문해주세요.',
    },
  ])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [confirmedSite, setConfirmedSite] = useState<string | undefined>()
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = useCallback(async (userText: string, overrideSite?: string) => {
    if (!userText.trim() || isLoading) return

    const newUserMsg: DisplayMessage = { role: 'user', content: userText }
    const updatedMessages = [...messages, newUserMsg]
    setMessages(updatedMessages)
    setInput('')
    setIsLoading(true)

    // 스트리밍 assistant 메시지 placeholder
    const assistantIdx = updatedMessages.length
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }])

    const apiMessages: ChatMessage[] = updatedMessages
      .filter((m) => !m.candidates)
      .map((m) => ({ role: m.role, content: m.content }))

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: apiMessages,
          confirmed_site: overrideSite ?? confirmedSite,
        }),
      })

      // 복수 후보 (clarify) 응답
      if (res.headers.get('content-type')?.includes('application/json')) {
        const data = await res.json()
        if (data.type === 'clarify') {
          setMessages((prev) => {
            const next = [...prev]
            next[assistantIdx] = {
              role: 'assistant',
              content: '어느 현장을 말씀하시는 건가요?',
              type: 'clarify',
              candidates: data.candidates,
            }
            return next
          })
          setIsLoading(false)
          return
        }
      }

      // SSE 스트리밍 응답
      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value, { stream: true })
          const lines = chunk.split('\n')

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const payload = line.slice(6).trim()
              if (payload === '[DONE]') break
              try {
                const { text } = JSON.parse(payload)
                accumulated += text
                setMessages((prev) => {
                  const next = [...prev]
                  next[assistantIdx] = { role: 'assistant', content: accumulated }
                  return next
                })
              } catch {
                // ignore parse errors
              }
            }
          }
        }
      }
    } catch {
      setMessages((prev) => {
        const next = [...prev]
        next[assistantIdx] = { role: 'assistant', content: '오류가 발생했습니다. 다시 시도해주세요.' }
        return next
      })
    } finally {
      setIsLoading(false)
      setConfirmedSite(undefined)
    }
  }, [messages, isLoading, confirmedSite])

  const handleCandidateSelect = (candidate: string) => {
    setConfirmedSite(candidate)
    // 마지막 사용자 메시지를 다시 전송 (선택한 현장명으로)
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')?.content ?? ''
    sendMessage(lastUserMsg, candidate)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    sendMessage(input)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* 메시지 목록 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] ${msg.role === 'user' ? 'order-1' : ''}`}>
              {msg.role === 'assistant' && (
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center">
                    <span className="text-white text-xs font-bold">AI</span>
                  </div>
                  <span className="text-xs text-gray-500">동일유리 AI</span>
                </div>
              )}
              <div
                className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white rounded-tr-sm'
                    : 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm shadow-sm'
                }`}
              >
                {msg.content || (
                  <span className="flex gap-1 items-center text-gray-400">
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </span>
                )}
              </div>

              {/* 현장 후보 선택 버튼 */}
              {msg.type === 'clarify' && msg.candidates && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {msg.candidates.map((c) => (
                    <button
                      key={c}
                      onClick={() => handleCandidateSelect(c)}
                      disabled={isLoading}
                      className="px-3 py-1.5 text-sm bg-blue-50 border border-blue-300 text-blue-700 rounded-full hover:bg-blue-100 transition-colors disabled:opacity-50"
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* 입력창 */}
      <div className="border-t bg-white p-4">
        <form onSubmit={handleSubmit} className="flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="현장명과 함께 질문해주세요. (예: 부산 메디컬 현장 미출 유리 있어?)"
            rows={1}
            disabled={isLoading}
            className="flex-1 resize-none rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 max-h-32 overflow-y-auto"
            style={{ lineHeight: '1.5' }}
          />
          <Button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="rounded-xl h-10 px-4 bg-blue-600 hover:bg-blue-700"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </Button>
        </form>
        <p className="text-xs text-gray-400 mt-2 text-center">Enter로 전송 · Shift+Enter로 줄바꿈</p>
      </div>
    </div>
  )
}
