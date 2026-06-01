interface ProgressBarProps {
  value: number
  color?: string
}

export function ProgressBar({ value, color = '#F59E0B' }: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, value * 100))
  return (
    <div className="h-2 bg-white/10 rounded-full overflow-hidden">
      <div
        className="h-full rounded-full"
        style={{
          width: `${pct.toFixed(1)}%`,
          backgroundColor: color,
          transition: 'width 600ms cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      />
    </div>
  )
}
