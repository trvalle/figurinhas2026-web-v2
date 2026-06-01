'use client'
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'

const LS_KEY = 'landscape_hint_seen'

// ── Demo de animação: celular portrait → landscape + toque nas figurinhas ──
function PhoneDemo() {
  const [isLandscape, setIsLandscape] = useState(false)
  const [tapped, setTapped] = useState(-1)

  useEffect(() => {
    const ids: ReturnType<typeof setTimeout>[] = []
    const s = (fn: () => void, ms: number) => ids.push(setTimeout(fn, ms))

    const cycle = () => {
      s(() => setIsLandscape(true), 1500)
      s(() => setTapped(2),         2400)
      s(() => setTapped(-1),        2780)
      s(() => setTapped(7),         3100)
      s(() => setTapped(-1),        3480)
      s(() => setTapped(11),        3750)
      s(() => setTapped(-1),        4100)
      s(() => setIsLandscape(false),4700)
      s(cycle,                      6200)
    }

    cycle()
    return () => ids.forEach(clearTimeout)
  }, [])

  const phoneW = isLandscape ? 186 : 94
  const phoneH = isLandscape ? 110 : 156
  const cols   = isLandscape ? 5 : 3
  const total  = isLandscape ? 15 : 12

  // Quais índices ficam "pré-colados" (verde fraco)
  const pasted = new Set([0, 3, 5, 9])

  return (
    <div
      style={{
        height: 200,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
      }}
    >
      {/* Celular */}
      <motion.div
        animate={{ width: phoneW, height: phoneH }}
        transition={{ type: 'spring', stiffness: 145, damping: 22 }}
        style={{
          borderRadius: 16,
          border: '2.5px solid rgba(245,158,11,0.55)',
          background: '#0F172A',
          overflow: 'hidden',
          padding: 8,
          boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
        }}
      >
        {/* Câmera / notch */}
        <div
          style={{
            width: 22,
            height: 4,
            borderRadius: 2,
            background: 'rgba(245,158,11,0.32)',
            margin: '0 auto 6px',
          }}
        />

        {/* Grid de figurinhas */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gap: 3,
          }}
        >
          {Array.from({ length: total }).map((_, i) => (
            <motion.div
              key={i}
              animate={{
                background:
                  i === tapped
                    ? 'rgba(34,197,94,0.88)'
                    : pasted.has(i)
                    ? 'rgba(34,197,94,0.30)'
                    : 'rgba(255,255,255,0.07)',
                scale: i === tapped ? 0.80 : 1,
              }}
              transition={{ duration: 0.13 }}
              style={{
                height: isLandscape ? 18 : 22,
                borderRadius: 4,
              }}
            />
          ))}
        </div>
      </motion.div>

      {/* Legenda portrait */}
      <motion.p
        animate={{ opacity: isLandscape ? 0 : 0.6 }}
        transition={{ duration: 0.3 }}
        style={{
          position: 'absolute',
          bottom: 0,
          fontSize: 11,
          color: '#FBBF24',
          fontFamily: 'var(--font-dmsans)',
          display: 'flex',
          alignItems: 'center',
          gap: 5,
        }}
      >
        ↻ vire o celular
      </motion.p>

      {/* Legenda landscape */}
      <motion.p
        animate={{ opacity: isLandscape ? 0.85 : 0 }}
        transition={{ duration: 0.3 }}
        style={{
          position: 'absolute',
          bottom: 0,
          fontSize: 11,
          color: '#4ADE80',
          fontFamily: 'var(--font-dmsans)',
        }}
      >
        ✅ muito melhor para selecionar!
      </motion.p>
    </div>
  )
}

// ── Modal principal ─────────────────────────────────────────────────────────
export function LandscapeHintModal() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!localStorage.getItem(LS_KEY)) {
      const t = setTimeout(() => setVisible(true), 500)
      return () => clearTimeout(t)
    }
  }, [])

  const handleClose = () => {
    localStorage.setItem(LS_KEY, '1')
    setVisible(false)
  }

  return (
    <AnimatePresence>
      {visible && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="fixed inset-0 bg-black/70 z-50"
            onClick={handleClose}
          />

          {/* Card central */}
          <div className="fixed inset-0 z-50 flex items-center justify-center px-6 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.88, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.88, y: 24 }}
              transition={{ type: 'spring', stiffness: 300, damping: 28 }}
              className="bg-ink-800 rounded-2xl p-6 w-full max-w-sm pointer-events-auto relative"
              style={{ border: '1px solid rgba(245,158,11,0.22)' }}
            >
              {/* Fechar */}
              <button
                onClick={handleClose}
                className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center text-ink-500 hover:text-ink-300 transition-colors"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>

              {/* Título */}
              <div className="mb-4 pr-8">
                <h2
                  style={{
                    fontFamily: 'var(--font-bebas)',
                    fontSize: 28,
                    letterSpacing: 2,
                    color: '#FBBF24',
                    lineHeight: 1,
                  }}
                >
                  DICA DE USO 📱
                </h2>
                <p
                  style={{
                    fontFamily: 'var(--font-barlow)',
                    fontSize: 15,
                    fontWeight: 700,
                    color: '#CBD5E1',
                    marginTop: 4,
                    lineHeight: 1.3,
                  }}
                >
                  Vire o celular para o lado!
                </p>
              </div>

              {/* Animação */}
              <PhoneDemo />

              {/* Descrição */}
              <p
                style={{
                  fontFamily: 'var(--font-dmsans)',
                  fontSize: 13,
                  color: '#94A3B8',
                  lineHeight: 1.65,
                  marginTop: 12,
                  marginBottom: 20,
                }}
              >
                No modo <strong style={{ color: '#CBD5E1' }}>horizontal</strong> o layout do álbum
                fica mais espaçoso — as figurinhas ficam maiores e é muito mais fácil tocar
                em cada uma para marcá-la como colada ✅.
              </p>

              {/* Botão */}
              <button
                onClick={handleClose}
                className="w-full py-3.5 rounded-xl bg-gold-500 hover:bg-gold-400 text-ink-900 font-heading font-bold text-base tracking-wide transition-colors"
              >
                Entendi! 👍
              </button>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}
