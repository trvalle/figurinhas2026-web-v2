'use client'
import { useRef, useState } from 'react'
import { ImageIcon, X } from 'lucide-react'
import toast from 'react-hot-toast'

interface GalleryUploadProps {
  onCodes: (codes: string[]) => void
  onClose: () => void
}

const MAX_FILES = 5

export function GalleryUpload({ onCodes, onClose }: GalleryUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [previews, setPreviews]   = useState<string[]>([])
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress]   = useState(0)
  const [statusMsg, setStatusMsg] = useState('')

  const handleFiles = async (files: FileList) => {
    const selected = Array.from(files).slice(0, MAX_FILES)
    setPreviews(selected.map((f) => URL.createObjectURL(f)))
    setProcessing(true)
    setProgress(0)
    setStatusMsg('Enviando para análise…')

    try {
      const { recognizeText, extractAndValidateCodes } = await import('@/services/ocr')
      const allCodes = new Set<string>()
      let lastRaw = ''

      for (let i = 0; i < selected.length; i++) {
        setStatusMsg(`Analisando imagem ${i + 1} de ${selected.length}…`)
        const text = await recognizeText(selected[i]!)
        const { codes } = await extractAndValidateCodes(text)
        codes.forEach((c) => allCodes.add(c))
        lastRaw = text
        setProgress(Math.round(((i + 1) / selected.length) * 100))
      }

      if (allCodes.size === 0) {
        const preview = lastRaw.replace(/\s+/g, ' ').trim().slice(0, 60)
        toast.error(
          preview ? `Nenhuma figurinha identificada.\nOCR leu: "${preview}"` : 'Nenhuma figurinha identificada. Tente fotos mais nítidas.',
          { duration: 5000 },
        )
      }
      onCodes([...allCodes])
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      toast.error(msg.includes('GOOGLE_CLOUD_VISION_KEY') ? 'API Key não configurada.' : 'Erro ao analisar imagens. Verifique sua conexão.')
    } finally {
      setProcessing(false)
      setStatusMsg('')
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-heading font-bold text-ink-100">Galeria</h2>
        <button onClick={onClose} className="text-ink-400 hover:text-ink-200"><X size={20} /></button>
      </div>

      <button
        onClick={() => inputRef.current?.click()}
        disabled={processing}
        className="border-2 border-dashed border-ink-600 hover:border-gold-500/50 rounded-xl p-8 flex flex-col items-center gap-3 transition-colors disabled:opacity-50"
      >
        <ImageIcon size={32} className="text-ink-500" />
        <p className="text-ink-400 text-sm font-body text-center">
          Toque para selecionar fotos<br />
          <span className="text-ink-600 text-xs">Até {MAX_FILES} imagens</span>
        </p>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => e.target.files && void handleFiles(e.target.files)}
      />

      {previews.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {previews.map((src, i) => (
            <div key={i} className="aspect-square rounded-lg overflow-hidden bg-ink-800">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={`Preview ${i + 1}`} className="w-full h-full object-cover" />
            </div>
          ))}
        </div>
      )}

      {processing && (
        <div className="space-y-2">
          <div className="flex justify-between text-xs font-body text-ink-400">
            <span>{statusMsg}</span>
            <span>{progress}%</span>
          </div>
          <div className="h-1.5 bg-ink-700 rounded-full overflow-hidden">
            <div className="h-full bg-gold-500 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}
    </div>
  )
}
