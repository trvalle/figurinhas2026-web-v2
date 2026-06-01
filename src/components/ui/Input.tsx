'use client'
import type { InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export default function Input({ label, error, className = '', ...rest }: InputProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-ink-400 text-sm font-body">{label}</label>
      )}
      <input
        className={[
          'w-full bg-white/5 border rounded-xl px-4 py-3',
          'text-ink-100 text-base font-body',
          'placeholder:text-ink-600',
          'outline-none transition-all duration-150',
          error
            ? 'border-scarlet-500 focus:border-scarlet-400 focus:ring-2 focus:ring-scarlet-500/15'
            : 'border-white/10 focus:border-gold-500 focus:ring-2 focus:ring-gold-500/15',
          className,
        ].join(' ')}
        {...rest}
      />
      {error && (
        <span className="text-scarlet-400 text-xs font-body">{error}</span>
      )}
    </div>
  )
}
