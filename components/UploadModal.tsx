'use client'

import { useState, useRef } from 'react'
import { PdfUploader } from '@/components/PdfUploader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
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

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

type Mode = 'pdf' | 'excel' | 'manual'

const EMPTY_ITEM = (): ParsedPdfItem => ({
  item_no: null,
  item_name: null,
  width_mm: null,
  height_mm: null,
  order_qty: null,
  area_m2: null,
  location: null,
})

const EMPTY_FORM = (): ParsedPdfResult => ({
  doc_no: '',
  customer: null,
  site_name: '',
  request_date: null,
  due_date: null,
  items: [EMPTY_ITEM()],
})

export function UploadModal({ open, onOpenChange, onSuccess }: Props) {
  const [mode, setMode] = useState<Mode>('pdf')

  // PDF 모드 상태
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null)
  const [editedParsed, setEditedParsed] = useState<ParsedPdfResult | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [pdfSaveSuccess, setPdfSaveSuccess] = useState(false)

  // 엑셀 모드 상태
  const [excelFile, setExcelFile] = useState<File | null>(null)
  const [excelUploading, setExcelUploading] = useState(false)
  const [excelResult, setExcelResult] = useState<ExcelUploadResult | null>(null)
  const [excelError, setExcelError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 직접 입력 모드 상태
  const [manualForm, setManualForm] = useState<ParsedPdfResult>(EMPTY_FORM())
  const [manualSaving, setManualSaving] = useState(false)
  const [manualError, setManualError] = useState<string | null>(null)
  const [manualSuccess, setManualSuccess] = useState(false)

  // --- PDF 핸들러 ---
  const handleUploadComplete = (result: UploadResult) => {
    setUploadResult(result)
    setEditedParsed(structuredClone(result.parsed))
    setPdfSaveSuccess(false)
  }

  const handlePdfHeaderChange = (field: keyof ParsedPdfResult, value: string) => {
    if (!editedParsed) return
    setEditedParsed({ ...editedParsed, [field]: value || null })
  }

  const handlePdfItemChange = (index: number, field: keyof ParsedPdfItem, value: string) => {
    if (!editedParsed) return
    const items = [...editedParsed.items]
    items[index] = applyItemField(items[index], field, value)
    setEditedParsed({ ...editedParsed, items })
  }

  const handlePdfSave = async () => {
    if (!editedParsed || !uploadResult) return
    setIsSaving(true)
    try {
      const res = await fetch(`/api/docs/${uploadResult.doc_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editedParsed),
      })
      if (res.ok) { setPdfSaveSuccess(true); onSuccess() }
    } finally {
      setIsSaving(false)
    }
  }

  const handlePdfReset = () => {
    setUploadResult(null)
    setEditedParsed(null)
    setPdfSaveSuccess(false)
  }

  // --- 직접 입력 핸들러 ---
  const handleManualHeaderChange = (field: keyof ParsedPdfResult, value: string) => {
    setManualForm((f) => ({ ...f, [field]: value || null }))
    setManualError(null)
  }

  const handleManualItemChange = (index: number, field: keyof ParsedPdfItem, value: string) => {
    setManualForm((f) => {
      const items = [...f.items]
      items[index] = applyItemField(items[index], field, value)
      return { ...f, items }
    })
  }

  const handleAddRow = () => {
    setManualForm((f) => ({ ...f, items: [...f.items, EMPTY_ITEM()] }))
  }

  const handleRemoveRow = (index: number) => {
    setManualForm((f) => ({
      ...f,
      items: f.items.length > 1 ? f.items.filter((_, i) => i !== index) : f.items,
    }))
  }

  const handleManualSave = async () => {
    setManualError(null)
    if (!manualForm.doc_no?.trim()) { setManualError('의뢰번호를 입력해 주세요.'); return }
    if (!manualForm.site_name?.trim()) { setManualError('현장명을 입력해 주세요.'); return }

    setManualSaving(true)
    try {
      const res = await fetch('/api/docs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(manualForm),
      })
      const data = await res.json()
      if (!res.ok) { setManualError(data.error ?? '저장에 실패했습니다.'); return }
      setManualSuccess(true)
      onSuccess()
    } finally {
      setManualSaving(false)
    }
  }

  const handleManualReset = () => {
    setManualForm(EMPTY_FORM())
    setManualError(null)
    setManualSuccess(false)
  }

  // --- 엑셀 핸들러 ---
  const handleExcelFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setExcelFile(e.target.files?.[0] ?? null)
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
        onSuccess()
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

  // --- 공통 ---
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      handlePdfReset()
      handleManualReset()
      handleExcelReset()
    }
    onOpenChange(nextOpen)
  }

  const switchMode = (m: Mode) => {
    setMode(m)
    handlePdfReset()
    handleManualReset()
    handleExcelReset()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-5xl sm:max-w-4xl max-h-[90vh] overflow-y-auto" showCloseButton>
        <DialogHeader>
          <DialogTitle>발주서 등록</DialogTitle>
        </DialogHeader>

        {/* 탭 */}
        <div className="flex gap-1 p-1 bg-gray-100 rounded-lg w-fit">
          <button
            onClick={() => switchMode('pdf')}
            className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
              mode === 'pdf' ? 'bg-white shadow-sm font-medium text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            PDF 업로드
          </button>
          <button
            onClick={() => switchMode('excel')}
            className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
              mode === 'excel' ? 'bg-white shadow-sm font-medium text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            엑셀 업로드
          </button>
          <button
            onClick={() => switchMode('manual')}
            className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
              mode === 'manual' ? 'bg-white shadow-sm font-medium text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            직접 입력
          </button>
        </div>

        {/* PDF 모드 */}
        {mode === 'pdf' && (
          <div className="space-y-6">
            {!uploadResult && <PdfUploader onUploadComplete={handleUploadComplete} />}

            {pdfSaveSuccess && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-green-700 font-medium">✓ 저장이 완료되었습니다.</p>
                <div className="flex gap-2 mt-2">
                  <Button variant="outline" size="sm" onClick={handlePdfReset}>새 파일 업로드</Button>
                  <Button size="sm" onClick={() => handleOpenChange(false)}>닫기</Button>
                </div>
              </div>
            )}

            {editedParsed && !pdfSaveSuccess && (
              <div className="space-y-6">
                <HeaderForm parsed={editedParsed} onChange={handlePdfHeaderChange} prefix="pdf" />
                <ItemsTable
                  items={editedParsed.items}
                  onItemChange={handlePdfItemChange}
                  showRemove={false}
                />
                <div className="flex gap-3">
                  <Button onClick={handlePdfSave} disabled={isSaving}>
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

        {/* 엑셀 모드 */}
        {mode === 'excel' && (
          <div className="space-y-4">
            <div className="border rounded-xl p-5 bg-white space-y-4">
              <div>
                <p className="text-sm font-medium text-gray-800 mb-1">발주현황 엑셀 업로드</p>
                <p className="text-xs text-gray-500">
                  <strong>발주현황</strong> 시트가 포함된 .xlsx 파일을 업로드하세요.
                  이미 등록된 의뢰번호는 자동으로 갱신됩니다.
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleExcelFileChange}
                className="block text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-gray-300 file:text-sm file:bg-white file:text-gray-700 hover:file:bg-gray-50"
              />
              {excelError && (
                <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{excelError}</p>
              )}
              <div className="flex gap-3">
                <Button onClick={handleExcelUpload} disabled={!excelFile || excelUploading}>
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
              <div className="p-4 bg-green-50 border border-green-200 rounded-xl space-y-2">
                <p className="font-semibold text-green-800">✓ 업로드 완료</p>
                <div className="flex gap-4 text-sm text-green-700">
                  <span>전체: <strong>{excelResult.total}행</strong></span>
                  <span>신규: <strong>{excelResult.inserted}건</strong></span>
                  <span>갱신: <strong>{excelResult.updated}건</strong></span>
                  {excelResult.errors > 0 && (
                    <span className="text-red-600">오류: <strong>{excelResult.errors}건</strong></span>
                  )}
                </div>
                <Button size="sm" onClick={() => handleOpenChange(false)} className="mt-1">닫기</Button>
              </div>
            )}
          </div>
        )}

        {/* 직접 입력 모드 */}
        {mode === 'manual' && (
          <div className="space-y-6">
            {manualSuccess ? (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-green-700 font-medium">✓ 저장이 완료되었습니다.</p>
                <div className="flex gap-2 mt-2">
                  <Button variant="outline" size="sm" onClick={handleManualReset}>새로 입력</Button>
                  <Button size="sm" onClick={() => handleOpenChange(false)}>닫기</Button>
                </div>
              </div>
            ) : (
              <>
                <HeaderForm parsed={manualForm} onChange={handleManualHeaderChange} prefix="manual" />
                <ItemsTable
                  items={manualForm.items}
                  onItemChange={handleManualItemChange}
                  showRemove
                  onRemoveRow={handleRemoveRow}
                />
                <Button variant="outline" size="sm" onClick={handleAddRow}>
                  + 품목 행 추가
                </Button>
                {manualError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                    {manualError}
                  </div>
                )}
                <div className="flex gap-3">
                  <Button onClick={handleManualSave} disabled={manualSaving}>
                    {manualSaving ? '저장 중...' : '저장'}
                  </Button>
                  <Button variant="outline" onClick={handleManualReset} disabled={manualSaving}>
                    초기화
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// --- 공유 서브컴포넌트 ---

function applyItemField(item: ParsedPdfItem, field: keyof ParsedPdfItem, value: string): ParsedPdfItem {
  const numFields: (keyof ParsedPdfItem)[] = ['item_no', 'width_mm', 'height_mm', 'order_qty', 'area_m2']
  return {
    ...item,
    [field]: numFields.includes(field) ? (value === '' ? null : Number(value)) : (value || null),
  }
}

function HeaderForm({
  parsed,
  onChange,
  prefix,
}: {
  parsed: ParsedPdfResult
  onChange: (field: keyof ParsedPdfResult, value: string) => void
  prefix: string
}) {
  return (
    <div className="border rounded-xl p-5 space-y-4 bg-white">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-800">기본 정보</h2>
        <Badge variant="secondary">{parsed.items.length}개 품목</Badge>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div>
          <Label htmlFor={`${prefix}-doc_no`}>의뢰번호 *</Label>
          <Input id={`${prefix}-doc_no`} value={parsed.doc_no ?? ''}
            onChange={(e) => onChange('doc_no', e.target.value)} />
        </div>
        <div>
          <Label htmlFor={`${prefix}-customer`}>업체명</Label>
          <Input id={`${prefix}-customer`} value={parsed.customer ?? ''}
            onChange={(e) => onChange('customer', e.target.value)} />
        </div>
        <div>
          <Label htmlFor={`${prefix}-site_name`}>현장명 *</Label>
          <Input id={`${prefix}-site_name`} value={parsed.site_name ?? ''}
            onChange={(e) => onChange('site_name', e.target.value)} />
        </div>
        <div>
          <Label htmlFor={`${prefix}-request_date`}>의뢰일자</Label>
          <Input id={`${prefix}-request_date`} type="date" value={parsed.request_date ?? ''}
            onChange={(e) => onChange('request_date', e.target.value)} />
        </div>
        <div>
          <Label htmlFor={`${prefix}-due_date`}>납품일자</Label>
          <Input id={`${prefix}-due_date`} type="date" value={parsed.due_date ?? ''}
            onChange={(e) => onChange('due_date', e.target.value)} />
        </div>
      </div>
    </div>
  )
}

function ItemsTable({
  items,
  onItemChange,
  showRemove,
  onRemoveRow,
}: {
  items: ParsedPdfItem[]
  onItemChange: (index: number, field: keyof ParsedPdfItem, value: string) => void
  showRemove: boolean
  onRemoveRow?: (index: number) => void
}) {
  return (
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
            {showRemove && <TableHead className="w-10" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item, idx) => (
            <TableRow key={idx}>
              <TableCell>
                <Input className="w-14 text-center h-8 text-sm" value={item.item_no ?? ''}
                  onChange={(e) => onItemChange(idx, 'item_no', e.target.value)} />
              </TableCell>
              <TableCell>
                <Input className="h-8 text-sm" value={item.item_name ?? ''}
                  onChange={(e) => onItemChange(idx, 'item_name', e.target.value)} />
              </TableCell>
              <TableCell>
                <Input className="w-20 text-center h-8 text-sm" value={item.width_mm ?? ''}
                  onChange={(e) => onItemChange(idx, 'width_mm', e.target.value)} />
              </TableCell>
              <TableCell>
                <Input className="w-20 text-center h-8 text-sm" value={item.height_mm ?? ''}
                  onChange={(e) => onItemChange(idx, 'height_mm', e.target.value)} />
              </TableCell>
              <TableCell>
                <Input className="w-16 text-center h-8 text-sm" value={item.order_qty ?? ''}
                  onChange={(e) => onItemChange(idx, 'order_qty', e.target.value)} />
              </TableCell>
              <TableCell>
                <Input className="w-20 text-center h-8 text-sm" value={item.area_m2 ?? ''}
                  onChange={(e) => onItemChange(idx, 'area_m2', e.target.value)} />
              </TableCell>
              <TableCell>
                <Input className="h-8 text-sm" value={item.location ?? ''}
                  onChange={(e) => onItemChange(idx, 'location', e.target.value)} />
              </TableCell>
              {showRemove && (
                <TableCell>
                  <button
                    onClick={() => onRemoveRow?.(idx)}
                    disabled={items.length === 1}
                    className="text-gray-400 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed text-lg leading-none"
                    aria-label="행 삭제"
                  >
                    ×
                  </button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
