'use client'
import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { TUTORIAL_SLIDES } from '@/utils/tutorialContent'
import { TutorialSlideComponent } from '@/components/tutorial/TutorialSlide'
import { TutorialDots } from '@/components/tutorial/TutorialDots'

const SLIDE_VARIANTS = {
  enter: (dir: number) => ({
    x: dir > 0 ? '100%' : '-100%',
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
    transition: { type: 'tween' as const, ease: [0.25, 0.1, 0.25, 1] as const, duration: 0.3 },
  },
  exit: (dir: number) => ({
    x: dir < 0 ? '100%' : '-100%',
    opacity: 0,
    transition: { type: 'tween' as const, ease: [0.25, 0.1, 0.25, 1] as const, duration: 0.22 },
  }),
}

export default function TutorialPage() {
  const router = useRouter()
  const [checked, setChecked] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [direction, setDirection] = useState(1)

  const slide = TUTORIAL_SLIDES[currentIndex]!
  const isLast = currentIndex === TUTORIAL_SLIDES.length - 1

  useEffect(() => {
    if (localStorage.getItem('tutorial_skipped')) {
      router.replace('/onboarding')
    } else {
      setChecked(true)
    }
  }, [router])

  const goTo = useCallback(
    (index: number) => {
      setDirection(index > currentIndex ? 1 : -1)
      setCurrentIndex(index)
    },
    [currentIndex],
  )

  const handleSkip = useCallback(() => {
    localStorage.setItem('tutorial_skipped', '1')
    router.replace('/onboarding')
  }, [router])

  const handleNext = useCallback(() => {
    if (!isLast) goTo(currentIndex + 1)
    else router.replace('/onboarding')
  }, [isLast, currentIndex, goTo, router])

  if (!checked) return null

  return (
    <div className="fixed inset-0 bg-ink-900 flex flex-col overflow-hidden">
      {/* Animated radial background per slide */}
      <div className="absolute inset-0 pointer-events-none">
        {TUTORIAL_SLIDES.map((s, i) => (
          <motion.div
            key={s.id}
            animate={{ opacity: i === currentIndex ? 1 : 0 }}
            transition={{ duration: 0.55 }}
            className="absolute inset-0"
            style={{
              background: `radial-gradient(ellipse 90% 55% at 50% 10%, ${s.emojiBackground}, transparent 70%)`,
            }}
          />
        ))}
      </div>

      {/* Skip button */}
      <div className="relative z-10 flex justify-end px-5 pt-safe py-2 h-12">
        <AnimatePresence>
          {!isLast && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.1 } }}
              onClick={handleSkip}
              className="font-heading font-bold text-sm text-ink-500 hover:text-ink-300 transition-colors py-1 px-2"
            >
              Pular
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Swipeable slide area */}
      <motion.div
        className="relative z-10 flex-1 overflow-hidden cursor-grab active:cursor-grabbing select-none"
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0}
        dragMomentum={false}
        onDragEnd={(_, info) => {
          if (info.offset.x < -50 && !isLast) goTo(currentIndex + 1)
          else if (info.offset.x > 50 && currentIndex > 0) goTo(currentIndex - 1)
        }}
      >
        <AnimatePresence custom={direction} initial={false}>
          <motion.div
            key={currentIndex}
            custom={direction}
            variants={SLIDE_VARIANTS}
            initial="enter"
            animate="center"
            exit="exit"
            className="absolute inset-0 flex items-center justify-center py-4"
          >
            <TutorialSlideComponent slide={slide} />
          </motion.div>
        </AnimatePresence>
      </motion.div>

      {/* Dots + CTA */}
      <div className="relative z-10 flex flex-col items-center gap-5 px-6 py-6 pb-safe">
        <TutorialDots
          total={TUTORIAL_SLIDES.length}
          current={currentIndex}
          accentColor={slide.accentColor}
        />

        <motion.button
          layout
          onClick={handleNext}
          className="w-full max-w-sm font-heading font-bold tracking-wide rounded-2xl transition-colors"
          style={{
            padding: isLast ? '16px 24px' : '14px 24px',
            background: isLast ? '#F59E0B' : 'rgba(255,255,255,0.08)',
            border: isLast ? 'none' : '1px solid rgba(255,255,255,0.1)',
            color: isLast ? '#0F172A' : '#CBD5E1',
            fontSize: isLast ? 18 : 16,
          }}
          transition={{ layout: { duration: 0.2 } }}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={isLast ? 'start' : 'next'}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.14 }}
              className="block"
            >
              {isLast ? 'Começar! ⚽' : 'Próximo →'}
            </motion.span>
          </AnimatePresence>
        </motion.button>
      </div>
    </div>
  )
}
