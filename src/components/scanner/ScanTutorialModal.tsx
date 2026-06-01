'use client'
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const LS_KEY = 'scan_tutorial_seen'

// Códigos simulados no viewfinder com posição e status
const DEMO_CODES = [
  { code: 'BRA 5',  color: '#22C55E', x: 14, y: 18 },
  { code: 'GER 12', color: '#F59E0B', x: 52, y: 14 },
  { code: 'MAR 3',  color: '#F43F5E', x: 20, y: 56 },
  { code: 'ARG 8',  color: '#3B82F6', x: 58, y: 54 },
] as const

type Phase = 'scanning' | 'detecting' | 'captured'

function CameraScanDemo() {
  const [phase, setPhase] = useState<Phase>('scanning')
  const [detectedCount, setDetectedCount] = useState(0)
  const [flash, setFlash] = useState(false)

  useEffect(() => {
    const ids: ReturnType<typeof setTimeout>[] = []
    const s = (fn: () => void, ms: number) => ids.push(setTimeout(fn, ms))

    const cycle = () => {
      // Reset
      setPhase('scanning')
      setDetectedCount(0)
      setFlash(false)

      // Detectar um a um
      s(() => setPhase('detecting'), 2000)
      DEMO_CODES.forEach((_, i) => {
        s(() => setDetectedCount(i + 1), 2200 + i * 280)
      })

      // Flash de captura
      s(() => { setFlash(true); setPhase('captured') }, 3500)
      s(() => setFlash(false), 3800)

      // Loop
      s(cycle, 5600)
    }

    cycle()
    return () => ids.forEach(clearTimeout)
  }, [])

  const VW = 280  // largura do viewfinder
  const VH = 168  // altura do viewfinder

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Viewfinder */}
      <div
        style={{
          width: VW,
          height: VH,
          borderRadius: 12,
          background: '#080F1A',
          border: '2px solid rgba(245,158,11,0.4)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Cantos do viewfinder estilo câmera */}
        {[
          { top: 6, left: 6,  borderTop: '2px solid #F59E0B', borderLeft: '2px solid #F59E0B' },
          { top: 6, right: 6, borderTop: '2px solid #F59E0B', borderRight: '2px solid #F59E0B' },
          { bottom: 6, left: 6,  borderBottom: '2px solid #F59E0B', borderLeft: '2px solid #F59E0B' },
          { bottom: 6, right: 6, borderBottom: '2px solid #F59E0B', borderRight: '2px solid #F59E0B' },
        ].map((style, i) => (
          <div key={i} style={{ position: 'absolute', width: 14, height: 14, borderRadius: 2, ...style }} />
        ))}

        {/* Linha de scan animada */}
        <AnimatePresence>
          {phase === 'scanning' && (
            <motion.div
              initial={{ y: 0 }}
              animate={{ y: VH }}
              transition={{ duration: 1.8, ease: 'linear', repeat: Infinity }}
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                height: 2,
                background: 'linear-gradient(90deg, transparent 0%, #F59E0B 30%, #FCD34D 50%, #F59E0B 70%, transparent 100%)',
                boxShadow: '0 0 10px rgba(245,158,11,0.6)',
              }}
            />
          )}
        </AnimatePresence>

        {/* Códigos das figurinhas no viewfinder */}
        {DEMO_CODES.map((item, i) => {
          const isDetected = detectedCount > i
          return (
            <div
              key={item.code}
              style={{
                position: 'absolute',
                left: `${item.x}%`,
                top: `${item.y}%`,
              }}
            >
              {/* Caixa de detecção */}
              <motion.div
                initial={false}
                animate={{
                  opacity: isDetected ? 1 : 0,
                  scale: isDetected ? 1 : 1.25,
                }}
                transition={{ duration: 0.2, type: 'spring', stiffness: 400, damping: 20 }}
                style={{
                  position: 'absolute',
                  inset: -5,
                  borderRadius: 5,
                  border: `1.5px solid ${item.color}`,
                  boxShadow: `0 0 10px ${item.color}55`,
                }}
              />

              {/* Label do código */}
              <motion.span
                animate={{ opacity: phase === 'scanning' ? 0.45 : 1 }}
                transition={{ duration: 0.2 }}
                style={{
                  fontFamily: 'var(--font-jetbrains)',
                  fontSize: 10,
                  fontWeight: 700,
                  color: phase === 'scanning' ? 'rgba(255,255,255,0.6)' : '#fff',
                  whiteSpace: 'nowrap',
                  textShadow: isDetected ? `0 0 8px ${item.color}` : 'none',
                  display: 'block',
                  lineHeight: 1,
                  padding: '2px 3px',
                }}
              >
                {item.code}
              </motion.span>
            </div>
          )
        })}

        {/* Flash de captura */}
        <motion.div
          animate={{ opacity: flash ? 0.7 : 0 }}
          transition={{ duration: 0.12 }}
          style={{
            position: 'absolute',
            inset: 0,
            background: '#fff',
            borderRadius: 10,
            pointerEvents: 'none',
          }}
        />
      </div>

      {/* Instrução contextual */}
      <motion.p
        animate={{ opacity: phase === 'scanning' ? 1 : 0 }}
        transition={{ duration: 0.25 }}
        style={{
          position: 'absolute',
          fontFamily: 'var(--font-dmsans)',
          fontSize: 11,
          color: '#FBBF24',
          marginTop: 184,
        }}
      >
        📷 Aponte para os códigos
      </motion.p>

      {/* Chips dos códigos detectados */}
      <div style={{ height: 28, display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
        <AnimatePresence>
          {DEMO_CODES.slice(0, detectedCount).map((item) => (
            <motion.div
              key={item.code}
              initial={{ opacity: 0, scale: 0.6, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 22 }}
              style={{
                borderRadius: 99,
                paddingInline: 8,
                paddingBlock: 3,
                background: `${item.color}22`,
                border: `1px solid ${item.color}66`,
                fontFamily: 'var(--font-jetbrains)',
                fontSize: 10,
                fontWeight: 700,
                color: item.color,
                whiteSpace: 'nowrap',
              }}
            >
              {item.code}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ── Modal principal ─────────────────────────────────────────────────────────
export function ScanTutorialModal() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!localStorage.getItem(LS_KEY)) {
      const t = setTimeout(() => setVisible(true), 400)
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
            className="fixed inset-0 bg-black/75 z-[60]"
            onClick={handleClose}
          />

          {/* Card */}
          <div className="fixed inset-0 z-[60] flex items-center justify-center px-5 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.88, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.88, y: 20 }}
              transition={{ type: 'spring', stiffness: 300, damping: 28 }}
              className="bg-ink-800 rounded-2xl p-5 w-full max-w-sm pointer-events-auto"
              style={{ border: '1px solid rgba(245,158,11,0.22)' }}
            >
              {/* Título */}
              <div className="mb-4">
                <h2
                  style={{
                    fontFamily: 'var(--font-bebas)',
                    fontSize: 28,
                    letterSpacing: 2,
                    color: '#FBBF24',
                    lineHeight: 1,
                  }}
                >
                  COMO ESCANEAR 📷
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
                  Aponte para os códigos das figurinhas
                </p>
              </div>

              {/* Animação */}
              <div style={{ position: 'relative', minHeight: 220, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <CameraScanDemo />
              </div>

              {/* Dicas */}
              <div className="space-y-2 mt-4 mb-5">
                {[
                  { icon: '🔡', text: 'Os códigos ficam abaixo da figurinha — ex: BRA 5, GER 12' },
                  { icon: '💡', text: 'Boa iluminação e superfície clara dão o melhor resultado' },
                  { icon: '📦', text: 'Até 10 figurinhas em uma só foto' },
                ].map((tip) => (
                  <div key={tip.icon} className="flex items-start gap-2.5">
                    <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>{tip.icon}</span>
                    <p style={{ fontFamily: 'var(--font-dmsans)', fontSize: 13, color: '#94A3B8', lineHeight: 1.55 }}>
                      {tip.text}
                    </p>
                  </div>
                ))}
              </div>

              {/* Botão */}
              <button
                onClick={handleClose}
                className="w-full py-3.5 rounded-xl bg-gold-500 hover:bg-gold-400 text-ink-900 font-heading font-bold text-base tracking-wide transition-colors"
              >
                Começar a escanear 📷
              </button>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}
