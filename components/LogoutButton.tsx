'use client'

import { logout } from '@/app/actions/auth'

export function LogoutButton() {
  return (
    <form action={logout}>
      <button
        type="submit"
        className="text-sm text-gray-500 hover:text-red-600 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
      >
        로그아웃
      </button>
    </form>
  )
}
