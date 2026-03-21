'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { StatusBadge } from '@/components/StatusBadge'
import { LogPanel } from '@/components/LogPanel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { ItemStatus } from '@/types'

const STATUS_OPTIONS = [
  { value: 'all', label: '전체 상태' },
  { value: 'pending',     label: '생산대기' },
  { value: 'in_progress', label: '생산중' },
  { value: 'produced',    label: '생산완료' },
  { value: 'partial',     label: '일부출고' },
  { value: 'shipped',     label: '출고완료' },
]

interface Filters {
  site_name: string
  customer: string
  status: string
  date_from: string
  date_to: string
  include_past: boolean
}

const today = () => new Date().toISOString().slice(0, 10)

const DEFAULT_FILTERS: Filters = {
  site_name: '', customer: '', status: 'all',
  date_from: '', date_to: '', include_past: false,
}

interface Props {
  refreshKey?: number
}

export function OrdersTable({ refreshKey }: Props = {}) {
  const [items, setItems] = useState<ItemStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [selectedItem, setSelectedItem] = useState<ItemStatus | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [docNoSort, setDocNoSort] = useState<'asc' | 'desc' | null>(null)

  const fetchItems = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (filters.site_name)   params.set('site_name', filters.site_name)
    if (filters.customer)    params.set('customer', filters.customer)
    if (filters.status !== 'all') params.set('status', filters.status)
    if (filters.date_from)   params.set('date_from', filters.date_from)
    if (filters.date_to)     params.set('date_to', filters.date_to)
    if (filters.include_past) params.set('include_past', 'true')

    const res = await fetch(`/api/items?${params}`)
    if (res.ok) setItems(await res.json())
    setLoading(false)
  }, [filters])

  useEffect(() => { fetchItems() }, [fetchItems, refreshKey])

  // Supabase Realtime 구독
  useEffect(() => {
    const channel = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'glassflow_production_logs' }, () => fetchItems())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'glassflow_shipment_logs' }, () => fetchItems())
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [fetchItems])

  const handleRowClick = (item: ItemStatus) => {
    setSelectedItem(item)
    setPanelOpen(true)
  }

  const handleReset = () => { setFilters(DEFAULT_FILTERS); setDocNoSort(null) }

  const sortedItems = docNoSort === null ? items : [...items].sort((a, b) => {
    const cmp = (a.doc_no ?? '').localeCompare(b.doc_no ?? '', undefined, { numeric: true })
    return docNoSort === 'asc' ? cmp : -cmp
  })

  return (
    <div className="space-y-4">
      {/* 기본 검색 바 */}
      <div className="flex gap-2 flex-wrap">
        <Input
          placeholder="현장명 검색"
          value={filters.site_name}
          onChange={(e) => setFilters({ ...filters, site_name: e.target.value })}
          className="w-48"
        />
        <Input
          placeholder="거래처 검색"
          value={filters.customer}
          onChange={(e) => setFilters({ ...filters, customer: e.target.value })}
          className="w-40"
        />
        <Select value={filters.status} onValueChange={(v) => setFilters({ ...filters, status: v ?? 'all' })}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
          <input type="checkbox" checked={filters.include_past}
            onChange={(e) => setFilters({ ...filters, include_past: e.target.checked })} />
          이전 데이터 포함
        </label>
        <Button variant="outline" size="sm" onClick={() => setShowAdvanced((v) => !v)}>
          {showAdvanced ? '▲ 접기' : '▼ 고급검색'}
        </Button>
        <Button variant="ghost" size="sm" onClick={handleReset}>초기화</Button>
      </div>

      {/* 고급 검색 */}
      {showAdvanced && (
        <div className="flex gap-2 flex-wrap p-3 bg-gray-50 rounded-lg border">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600 whitespace-nowrap">납기일</span>
            <Input type="date" value={filters.date_from}
              onChange={(e) => setFilters({ ...filters, date_from: e.target.value })}
              className="w-40" />
            <span className="text-gray-400">~</span>
            <Input type="date" value={filters.date_to}
              onChange={(e) => setFilters({ ...filters, date_to: e.target.value })}
              className="w-40" />
          </div>
        </div>
      )}

      {/* 결과 카운트 */}
      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>
          {loading ? '로딩 중...' : `${items.length}건`}
          {!filters.include_past && !filters.date_from && (
            <span className="ml-1 text-gray-400">(납기 {today()} 이후)</span>
          )}
        </span>
      </div>

      {/* 테이블 */}
      <div className="border rounded-xl overflow-hidden bg-white">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50 hover:bg-gray-50">
              <TableHead
                className="w-24 cursor-pointer select-none hover:bg-gray-100"
                onClick={() => setDocNoSort((s) => s === 'asc' ? 'desc' : 'asc')}
              >
                의뢰번호 {docNoSort === 'asc' ? '↑' : docNoSort === 'desc' ? '↓' : '↕'}
              </TableHead>
              <TableHead className="min-w-[140px]">현장명</TableHead>
              <TableHead className="w-28">거래처</TableHead>
              <TableHead className="min-w-[160px]">품명</TableHead>
              <TableHead className="w-24 text-center">규격(mm)</TableHead>
              <TableHead className="w-16 text-center">수량</TableHead>
              <TableHead className="w-16 text-center">생산</TableHead>
              <TableHead className="w-16 text-center">출고</TableHead>
              <TableHead className="w-16 text-center">미출</TableHead>
              <TableHead className="w-24 text-center">상태</TableHead>
              <TableHead className="w-24 text-center">납기일</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center py-12 text-gray-400">
                  로딩 중...
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center py-12 text-gray-400">
                  해당 조건의 데이터가 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              sortedItems.map((item) => (
                <TableRow
                  key={item.id}
                  className="cursor-pointer hover:bg-blue-50 transition-colors"
                  onClick={() => handleRowClick(item)}
                >
                  <TableCell className="text-xs text-gray-500">{item.doc_no}</TableCell>
                  <TableCell className="text-sm font-medium max-w-[140px] truncate" title={item.site_name}>
                    {item.site_name}
                  </TableCell>
                  <TableCell className="text-xs text-gray-600 max-w-[110px] truncate" title={item.customer ?? ''}>
                    {item.customer ?? '-'}
                  </TableCell>
                  <TableCell className="text-xs max-w-[160px] truncate" title={item.item_name ?? ''}>
                    {item.item_name ?? '-'}
                  </TableCell>
                  <TableCell className="text-xs text-center text-gray-600">
                    {item.width_mm && item.height_mm ? `${item.width_mm}×${item.height_mm}` : '-'}
                  </TableCell>
                  <TableCell className="text-center text-sm font-medium">{item.order_qty}</TableCell>
                  <TableCell className="text-center text-sm">{item.total_produced_qty}</TableCell>
                  <TableCell className="text-center text-sm">{item.total_shipped_qty}</TableCell>
                  <TableCell className={`text-center text-sm font-semibold ${item.pending_qty > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                    {item.pending_qty}
                  </TableCell>
                  <TableCell className="text-center">
                    <StatusBadge status={item.status} />
                  </TableCell>
                  <TableCell className="text-center text-xs text-gray-600">{item.due_date ?? '-'}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <LogPanel
        item={selectedItem}
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        onUpdated={fetchItems}
      />
    </div>
  )
}
