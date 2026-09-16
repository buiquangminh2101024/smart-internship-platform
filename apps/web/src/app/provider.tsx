"use client"

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { SessionSync } from '@/components/auth/SessionSync'
import { EmployerStageSync } from '@/components/auth/EmployerStageSync'
import { SocketProvider } from '@/components/realtime/SocketProvider'

// Socket ứng viên đặt ở gốc để nhận thông báo realtime cả trên trang công khai
// (/, /jobs...) và giữ 1 kết nối liên tục khi chuyển trang. Tab đang ở khu
// employer/admin thì ngắt (employer có provider riêng ở EmployerPortalShell).
function CandidateSocketRoot({ children }: { children: ReactNode }) {
    const pathname = usePathname()
    const isOtherArea = /^\/(employer|admin)(\/|$)/.test(pathname)

    return (
        <SocketProvider area="candidate" enabled={!isOtherArea}>
            {children}
        </SocketProvider>
    )
}

export function Providers ({children}: {children: ReactNode}) {
    const [queryClient] = useState(() => new QueryClient());

    return (
        <QueryClientProvider client={queryClient}>
            <SessionSync area="candidate" />
            <SessionSync area="employer" />
            <SessionSync area="admin" />
            <EmployerStageSync />
            <CandidateSocketRoot>{children}</CandidateSocketRoot>
            <ReactQueryDevtools initialIsOpen={false} />
        </QueryClientProvider>
    )
}