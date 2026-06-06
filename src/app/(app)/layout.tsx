import BottomNav from '@/components/ui/BottomNav'
import { ApprovalGate } from '@/components/ui/ApprovalGate'
import { InactivityLogout } from '@/components/ui/InactivityLogout'
import { Header } from '@/components/ui/Header'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ApprovalGate>
      <InactivityLogout />
      <div className="min-h-screen bg-ink-900">
        <Header />
        <main className="pb-20">{children}</main>
        <BottomNav />
      </div>
    </ApprovalGate>
  )
}
