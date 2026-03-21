'use client'

import { useCallback, useState } from 'react'

interface Props {
  onUploadComplete: (result: UploadResult) => void
}

interface UploadResult {
  success: boolean
  doc_id: string
  parsed: import('@/types').ParsedPdfResult
  item_count: number
}

type UploadStep = 'idle' | 'uploading' | 'parsing' | 'done'

const STEP_LABEL: Record<UploadStep, string> = {
  idle: '',
  uploading: '파일 업로드 중...',
  parsing: 'AI 파싱 중... (최대 60초)',
  done: '',
}

export function PdfUploader({ onUploadComplete }: Props) {
  const [isDragging, setIsDragging] = useState(false)
  const [step, setStep] = useState<UploadStep>('idle')
  const [error, setError] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('PDF 파일만 업로드 가능합니다.')
      return
    }

    setError(null)
    setFileName(file.name)

    try {
      // 1단계: 서명된 업로드 URL 발급
      setStep('uploading')
      const urlRes = await fetch('/api/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name }),
      })
      if (!urlRes.ok) {
        const d = await urlRes.json().catch(() => ({}))
        setError(d.error ?? `업로드 URL 발급 실패 (HTTP ${urlRes.status})`)
        return
      }
      const { signedUrl, storagePath } = await urlRes.json()

      // 2단계: Supabase Storage에 직접 업로드 (크기 제한 없음)
      const putRes = await fetch(signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/pdf' },
        body: file,
      })
      if (!putRes.ok) {
        setError(`Storage 업로드 실패 (HTTP ${putRes.status})`)
        return
      }

      // 3단계: 서버에서 AI 파싱 + DB 저장
      setStep('parsing')
      const parseRes = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storagePath }),
      })

      let data: { error?: string } = {}
      try { data = await parseRes.json() } catch { /* HTML 에러 페이지 대비 */ }

      if (!parseRes.ok) {
        setError(data.error ?? `파싱 실패 (HTTP ${parseRes.status})`)
        return
      }

      setStep('done')
      onUploadComplete(data as UploadResult)
    } catch (e) {
      setError(`오류가 발생했습니다. (${e instanceof Error ? e.message : String(e)})`)
    } finally {
      setStep('idle')
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

  const isUploading = step !== 'idle' && step !== 'done'

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
            <p className="text-sm text-gray-600">{STEP_LABEL[step]}</p>
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
            <p className="text-xs text-gray-500">발주서 PDF (스캔본 포함, 크기 제한 없음)</p>
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
