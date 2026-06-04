# SESSION: Adicionar Tesseract.js como OCR Provider
# Projeto: figurinhas2026-web_V2 (Next.js 15 / Vercel)
# Leia este arquivo INTEIRO antes de escrever qualquer linha de código.

---

## 0. LEITURA OBRIGATÓRIA ANTES DE QUALQUER AÇÃO

Execute e mostre o output de cada comando. Não escreva código ainda.

```bash
# 1. Confirmar repositório
pwd

# 2. Verificar se tesseract.js já está instalado
cat package.json | grep tesseract

# 3. Ler o arquivo de registro de providers (pode ser index.ts ou similar)
ls src/services/ocrProviders/
cat src/services/ocrProviders/index.ts 2>/dev/null \
  || cat src/services/ocrProviders/providers.ts 2>/dev/null \
  || echo "NENHUM index.ts encontrado"

# 4. Ler o GoogleVisionScanner completo (tem o ComboBox existente)
cat src/components/scanner/GoogleVisionScanner.tsx

# 5. Verificar se há VALID_COUNTRY_CODES no ocrService.ts deprecated
grep -n "VALID_COUNTRY_CODES\|validCodes\|stickerCodes" src/services/ocrService.ts 2>/dev/null | head -30

# 6. Ler tokens relevantes para o ComboBox
grep -A3 "primary\|gold\|ink\|scarlet" src/theme/tokens.ts | head -40
```

Aguarde confirmação antes de continuar.

---

## 1. CONTEXTO — O QUE JÁ EXISTE (NÃO TOCAR)

```
src/types/ocrProvider.ts        → define OCRProviderType + interface OCRProvider
src/services/ocrProviders/
  googleVision.ts               → implementação Google Vision via Supabase Edge Function
src/stores/ocrProviderStore.ts  → Zustand store com selectedProvider + setSelectedProvider
src/components/scanner/
  GoogleVisionScanner.tsx       → componente principal com ComboBox no header
src/services/ocrService.ts      → DEPRECATED, não tocar
```

A arquitetura já suporta múltiplos providers.
Esta sessão adiciona o Tesseract como segundo provider.

---

## 2. ESCOPO EXATO — 4 ARQUIVOS, NADA MAIS

```
MODIFICAR (cirúrgico):
  src/types/ocrProvider.ts              → adicionar 'tesseract' ao union type

CRIAR (novo):
  src/services/ocrProviders/tesseract.ts → implementação do provider Tesseract

MODIFICAR (registrar):
  src/services/ocrProviders/index.ts    → adicionar tesseractProvider no mapa
  (se não existir index.ts: criar)

MODIFICAR (mínimo):
  src/components/scanner/GoogleVisionScanner.tsx
  → o ComboBox já existe, só precisa enxergar a nova opção
  → verificar se a lista de providers é hardcoded ou vem do registro
```

**REGRA:** Se um arquivo não está nesta lista, não será tocado.

---

## 3. PASSO 1 — MODIFICAR types/ocrProvider.ts

Alterar APENAS o tipo `OCRProviderType`. Nenhuma outra linha muda.

```typescript
// ANTES:
export type OCRProviderType = 'google-vision'

// DEPOIS:
export type OCRProviderType = 'google-vision' | 'tesseract'
```

Atualizar o objeto `OCR_PROVIDERS` com o novo entry:

```typescript
const OCR_PROVIDERS = {
  'google-vision': {
    name: 'Google Vision',
    description: 'Google Cloud Vision API',
  },
  'tesseract': {
    name: 'Tesseract (Offline)',
    description: 'Processamento local, sem custo. Funciona sem internet.',
  },
}
```

Após esta alteração: `npx tsc --noEmit 2>&1 | head -20`
Se houver erros de tipo, corrija antes de continuar.

---

## 4. PASSO 2 — INSTALAR tesseract.js

```bash
npm install tesseract.js
```

Verificar que foi adicionado ao package.json antes de continuar.

---

## 5. PASSO 3 — CRIAR src/services/ocrProviders/tesseract.ts

Este arquivo implementa a interface `OCRProvider` definida em `types/ocrProvider.ts`.
Não criar nova interface — implementar a que existe.

```typescript
'use client'

// ATENÇÃO: Verificar o import path exato de OCRProvider antes de escrever.
// O tipo está em src/types/ocrProvider.ts
// O path de import depende do tsconfig.paths do projeto — verificar antes.
import type { OCRProvider } from '@/types/ocrProvider'
import { createWorker } from 'tesseract.js'
import type { Worker } from 'tesseract.js'

// ─── PRÉ-PROCESSAMENTO ────────────────────────────────────────────────────
// Usa Canvas API nativa — zero dependências externas.
// Roda 100% no browser. NÃO usar sharp, jimp ou Node.js image libs.

async function preprocessForOcr(input: Blob | string): Promise<string> {
  // Converter input para dataURL se necessário
  const dataUrl: string = typeof input === 'string'
    ? input
    : await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(input)
      })

  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      // Normalizar para 800px de largura mantendo aspect ratio
      const targetWidth = 800
      const scale = targetWidth / img.width
      canvas.width = targetWidth
      canvas.height = img.height * scale

      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

      // Grayscale + contrast boost via pixel manipulation
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const data = imageData.data
      const contrastFactor = 1.8
      const intercept = 128 * (1 - contrastFactor)

      for (let i = 0; i < data.length; i += 4) {
        // Grayscale: luminância ponderada
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
        // Contrast boost
        const enhanced = Math.min(255, Math.max(0, contrastFactor * gray + intercept))
        data[i] = data[i + 1] = data[i + 2] = enhanced
        // data[i + 3] = alpha, não alterar
      }

      ctx.putImageData(imageData, 0, 0)
      resolve(canvas.toDataURL('image/jpeg', 0.95))
    }
    img.onerror = () => resolve(dataUrl) // fallback: usar original
    img.src = dataUrl
  })
}

// ─── VALIDAÇÃO DE CÓDIGO ──────────────────────────────────────────────────
// Regex para extrair padrão de código de figurinha do texto bruto do OCR.
// Padrão: 2-4 letras maiúsculas seguidas de 1-2 dígitos (espaço opcional).
// Exemplos válidos: "FWC12", "FWC 12", "BRA5", "BRA 05"
const CODE_REGEX = /\b([A-Z]{2,4})\s?(\d{1,2})\b/g

// Distância de Levenshtein — sem dependência externa
// Otimizado para strings curtas (máx ~8 chars)
function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[m][n]
}

// Lista de códigos válidos do álbum Copa 2026 (980 no total)
// Geração programática a partir dos prefixos conhecidos.
// ATENÇÃO: adicionar os demais prefixos conforme disponibilidade dos dados reais.
// NÃO inventar prefixos — usar apenas os confirmados no álbum físico.
function buildValidCodes(): Set<string> {
  const sections: Record<string, number> = {
    FWC: 22,  // FIFA World Cup (abertura, troféu, mascote, estádios)
    BRA: 20,  // Brasil
    ARG: 20,  // Argentina
    FRA: 20,  // França
    ENG: 20,  // Inglaterra
    GER: 20,  // Alemanha
    ESP: 20,  // Espanha
    POR: 20,  // Portugal
    NED: 20,  // Holanda
    USA: 20,  // Estados Unidos
    MEX: 20,  // México
    CAN: 20,  // Canadá
    // TODO: adicionar as demais 36 seleções quando dados confirmados
  }
  const codes = new Set<string>()
  for (const [prefix, count] of Object.entries(sections)) {
    for (let i = 1; i <= count; i++) {
      codes.add(`${prefix}${i}`)
    }
  }
  return codes
}

const VALID_CODES = buildValidCodes()

function extractAndValidateCode(rawText: string): string | null {
  const normalized = rawText.toUpperCase().trim()
  const matches = [...normalized.matchAll(CODE_REGEX)]
  const candidates = matches.map(m => `${m[1]}${m[2]}`)

  // 1. Match exato
  for (const candidate of candidates) {
    if (VALID_CODES.has(candidate)) return candidate
  }

  // 2. Correção por Levenshtein (distância ≤ 1: aceitar automaticamente)
  // Distância 1 cobre erros típicos de OCR: O↔0, I↔1, Z↔2, S↔5
  if (candidates.length === 0) return null

  const query = candidates[0]
  const sectionPrefix = query.match(/^([A-Z]{2,4})/)?.[1]
  const searchSpace = sectionPrefix
    ? Array.from(VALID_CODES).filter(c => c.startsWith(sectionPrefix))
    : Array.from(VALID_CODES)

  let bestMatch: string | null = null
  let bestDist = Infinity

  for (const code of searchSpace) {
    const dist = levenshtein(query, code)
    if (dist < bestDist) {
      bestDist = dist
      bestMatch = code
    }
  }

  // Aceitar automaticamente apenas distância 1
  // Distância 2+ requer confirmação do usuário (tratado pelo componente)
  return bestDist <= 1 ? bestMatch : null
}

// ─── WORKER SINGLETON ─────────────────────────────────────────────────────
// Uma única instância por sessão do browser.
// Lazy init: só inicializa quando recognize() for chamado pela primeira vez.

let workerInstance: Worker | null = null
let workerInitPromise: Promise<Worker> | null = null

async function getWorker(): Promise<Worker> {
  if (workerInstance) return workerInstance
  if (workerInitPromise) return workerInitPromise

  workerInitPromise = (async () => {
    const worker = await createWorker('eng', 1, {
      logger: process.env.NODE_ENV === 'development'
        ? (m: unknown) => console.debug('[Tesseract]', m)
        : undefined,
    })

    await worker.setParameters({
      // Whitelist: apenas chars que aparecem em códigos de figurinha
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ',
      // PSM 7: imagem contém uma única linha de texto (ideal para o badge da figurinha)
      tessedit_pageseg_mode: '7',
      // OEM 1: LSTM only — mais preciso para textos curtos
      tessedit_ocr_engine_mode: '1',
    })

    workerInstance = worker
    return worker
  })()

  return workerInitPromise
}

// ─── PROVIDER EXPORT ──────────────────────────────────────────────────────

export const tesseractProvider: OCRProvider = {
  id: 'tesseract',
  name: 'Tesseract (Offline)',
  description: 'Processamento local, sem custo. Funciona sem internet.',

  async recognizeText(imageData: Blob | string): Promise<string> {
    // 1. Pré-processar
    let processedData: string
    try {
      processedData = await preprocessForOcr(imageData)
    } catch {
      // Fallback: usar dado original se pré-processamento falhar
      processedData = typeof imageData === 'string'
        ? imageData
        : URL.createObjectURL(imageData)
    }

    // 2. OCR
    const worker = await getWorker()
    const { data } = await worker.recognize(processedData)
    const rawText = data.text.trim()

    // 3. Extrair e validar código
    const code = extractAndValidateCode(rawText.toUpperCase())

    // Retornar o código validado se encontrado, ou o texto bruto para
    // que o componente DecisÃ£o possa tratar (input manual, sugestão, etc.)
    return code ?? rawText
  },
}
```

Após criar: `npx tsc --noEmit 2>&1 | head -30`
Corrigir qualquer erro antes de continuar.

---

## 6. PASSO 4 — REGISTRAR O PROVIDER

Verificar se existe `src/services/ocrProviders/index.ts`.

**Se existir:** adicionar o tesseractProvider seguindo o padrão exato do arquivo.

**Se não existir:** criar com este conteúdo mínimo:

```typescript
import { googleVisionProvider } from './googleVision'
import { tesseractProvider } from './tesseract'
import type { OCRProviderType } from '@/types/ocrProvider'

// Verificar o import path de OCRProvider — pode variar conforme tsconfig.paths
// NÃO assumir — verificar cat tsconfig.json | grep paths antes de escrever

export const ocrProviders = {
  'google-vision': googleVisionProvider,
  'tesseract': tesseractProvider,
} satisfies Record<OCRProviderType, unknown>

export function getOcrProvider(id: OCRProviderType) {
  return ocrProviders[id]
}
```

---

## 7. PASSO 5 — ATUALIZAR GoogleVisionScanner.tsx (MÍNIMO)

### Protocolo obrigatório antes de modificar

```bash
# Ler o arquivo completo
cat src/components/scanner/GoogleVisionScanner.tsx

# Identificar:
# 1. Como o ComboBox atual busca a lista de providers (hardcoded ou de ocrProviders?)
# 2. Onde está o handler que troca de provider
# 3. Qual componente de UI é usado para o ComboBox (select nativo? componente custom?)
```

### O que modificar

O ComboBox no header já existe com o label `⚡ TEMPO REAL [Google Vision ▼]`.

A modificação necessária depende de como a lista está construída:

**Caso A — Lista hardcoded no componente:**
```typescript
// ANTES (exemplo — verificar o real):
const providers = [{ id: 'google-vision', name: 'Google Vision' }]

// DEPOIS:
import { ocrProviders } from '@/services/ocrProviders'
const providers = Object.values(ocrProviders).map(p => ({ id: p.id, name: p.name }))
```

**Caso B — Lista já vem de um registro central:**
Apenas garantir que o registro inclui o tesseractProvider (Passo 4 já resolve).

**Caso C — Apenas o tipo estava restringindo:**
Apenas o Passo 1 (adicionar 'tesseract' ao union type) já resolve.

Após ler o arquivo, reportar qual caso se aplica antes de modificar.

---

## 8. CHECKLIST DE EXECUÇÃO

```
[ ] 0. Executar comandos da Seção 0 e aguardar confirmação
[ ] 1. Modificar src/types/ocrProvider.ts → adicionar 'tesseract' ao union
[ ] 2. tsc --noEmit → zero erros antes de continuar
[ ] 3. npm install tesseract.js → confirmar no package.json
[ ] 4. Criar src/services/ocrProviders/tesseract.ts
[ ] 5. tsc --noEmit → zero erros antes de continuar
[ ] 6. Verificar/criar src/services/ocrProviders/index.ts
[ ] 7. tsc --noEmit → zero erros antes de continuar
[ ] 8. Ler GoogleVisionScanner.tsx completo → identificar caso A/B/C
[ ] 9. Reportar qual caso se aplica → aguardar confirmação
[ ] 10. Aplicar modificação mínima no GoogleVisionScanner
[ ] 11. tsc --noEmit → zero erros
[ ] 12. npm run build → build de produção limpo
```

---

## 9. TESTES MANUAIS

```
Teste 1 — ComboBox exibe nova opção
  Abrir tela de scan → header mostra "Google Vision ▼" e "Tesseract (Offline)"

Teste 2 — Seleção persiste via Zustand store
  Selecionar Tesseract → navegar para outra tela → voltar → Tesseract ainda selecionado

Teste 3 — Google Vision inalterado
  Selecionar Google Vision → fotografar → resultado idêntico ao de antes desta sessão

Teste 4 — Tesseract reconhece FWC12
  Selecionar Tesseract → fotografar figurinha FWC12 → resultado "FWC12"

Teste 5 — Fallback para texto bruto
  Selecionar Tesseract → foto de objeto aleatório → retorna texto bruto (não trava)

Teste 6 — Build Vercel
  npm run build → zero erros → confirmar que não há import de módulo Node.js
  no bundle client (sharp, fs, path, etc.)
```

---

## 10. RISCOS MAPEADOS E MITIGAÇÕES

| Risco | Mitigação já no código |
|-------|----------------------|
| tesseract.js bundle ~4MB aumenta LCP | Worker lazy init — só carrega quando Tesseract é selecionado |
| `createWorker` chamado no servidor (SSR) | Guard `typeof window !== 'undefined'` via `'use client'` |
| Import path de OCRProvider errado | Seção 0 verifica tsconfig.paths antes de escrever qualquer import |
| GoogleVisionScanner com lista hardcoded | Passo 7 define protocolo de leitura antes de modificar |
| ocrService.ts deprecated sendo tocado | Listado explicitamente como fora do escopo |
| Levenshtein muito permissivo | Limite máximo distância 1 para aceite automático |

---

## 11. FORA DO ESCOPO — NÃO IMPLEMENTAR

```
- src/services/ocrService.ts (deprecated — não tocar)
- src/app/(app)/ocr-lab (não é a sessão de lab)
- Qualquer componente fora de GoogleVisionScanner.tsx
- pHash / fingerprinting visual
- Crowdsourcing de imagens
- Persistência da seleção em localStorage (já está no Zustand store)
- Qualquer alteração no fluxo de salvamento no Supabase
```

---

## FIM

Confirme que leu respondendo: "Entendido — executando Seção 0."
Execute os 6 comandos da Seção 0 e mostre o output completo antes de continuar.
