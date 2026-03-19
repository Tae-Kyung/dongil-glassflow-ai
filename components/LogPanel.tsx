'use client'

import { useState, useEffect, useCallback } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { StatusBadge } from '@/components/StatusBadge'
import type { ItemStatus, ProductionLog, ShipmentLog } from '@/types'

interface Props {
  item: ItemStatus | null
  open: boolean
  onClose: () => void
  onUpdated: () => void
}

type LogType = 'production' | 'shipment'

interface LogForm {
  date: string
  qty: string
  note: string
  is_completed: boolean
}

const EMPTY_FORM: LogForm = { date: '', qty: '', note: '', is_completed: false }

export function LogPanel({ item, open, onClose, onUpdated }: Props) {
  const [prodLogs, setProdLogs] = useState<ProductionLog[]>([])
  const [shipLogs, setShipLogs] = useState<ShipmentLog[]>([])
  const [activeTab, setActiveTab] = useState<LogType>('production')
  const [addForm, setAddForm] = useState<LogForm>(EMPTY_FORM)
  const [editingSeq, setEditingSeq] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<LogForm>(EMPTY_FORM)
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: LogType; seq: number } | null>(null)
  const [saving, setSaving] = useState(false)

  const fetchLogs = useCallback(async () => {
    if (!item) return
    const [pRes, sRes] = await Promise.all([
      fetch(`/api/items/${item.id}/production`),
      fetch(`/api/items/${item.id}/shipment`),
    ])
    if (pRes.ok) setProdLogs(await pRes.json())
    if (sRes.ok) setShipLogs(await sRes.json())
  }, [item])

  useEffect(() => {
    if (open && item) {
      fetchLogs()
      setAddForm(EMPTY_FORM)
      setEditingSeq(null)
      setDeleteConfirm(null)
    }
  }, [open, item, fetchLogs])

  const handleAdd = async () => {
    if (!item || !addForm.qty) return
    setSaving(true)
    const endpoint = `/api/items/${item.id}/${activeTab}`
    const body = activeTab === 'production'
      ? { produced_date: addForm.date || null, produced_qty: Number(addForm.qty), note: addForm.note || null, is_completed: addForm.is_completed }
      : { shipped_date: addForm.date || null, shipped_qty: Number(addForm.qty), note: addForm.note || null }

    await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    setAddForm(EMPTY_FORM)
    await fetchLogs()
    onUpdated()
    setSaving(false)
  }

  const handleEdit = async (seq: number) => {
    if (!item || !editForm.qty) return
    setSaving(true)
    const endpoint = `/api/items/${item.id}/${activeTab}/${seq}`
    const body = activeTab === 'production'
      ? { produced_date: editForm.date || null, produced_qty: Number(editForm.qty), note: editForm.note || null, is_completed: editForm.is_completed }
      : { shipped_date: editForm.date || null, shipped_qty: Number(editForm.qty), note: editForm.note || null }

    await fetch(endpoint, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    setEditingSeq(null)
    await fetchLogs()
    onUpdated()
    setSaving(false)
  }

  const handleDelete = async () => {
    if (!item || !deleteConfirm) return
    setSaving(true)
    await fetch(`/api/items/${item.id}/${deleteConfirm.type}/${deleteConfirm.seq}`, { method: 'DELETE' })
    setDeleteConfirm(null)
    await fetchLogs()
    onUpdated()
    setSaving(false)
  }

  const startEdit = (log: ProductionLog | ShipmentLog) => {
    const isProd = activeTab === 'production'
    const pLog = log as ProductionLog
    const sLog = log as ShipmentLog
    setEditingSeq(log.seq)
    setEditForm({
      date: isProd ? (pLog.produced_date ?? '') : (sLog.shipped_date ?? ''),
      qty: String(isProd ? pLog.produced_qty : sLog.shipped_qty),
      note: log.note ?? '',
      is_completed: isProd ? (pLog.is_completed ?? false) : false,
    })
  }

  const logs = activeTab === 'production' ? prodLogs : shipLogs

  if (!item) return null

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle className="text-base leading-snug">
            {item.site_name}
            <span className="block text-sm font-normal text-gray-500 mt-0.5">
              {item.item_name} · {item.width_mm}×{item.height_mm}mm · {item.order_qty}매
            </span>
          </SheetTitle>
          <div className="flex items-center gap-2 text-sm">
            <StatusBadge status={item.status} />
            <span className="text-gray-500">생산 {item.total_produced_qty}/{item.order_qty}매</span>
            <span className="text-gray-500">출고 {item.total_shipped_qty}/{item.order_qty}매</span>
          </div>
        </SheetHeader>

        {/* 탭 */}
        <div className="flex border-b mb-4">
          {(['production', 'shipment'] as LogType[]).map((t) => (
            <button
              key={t}
              onClick={() => { setActiveTab(t); setEditingSeq(null) }}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'production' ? `생산 로그 (${prodLogs.length})` : `출고 로그 (${shipLogs.length})`}
            </button>
          ))}
        </div>

        {/* 로그 목록 */}
        <div className="space-y-2 mb-6">
          {logs.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">로그가 없습니다.</p>
          )}
          {logs.map((log) => {
            const isProd = activeTab === 'production'
            const pLog = log as ProductionLog
            const sLog = log as ShipmentLog
            const dateVal = isProd ? pLog.produced_date : sLog.shipped_date
            const qtyVal  = isProd ? pLog.produced_qty  : sLog.shipped_qty

            return (
              <div key={log.seq} className="border rounded-lg p-3 bg-gray-50">
                {editingSeq === log.seq ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <Input type="date" value={editForm.date}
                        onChange={(e) => setEditForm({ ...editForm, date: e.target.value })} />
                      <Input type="number" placeholder="수량" value={editForm.qty}
                        onChange={(e) => setEditForm({ ...editForm, qty: e.target.value })} />
                    </div>
                    <Input placeholder="메모" value={editForm.note}
                      onChange={(e) => setEditForm({ ...editForm, note: e.target.value })} />
                    {isProd && (
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={editForm.is_completed}
                          onChange={(e) => setEditForm({ ...editForm, is_completed: e.target.checked })} />
                        생산 완료 처리
                      </label>
                    )}
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => handleEdit(log.seq)} disabled={saving}>저장</Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingSeq(null)}>취소</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs text-gray-500 mr-2">#{log.seq}</span>
                      <span className="text-sm font-medium">{dateVal ?? '날짜없음'}</span>
                      <span className="text-sm text-gray-700 ml-2">{qtyVal}매</span>
                      {isProd && pLog.is_completed && (
                        <span className="ml-2 text-xs text-green-600 font-medium">완료</span>
                      )}
                      {log.note && <span className="block text-xs text-gray-500 mt-0.5">{log.note}</span>}
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => startEdit(log)}
                        className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1">수정</button>
                      <button onClick={() => setDeleteConfirm({ type: activeTab, seq: log.seq })}
                        className="text-xs text-red-500 hover:text-red-700 px-2 py-1">삭제</button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* 추가 폼 */}
        <div className="border-t pt-4 space-y-2">
          <p className="text-sm font-medium text-gray-700">
            {activeTab === 'production' ? '생산' : '출고'} 회차 추가
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Input type="date" value={addForm.date}
              onChange={(e) => setAddForm({ ...addForm, date: e.target.value })} />
            <Input type="number" placeholder="수량 (매)" value={addForm.qty}
              onChange={(e) => setAddForm({ ...addForm, qty: e.target.value })} />
          </div>
          <Input placeholder="메모 (선택)" value={addForm.note}
            onChange={(e) => setAddForm({ ...addForm, note: e.target.value })} />
          {activeTab === 'production' && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={addForm.is_completed}
                onChange={(e) => setAddForm({ ...addForm, is_completed: e.target.checked })} />
              생산 완료 처리
            </label>
          )}
          <Button onClick={handleAdd} disabled={saving || !addForm.qty} className="w-full">
            {saving ? '저장 중...' : '추가'}
          </Button>
        </div>

        {/* 삭제 확인 모달 */}
        {deleteConfirm && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 shadow-xl max-w-sm w-full mx-4">
              <p className="font-medium mb-1">회차 삭제</p>
              <p className="text-sm text-gray-600 mb-4">
                {deleteConfirm.type === 'production' ? '생산' : '출고'} #{deleteConfirm.seq} 로그를 삭제하시겠습니까?
              </p>
              <div className="flex gap-2">
                <Button variant="destructive" onClick={handleDelete} disabled={saving}>삭제</Button>
                <Button variant="outline" onClick={() => setDeleteConfirm(null)}>취소</Button>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
