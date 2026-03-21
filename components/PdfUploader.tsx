'use client'

import { useCallback, useState } from 'react'
import { Button } from '@/components/ui/button'

interface Props {
  onUploadComplete: (result: UploadResult) => void
}

interface UploadResult {
  success: boolean
  doc_id: string
  parsed: import('@/types').ParsedPdfResult
  item_count: number
}

export function PdfUploader({ onUploadComplete }: Props) {
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('PDF 파일만 업로드 가능합니다.')
      return
    }

    const MAX_MB = 4
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`파일 크기가 ${MAX_MB}MB를 초과합니다. (현재 ${(file.size / 1024 / 1024).toFixed(1)}MB)`)
      return
    }

    setError(null)
    setFileName(file.name)
    setIsUploading(true)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/upload', { method: 'POST', body: formData })

      let data: { error?: string } = {}
      try {
        data = await res.json()
      } catch {
        // Vercel이 HTML 에러 페이지를 반환한 경우 (예: 413)
      }

      if (!res.ok) {
        setError(data.error ?? `업로드에 실패했습니다. (HTTP ${res.status})`)
        return
      }

      onUploadComplete(data as Parameters<typeof onUploadComplete>[0])
    } catch (e) {
      setError(`네트워크 오류가 발생했습니다. (${e instanceof Error ? e.message : String(e)})`)
    } finally {
      setIsUploading(false)
    }
  }, [onUploadComplete])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  return (
    <div className="space-y-4">
      <label
        htmlFor="pdf-input"
        className={`flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
          isDragging
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 bg-gray-50 hover:bg-gray-100'
        }`}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        {isUploading ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-600">파싱 중... (최대 30초)</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-center px-4">
            <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-sm font-medium text-gray-700">
              {fileName ?? 'PDF 파일을 드래그하거나 클릭하여 업로드'}
            </p>
            <p className="text-xs text-gray-500">발주서 PDF (스캔본 포함)</p>
          </div>
        )}
        <input
          id="pdf-input"
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={handleInputChange}
          disabled={isUploading}
        />
      </label>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  )
}
