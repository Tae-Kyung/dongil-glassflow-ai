'use client'

import { useState, useRef } from 'react'
import { PdfUploader } from '@/components/PdfUploader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import type { ParsedPdfResult, ParsedPdfItem } from '@/types'

interface UploadResult {
  success: boolean
  doc_id: string
  parsed: ParsedPdfResult
  item_count: number
}

interface ExcelUploadResult {
  success: boolean
  total: number
  inserted: number
  updated: number
  errors: number
}

type Tab = 'pdf' | 'excel'

export default function UploadPage() {
  const [tab, setTab] = useState<Tab>('pdf')

  // PDF 상태
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null)
  const [editedParsed, setEditedParsed] = useState<ParsedPdfResult | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Excel 상태
  const [excelFile, setExcelFile] = useState<File | null>(null)
  const [excelUploading, setExcelUploading] = useState(false)
  const [excelResult, setExcelResult] = useState<ExcelUploadResult | null>(null)
  const [excelError, setExcelError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // PDF 핸들러
  const handleUploadComplete = (result: UploadResult) => {
    setUploadResult(result)
    setEditedParsed(structuredClone(result.parsed))
    setSaveSuccess(false)
  }

  const handleHeaderChange = (field: keyof ParsedPdfResult, value: string) => {
    if (!editedParsed) return
    setEditedParsed({ ...editedParsed, [field]: value || null })
  }

  const handleItemChange = (index: number, field: keyof ParsedPdfItem, value: string) => {
    if (!editedParsed) return
    const items = [...editedParsed.items]
    const numFields: (keyof ParsedPdfItem)[] = ['item_no', 'width_mm', 'height_mm', 'order_qty', 'area_m2']
    items[index] = {
      ...items[index],
      [field]: numFields.includes(field) ? (value === '' ? null : Number(value)) : (value || null),
    }
    setEditedParsed({ ...editedParsed, items })
  }

  const handleSaveConfirm = async () => {
    if (!editedParsed || !uploadResult) return
    setIsSaving(true)
    try {
      const res = await fetch(`/api/docs/${uploadResult.doc_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editedParsed),
      })
      if (res.ok) setSaveSuccess(true)
    } finally {
      setIsSaving(false)
    }
  }

  const handlePdfReset = () => {
    setUploadResult(null)
    setEditedParsed(null)
    setSaveSuccess(false)
  }

  // Excel 핸들러
  const handleExcelFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null
    setExcelFile(file)
    setExcelResult(null)
    setExcelError(null)
  }

  const handleExcelUpload = async () => {
    if (!excelFile) return
    setExcelUploading(true)
    setExcelResult(null)
    setExcelError(null)
    try {
      const formData = new FormData()
      formData.append('file', excelFile)
      const res = await fetch('/api/upload-excel', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) {
        setExcelError(data.error ?? '업로드 중 오류가 발생했습니다.')
      } else {
        setExcelResult(data)
        setExcelFile(null)
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    } catch {
      setExcelError('네트워크 오류가 발생했습니다.')
    } finally {
      setExcelUploading(false)
    }
  }

  const handleExcelReset = () => {
    setExcelFile(null)
    setExcelResult(null)
    setExcelError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">발주서 업로드</h1>
        <p className="text-sm text-gray-500 mt-1">PDF 또는 엑셀 파일로 발주 데이터를 등록합니다.</p>
      </div>

      {/* 탭 */}
      <div className="flex border-b">
        <button
          onClick={() => setTab('pdf')}
          className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === 'pdf'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          PDF 업로드
        </button>
        <button
          onClick={() => setTab('excel')}
          className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === 'excel'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          엑셀 업로드
        </button>
      </div>

      {/* PDF 탭 */}
      {tab === 'pdf' && (
        <div className="space-y-6">
          {!uploadResult && (
            <PdfUploader onUploadComplete={handleUploadComplete} />
          )}

          {saveSuccess && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-green-700 font-medium">✓ 저장이 완료되었습니다.</p>
              <Button variant="outline" size="sm" className="mt-2" onClick={handlePdfReset}>
                새 파일 업로드
              </Button>
            </div>
          )}

          {editedParsed && !saveSuccess && (
            <div className="space-y-6">
              <div className="border rounded-xl p-5 space-y-4 bg-white">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-gray-800">파싱 결과 미리보기</h2>
                  <Badge variant="secondary">{editedParsed.items.length}개 품목</Badge>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="doc_no">의뢰번호</Label>
                    <Input id="doc_no" value={editedParsed.doc_no ?? ''}
                      onChange={(e) => handleHeaderChange('doc_no', e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="customer">업체명</Label>
                    <Input id="customer" value={editedParsed.customer ?? ''}
                      onChange={(e) => handleHeaderChange('customer', e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="site_name">현장명</Label>
                    <Input id="site_name" value={editedParsed.site_name ?? ''}
                      onChange={(e) => handleHeaderChange('site_name', e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="request_date">의뢰일자</Label>
                    <Input id="request_date" type="date" value={editedParsed.request_date ?? ''}
                      onChange={(e) => handleHeaderChange('request_date', e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="due_date">납품일자</Label>
                    <Input id="due_date" type="date" value={editedParsed.due_date ?? ''}
                      onChange={(e) => handleHeaderChange('due_date', e.target.value)} />
                  </div>
                </div>
              </div>

              <div className="border rounded-xl overflow-hidden bg-white">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50">
                      <TableHead className="w-12 text-center">No</TableHead>
                      <TableHead className="min-w-[200px]">품명</TableHead>
                      <TableHead className="w-20 text-center">W(mm)</TableHead>
                      <TableHead className="w-20 text-center">H(mm)</TableHead>
                      <TableHead className="w-16 text-center">수량</TableHead>
                      <TableHead className="w-20 text-center">면적(㎡)</TableHead>
                      <TableHead className="min-w-[140px]">비고</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {editedParsed.items.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell>
                          <Input className="w-14 text-center h-8 text-sm" value={item.item_no ?? ''}
                            onChange={(e) => handleItemChange(idx, 'item_no', e.target.value)} />
                        </TableCell>
                        <TableCell>
                          <Input className="h-8 text-sm" value={item.item_name ?? ''}
                            onChange={(e) => handleItemChange(idx, 'item_name', e.target.value)} />
                        </TableCell>
                        <TableCell>
                          <Input className="w-20 text-center h-8 text-sm" value={item.width_mm ?? ''}
                            onChange={(e) => handleItemChange(idx, 'width_mm', e.target.value)} />
                        </TableCell>
                        <TableCell>
                          <Input className="w-20 text-center h-8 text-sm" value={item.height_mm ?? ''}
                            onChange={(e) => handleItemChange(idx, 'height_mm', e.target.value)} />
                        </TableCell>
                        <TableCell>
                          <Input className="w-16 text-center h-8 text-sm" value={item.order_qty ?? ''}
                            onChange={(e) => handleItemChange(idx, 'order_qty', e.target.value)} />
                        </TableCell>
                        <TableCell>
                          <Input className="w-20 text-center h-8 text-sm" value={item.area_m2 ?? ''}
                            onChange={(e) => handleItemChange(idx, 'area_m2', e.target.value)} />
                        </TableCell>
                        <TableCell>
                          <Input className="h-8 text-sm" value={item.location ?? ''}
                            onChange={(e) => handleItemChange(idx, 'location', e.target.value)} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex gap-3">
                <Button onClick={handleSaveConfirm} disabled={isSaving}>
                  {isSaving ? '저장 중...' : '저장 확정'}
                </Button>
                <Button variant="outline" onClick={handlePdfReset} disabled={isSaving}>
                  다시 업로드
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 엑셀 탭 */}
      {tab === 'excel' && (
        <div className="space-y-6">
          <div className="border rounded-xl p-6 bg-white space-y-4">
            <div>
              <h2 className="font-semibold text-gray-800 mb-1">발주현황 엑셀 업로드</h2>
              <p className="text-sm text-gray-500">
                <strong>발주현황</strong> 시트가 포함된 .xlsx 파일을 업로드하세요.
                이미 등록된 의뢰번호는 자동으로 갱신됩니다.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleExcelFileChange}
                className="block text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-gray-300 file:text-sm file:bg-white file:text-gray-700 hover:file:bg-gray-50"
              />
              {excelFile && (
                <span className="text-sm text-gray-500">{excelFile.name}</span>
              )}
            </div>

            {excelError && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{excelError}</p>
            )}

            <div className="flex gap-3">
              <Button
                onClick={handleExcelUpload}
                disabled={!excelFile || excelUploading}
              >
                {excelUploading ? '업로드 중...' : '업로드'}
              </Button>
              {(excelFile || excelResult) && (
                <Button variant="outline" onClick={handleExcelReset} disabled={excelUploading}>
                  초기화
                </Button>
              )}
            </div>
          </div>

          {excelResult && (
            <div className="p-5 bg-green-50 border border-green-200 rounded-xl space-y-2">
              <p className="font-semibold text-green-800">✓ 업로드 완료</p>
              <div className="flex gap-4 text-sm text-green-700">
                <span>전체 처리: <strong>{excelResult.total}행</strong></span>
                <span>신규 등록: <strong>{excelResult.inserted}건</strong></span>
                <span>갱신: <strong>{excelResult.updated}건</strong></span>
                {excelResult.errors > 0 && (
                  <span className="text-red-600">오류: <strong>{excelResult.errors}건</strong></span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
