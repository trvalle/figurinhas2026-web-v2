'use client'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { HELP_CONTENT } from '@/utils/tutorialContent'

interface HelpModalProps {
  visible: boolean
  onClose: () => void
  screen: keyof typeof HELP_CONTENT
}

export function HelpModal({ visible, onClose, screen }: HelpModalProps) {
  const content = HELP_CONTENT[screen]
  if (!content) return null

  return (
    <AnimatePresence>
      {visible && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/60 z-40"
            onClick={onClose}
          />

          {/* Bottom sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 420, damping: 38 }}
            className="fixed bottom-0 left-0 right-0 bg-ink-800 rounded-t-2xl z-50 flex flex-col"
            style={{ maxHeight: '85dvh' }}
          >
            {/* Drag pill */}
            <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mt-3 mb-1 flex-shrink-0" />

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 flex-shrink-0">
              <h2 className="font-heading font-bold text-xl text-ink-100">{content.title}</h2>
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center text-ink-400 hover:text-ink-200 transition-colors"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            {/* Sections */}
            <div className="overflow-y-auto flex-1 px-5">
              {content.sections.map((section, i) => (
                <div
                  key={i}
                  className="py-4 flex gap-3"
                  style={{
                    borderBottom:
                      i < content.sections.length - 1
                        ? '1px solid rgba(255,255,255,0.05)'
                        : 'none',
                  }}
                >
                  <span className="text-2xl w-8 flex-shrink-0 text-center leading-none pt-0.5">
                    {section.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-heading font-bold text-ink-100 text-sm mb-1">
                      {section.heading}
                    </p>
                    <p className="font-body text-ink-400 text-sm leading-relaxed whitespace-pre-line">
                      {section.body}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="px-5 py-4 pb-safe flex-shrink-0">
              <button
                onClick={onClose}
                className="w-full py-3.5 rounded-xl bg-gold-500 text-ink-900 font-heading font-bold text-base tracking-wide hover:bg-gold-400 transition-colors"
              >
                Entendido ✓
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
