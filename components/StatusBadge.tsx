import { Badge } from '@/components/ui/badge'
import type { ItemStatus } from '@/types'

const CONFIG: Record<ItemStatus['status'], { label: string; className: string }> = {
  pending:     { label: '생산대기',  className: 'bg-gray-100 text-gray-700 border-gray-300' },
  in_progress: { label: '생산중',   className: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
  produced:    { label: '생산완료', className: 'bg-blue-100 text-blue-800 border-blue-300' },
  partial:     { label: '일부출고', className: 'bg-orange-100 text-orange-800 border-orange-300' },
  shipped:     { label: '출고완료', className: 'bg-green-100 text-green-800 border-green-300' },
}

export function StatusBadge({ status }: { status: ItemStatus['status'] }) {
  const { label, className } = CONFIG[status] ?? CONFIG.pending
  return (
    <Badge variant="outline" className={`text-xs font-medium ${className}`}>
      {label}
    </Badge>
  )
}
