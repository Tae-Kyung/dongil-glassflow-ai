import { ChatInterface } from '@/components/ChatInterface'
import { LogoutButton } from '@/components/LogoutButton'
import Link from 'next/link'

export default function ChatPage() {
  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* 헤더 */}
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between shrink-0">
        <Link href="/dashboard" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white text-sm font-bold">G</span>
          </div>
          <div>
            <h1 className="font-bold text-gray-900 text-lg leading-tight">GlassFlow AI</h1>
            <p className="text-xs text-gray-500">동일유리 발주·생산·출고 현황</p>
          </div>
        </Link>
        <nav className="flex gap-3">
          <Link
            href="/dashboard"
            className="text-sm text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            대시보드
          </Link>
          <Link
            href="/analytics"
            className="text-sm text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            경영 현황
          </Link>
          <Link
            href="/upload"
            className="text-sm text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg transition-colors"
          >
            발주서 업로드
          </Link>
          <LogoutButton />
        </nav>
      </header>

      {/* 챗봇 */}
      <main className="flex-1 overflow-hidden max-w-3xl w-full mx-auto">
        <ChatInterface />
      </main>
    </div>
  )
}
