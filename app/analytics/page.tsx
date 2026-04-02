'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { RiskRadar } from '@/components/RiskRadar'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, BarChart,
} from 'recharts'
import { LogoutButton } from '@/components/LogoutButton'

interface MonthData {
  month: string
  total: number
  shipped: number
  order_qty: number
  area_m2: number
  produced_qty: number
  shipped_qty: number
  compliance_rate: number | null
}

interface Analytics {
  monthly: MonthData[]
  ytd_compliance: number | null
}

const MONTH_LABELS: Record<string, string> = {
  '01': '1월', '02': '2월', '03': '3월', '04': '4월',
  '05': '5월', '06': '6월', '07': '7월', '08': '8월',
  '09': '9월', '10': '10월', '11': '11월', '12': '12월',
}

function fmtMonth(m: string) {
  const [y, mo] = m.split('-')
  return `${y.slice(2)}년 ${MONTH_LABELS[mo]}`
}

export default function AnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/analytics').then(r => r.json()).then(d => { setData(d); setLoading(false) })
  }, [])

  const currentMonth = new Date().toISOString().slice(0, 7) // "2026-03"
  const currentMonthData = data?.monthly.find(m => m.month === currentMonth)

  const chartData = data?.monthly.map(m => ({
    name: fmtMonth(m.month),
    총건수: m.total,
    출고완료: m.shipped,
    납기준수율: m.compliance_rate,
    발주m2: Math.round(m.area_m2),
    생산m2: Math.round(m.produced_qty * 0.1) / 0.1, // produced_qty는 매수 기준이므로 area로 환산 필요
    발주매수: m.order_qty,
    생산매수: m.produced_qty,
  })) ?? []

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white text-sm font-bold">G</span>
          </div>
          <div>
            <h1 className="font-bold text-gray-900 text-lg leading-tight">GlassFlow AI</h1>
            <p className="text-xs text-gray-500">경영 현황</p>
          </div>
        </Link>
        <nav className="flex gap-3">
          <Link href="/dashboard" className="text-sm text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            대시보드
          </Link>
          <Link href="/chat" className="text-sm text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            챗봇
          </Link>
          <LogoutButton />
        </nav>
      </header>

      <main className="p-6 space-y-6 max-w-6xl mx-auto">
        <div>
          <h2 className="text-xl font-bold text-gray-900">경영 현황</h2>
          <p className="text-sm text-gray-500 mt-1">최근 12개월 납기 준수율 및 생산 실적</p>
        </div>

        {/* 납기 위험 레이더 - 항상 최상단 */}
        <RiskRadar />

        {loading ? (
          <div className="grid grid-cols-1 gap-6">
            {[1, 2].map(i => (
              <div key={i} className="bg-white rounded-xl border p-6 h-80 animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            {/* 연간 요약 카드 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <SummaryCard
                label="연간 납기 준수율"
                value={data?.ytd_compliance != null ? `${data.ytd_compliance}%` : '-'}
                sub="올해 납기 경과분 기준"
                color={
                  data?.ytd_compliance == null ? 'gray' :
                  data.ytd_compliance >= 90 ? 'green' :
                  data.ytd_compliance >= 70 ? 'amber' : 'red'
                }
              />
              <SummaryCard
                label="이번달 납기 건수"
                value={`${(currentMonthData?.total ?? 0).toLocaleString()}건`}
                sub={`출고완료 ${currentMonthData?.shipped ?? 0}건`}
                color="blue"
              />
              <SummaryCard
                label="이번달 발주 수량"
                value={`${(currentMonthData?.order_qty ?? 0).toLocaleString()}매`}
                sub={`생산 ${(currentMonthData?.produced_qty ?? 0).toLocaleString()}매`}
                color="indigo"
              />
              <SummaryCard
                label="이번달 발주 면적"
                value={`${(currentMonthData?.area_m2 ?? 0).toLocaleString()}m²`}
                sub="납기 기준"
                color="gray"
              />
            </div>

            {/* 납기 준수율 차트 */}
            <div className="bg-white rounded-xl border p-6">
              <h3 className="font-semibold text-gray-800 mb-1">납기 준수율 추이</h3>
              <p className="text-xs text-gray-400 mb-4">월별 납기 건수 중 출고 완료 비율 (이번달은 진행중)</p>
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="right" orientation="right" unit="%" domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(value, name) => {
                      if (name === '납기준수율') return [`${value}%`, name]
                      return [value, name]
                    }}
                  />
                  <Legend />
                  <Bar yAxisId="left" dataKey="총건수" fill="#e2e8f0" name="총건수" />
                  <Bar yAxisId="left" dataKey="출고완료" fill="#6366f1" name="출고완료" />
                  <Line yAxisId="right" type="monotone" dataKey="납기준수율" stroke="#f59e0b" strokeWidth={2} dot={{ r: 4 }} name="납기준수율" connectNulls={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* 월별 생산 실적 차트 */}
            <div className="bg-white rounded-xl border p-6">
              <h3 className="font-semibold text-gray-800 mb-1">월별 발주·생산 매수</h3>
              <p className="text-xs text-gray-400 mb-4">납기 기준 월별 발주 수량 vs 생산 수량</p>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="발주매수" fill="#bfdbfe" name="발주매수" />
                  <Bar dataKey="생산매수" fill="#3b82f6" name="생산매수" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* 월별 상세 테이블 */}
            <div className="bg-white rounded-xl border overflow-hidden">
              <div className="px-6 py-4 border-b">
                <h3 className="font-semibold text-gray-800">월별 상세</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-4 py-3 text-gray-500 font-medium">월</th>
                      <th className="text-right px-4 py-3 text-gray-500 font-medium">납기 건수</th>
                      <th className="text-right px-4 py-3 text-gray-500 font-medium">출고완료</th>
                      <th className="text-right px-4 py-3 text-gray-500 font-medium">납기 준수율</th>
                      <th className="text-right px-4 py-3 text-gray-500 font-medium">발주 매수</th>
                      <th className="text-right px-4 py-3 text-gray-500 font-medium">생산 매수</th>
                      <th className="text-right px-4 py-3 text-gray-500 font-medium">발주 면적(m²)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...(data?.monthly ?? [])].reverse().map((m) => {
                      const isCurrentMonth = m.month === new Date().toISOString().slice(0, 7)
                      return (
                        <tr key={m.month} className={`border-t ${isCurrentMonth ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                          <td className="px-4 py-3 font-medium text-gray-800">
                            {fmtMonth(m.month)}
                            {isCurrentMonth && <span className="ml-2 text-xs text-blue-500">이번달</span>}
                          </td>
                          <td className="px-4 py-3 text-right">{m.total.toLocaleString()}</td>
                          <td className="px-4 py-3 text-right">{m.shipped.toLocaleString()}</td>
                          <td className="px-4 py-3 text-right">
                            {m.compliance_rate != null ? (
                              <span className={`font-semibold ${
                                m.compliance_rate >= 90 ? 'text-green-600' :
                                m.compliance_rate >= 70 ? 'text-amber-600' : 'text-red-600'
                              }`}>
                                {m.compliance_rate}%
                              </span>
                            ) : (
                              <span className="text-gray-400">진행중</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">{m.order_qty.toLocaleString()}</td>
                          <td className="px-4 py-3 text-right">{m.produced_qty.toLocaleString()}</td>
                          <td className="px-4 py-3 text-right">{m.area_m2.toLocaleString()}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  )
}

function SummaryCard({ label, value, sub, color }: {
  label: string; value: string; sub: string
  color: 'green' | 'amber' | 'red' | 'blue' | 'indigo' | 'gray'
}) {
  const colors = {
    green:  'text-green-600',
    amber:  'text-amber-600',
    red:    'text-red-600',
    blue:   'text-blue-600',
    indigo: 'text-indigo-600',
    gray:   'text-gray-700',
  }
  return (
    <div className="bg-white rounded-xl border p-4">
      <p className="text-xs font-medium text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${colors[color]}`}>{value}</p>
      <p className="text-xs text-gray-400 mt-1">{sub}</p>
    </div>
  )
}
