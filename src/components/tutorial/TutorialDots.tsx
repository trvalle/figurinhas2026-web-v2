'use client'
import { motion } from 'framer-motion'

interface TutorialDotsProps {
  total: number
  current: number
  accentColor: string
}

export function TutorialDots({ total, current, accentColor }: TutorialDotsProps) {
  return (
    <div className="flex items-center justify-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <motion.div
          key={i}
          animate={{
            width: i === current ? 24 : 8,
            backgroundColor: i === current ? accentColor : 'rgba(255,255,255,0.2)',
          }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          style={{ height: 8, borderRadius: 999, flexShrink: 0 }}
        />
      ))}
    </div>
  )
}
