'use client'
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import type { TutorialSlide } from '@/utils/tutorialContent'
import { STATUS_CONFIG } from '@/utils/constants'

interface Props {
  slide: TutorialSlide
}

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.12 } },
}

const cardVariant = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.28 } },
}

// ── Sequência de fases do demo de swipe (loop) ─────────────────────────────
type SwipePhase = 'center' | 'right' | 'left'
const SEQUENCE: Array<{ p: SwipePhase; ms: number }> = [
  { p: 'center', ms: 1100 },
  { p: 'right',  ms: 800  },
  { p: 'center', ms: 550  },
  { p: 'left',   ms: 800  },
  { p: 'center', ms: 550  },
]

function StickerSwipeDemo() {
  const [phase, setPhase] = useState<SwipePhase>('center')

  useEffect(() => {
    let step = 0
    let timer: ReturnType<typeof setTimeout>

    const tick = () => {
      const { p, ms } = SEQUENCE[step % SEQUENCE.length]!
      setPhase(p)
      timer = setTimeout(tick, ms)
      step++
    }

    tick()
    return () => clearTimeout(timer)
  }, [])

  const xVal   = phase === 'right' ? 76 : phase === 'left' ? -76 : 0
  const isRight = phase === 'right'
  const isLeft  = phase === 'left'
  const isCenter = phase === 'center'

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.14, duration: 0.3 }}
      className="w-full"
    >
      {/* Demo container */}
      <div
        className="relative w-full rounded-xl overflow-hidden"
        style={{
          height: 96,
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        {/* Zona verde — deslizar para a direita */}
        <motion.div
          animate={{ opacity: isRight ? 1 : 0 }}
          transition={{ duration: 0.18 }}
          className="absolute right-0 top-0 bottom-0 rounded-r-xl flex items-center justify-end pr-5"
          style={{ width: '58%', background: 'rgba(34,197,94,0.18)' }}
        >
          <div className="flex flex-col items-end gap-0.5">
            <span style={{ fontFamily: 'var(--font-barlow)', fontSize: 12, fontWeight: 700, color: '#4ADE80', lineHeight: 1 }}>
              Colar
            </span>
            <span style={{ fontSize: 15 }}>✅</span>
          </div>
        </motion.div>

        {/* Zona vermelha — deslizar para a esquerda */}
        <motion.div
          animate={{ opacity: isLeft ? 1 : 0 }}
          transition={{ duration: 0.18 }}
          className="absolute left-0 top-0 bottom-0 rounded-l-xl flex items-center pl-5"
          style={{ width: '58%', background: 'rgba(244,63,94,0.18)' }}
        >
          <div className="flex flex-col items-start gap-0.5">
            <span style={{ fontFamily: 'var(--font-barlow)', fontSize: 12, fontWeight: 700, color: '#FB7185', lineHeight: 1 }}>
              Excluir
            </span>
            <span style={{ fontSize: 15 }}>❌</span>
          </div>
        </motion.div>

        {/* Setas de dica quando centralizado */}
        <motion.div
          animate={{ opacity: isCenter ? 0.4 : 0 }}
          transition={{ duration: 0.25 }}
          className="absolute inset-0 flex items-center justify-between px-5 pointer-events-none"
        >
          <span style={{ fontSize: 17, color: '#FB7185' }}>←</span>
          <span style={{ fontSize: 17, color: '#4ADE80' }}>→</span>
        </motion.div>

        {/* Card da figurinha que desliza */}
        <motion.div
          animate={{ x: xVal }}
          transition={{ type: 'spring', stiffness: 260, damping: 22 }}
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
        >
          <div
            style={{
              width: 56,
              height: 68,
              borderRadius: 10,
              background: 'rgba(34,197,94,0.14)',
              border: '1px solid rgba(34,197,94,0.45)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 4px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-jetbrains)',
                fontSize: 9,
                fontWeight: 700,
                color: '#fff',
                textAlign: 'center',
              }}
            >
              BRA 5
            </span>
            <span style={{ fontSize: 15 }}>✅</span>
          </div>
        </motion.div>
      </div>

      {/* Labels abaixo */}
      <div className="flex justify-between mt-2 px-1">
        <span style={{ fontFamily: 'var(--font-dmsans)', fontSize: 11, color: '#FB718580' }}>
          ← excluir
        </span>
        <span style={{ fontFamily: 'var(--font-dmsans)', fontSize: 11, color: '#4ADE8080' }}>
          colar →
        </span>
      </div>
    </motion.div>
  )
}

export function TutorialSlideComponent({ slide }: Props) {
  return (
    <div className="flex flex-col items-center gap-5 px-6 w-full max-w-sm">
      {/* Emoji glow circle */}
      <motion.div
        initial={{ scale: 0.65, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.04, type: 'spring', stiffness: 320, damping: 20 }}
        style={{
          width: 96,
          height: 96,
          borderRadius: 999,
          background: slide.emojiBackground,
          border: `1px solid ${slide.accentColor}33`,
          boxShadow: `0 0 40px ${slide.accentColor}22`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 48,
          userSelect: 'none',
          flexShrink: 0,
        }}
      >
        {slide.emoji}
      </motion.div>

      {/* Ilustração: demo de swipe (slide CONTROLE) ou mini cards */}
      {slide.id === 3 ? (
        <StickerSwipeDemo />
      ) : (
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="show"
          className="flex gap-2 justify-center flex-wrap"
        >
          {slide.illustrationItems.map((item) => {
            const cfg = STATUS_CONFIG[item.status]
            return (
              <motion.div
                key={item.code}
                variants={cardVariant}
                style={{
                  width: 52,
                  height: 64,
                  borderRadius: 10,
                  background: cfg.bg,
                  border: `1px solid ${cfg.color}55`,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 4px',
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-jetbrains)',
                    fontSize: 9,
                    fontWeight: 700,
                    color: '#fff',
                    letterSpacing: 0.3,
                    textAlign: 'center',
                    lineHeight: 1.2,
                  }}
                >
                  {item.code}
                </span>
                <span style={{ fontSize: 14 }}>{cfg.icon}</span>
              </motion.div>
            )
          })}
        </motion.div>
      )}

      {/* Text block */}
      <div className="text-center space-y-2">
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.22 }}
          style={{
            fontFamily: 'var(--font-bebas)',
            fontSize: 44,
            letterSpacing: 3,
            color: slide.accentColor,
            lineHeight: 1,
          }}
        >
          {slide.title}
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.16 }}
          style={{
            fontFamily: 'var(--font-barlow)',
            fontSize: 17,
            fontWeight: 700,
            color: '#CBD5E1',
            lineHeight: 1.3,
          }}
        >
          {slide.subtitle}
        </motion.p>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.22 }}
          style={{
            fontFamily: 'var(--font-dmsans)',
            fontSize: 14,
            color: '#94A3B8',
            lineHeight: 1.65,
          }}
        >
          {slide.description}
        </motion.p>
      </div>

      {/* Tip */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        style={{
          background: 'rgba(245,158,11,0.08)',
          border: '1px solid rgba(245,158,11,0.2)',
          borderRadius: 12,
          padding: '10px 14px',
          width: '100%',
        }}
      >
        <p style={{ fontFamily: 'var(--font-dmsans)', fontSize: 13, color: '#FBBF24', lineHeight: 1.5 }}>
          💡 {slide.tip}
        </p>
      </motion.div>
    </div>
  )
}
