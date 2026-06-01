'use client'

interface StatCardProps {
  label: string
  value: number
  color: string
  bg: string
  icon: string
  onClick?: () => void
}

export function StatCard({ label, value, color, bg, icon, onClick }: StatCardProps) {
  return (
    <div
      className="flex-1 rounded-xl p-4 flex flex-col gap-1 transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
      style={{ backgroundColor: bg }}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <span className="font-display text-3xl leading-none" style={{ color }}>
          {value}
        </span>
        <span className="text-lg opacity-80">{icon}</span>
      </div>
      <span
        className="text-xs font-body uppercase tracking-wider mt-1"
        style={{ color, opacity: 0.8 }}
      >
        {label}
      </span>
    </div>
  )
}
