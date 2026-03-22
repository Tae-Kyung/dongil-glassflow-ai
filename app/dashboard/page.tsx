'use client'

import { useState } from 'react'
import { OrdersTable } from '@/components/OrdersTable'
import { StatsBar } from '@/components/StatsBar'
import { UploadModal } from '@/components/UploadModal'
import Link from 'next/link'

export default function DashboardPage() {
  const [modalOpen, setModalOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white text-sm font-bold">G</span>
          </div>
          <div>
            <h1 className="font-bold text-gray-900 text-lg leading-tight">GlassFlow AI</h1>
            <p className="text-xs text-gray-500">담당자 대시보드</p>
          </div>
        </div>
        <nav className="flex gap-3">
          <Link
            href="/"
            className="text-sm text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            챗봇
          </Link>
          <button
            onClick={() => setModalOpen(true)}
            className="text-sm text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg transition-colors"
          >
            발주서 업로드
          </button>
        </nav>
      </header>

      {/* 메인 */}
      <main className="p-6">
        <StatsBar />
        <div className="mb-6">
          <h2 className="text-xl font-bold text-gray-900">발주 현황</h2>
          <p className="text-sm text-gray-500 mt-1">행 클릭 시 생산·출고 로그를 입력할 수 있습니다.</p>
        </div>
        <OrdersTable refreshKey={refreshKey} />
      </main>

      <UploadModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        onSuccess={() => setRefreshKey((k) => k + 1)}
      />
    </div>
  )
}
