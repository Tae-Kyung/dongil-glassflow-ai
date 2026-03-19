'use client'

import { useState } from 'react'
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

export default function UploadPage() {
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null)
  const [editedParsed, setEditedParsed] = useState<ParsedPdfResult | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

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
      if (res.ok) {
        setSaveSuccess(true)
      }
    } finally {
      setIsSaving(false)
    }
  }

  const handleReset = () => {
    setUploadResult(null)
    setEditedParsed(null)
    setSaveSuccess(false)
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">발주서 PDF 업로드</h1>
        <p className="text-sm text-gray-500 mt-1">스캔 발주서를 업로드하면 자동으로 데이터를 추출합니다.</p>
      </div>

      {!uploadResult && (
        <PdfUploader onUploadComplete={handleUploadComplete} />
      )}

      {saveSuccess && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-green-700 font-medium">✓ 저장이 완료되었습니다.</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={handleReset}>
            새 파일 업로드
          </Button>
        </div>
      )}

      {editedParsed && !saveSuccess && (
        <div className="space-y-6">
          {/* 헤더 정보 */}
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
              <div className="md:col-span-1">
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

          {/* 품목 테이블 */}
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
                      <Input
                        className="w-14 text-center h-8 text-sm"
                        value={item.item_no ?? ''}
                        onChange={(e) => handleItemChange(idx, 'item_no', e.target.value)}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-8 text-sm"
                        value={item.item_name ?? ''}
                        onChange={(e) => handleItemChange(idx, 'item_name', e.target.value)}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="w-20 text-center h-8 text-sm"
                        value={item.width_mm ?? ''}
                        onChange={(e) => handleItemChange(idx, 'width_mm', e.target.value)}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="w-20 text-center h-8 text-sm"
                        value={item.height_mm ?? ''}
                        onChange={(e) => handleItemChange(idx, 'height_mm', e.target.value)}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="w-16 text-center h-8 text-sm"
                        value={item.order_qty ?? ''}
                        onChange={(e) => handleItemChange(idx, 'order_qty', e.target.value)}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="w-20 text-center h-8 text-sm"
                        value={item.area_m2 ?? ''}
                        onChange={(e) => handleItemChange(idx, 'area_m2', e.target.value)}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-8 text-sm"
                        value={item.location ?? ''}
                        onChange={(e) => handleItemChange(idx, 'location', e.target.value)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* 버튼 */}
          <div className="flex gap-3">
            <Button onClick={handleSaveConfirm} disabled={isSaving}>
              {isSaving ? '저장 중...' : '저장 확정'}
            </Button>
            <Button variant="outline" onClick={handleReset} disabled={isSaving}>
              다시 업로드
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
