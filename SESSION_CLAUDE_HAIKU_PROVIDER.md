# SESSION: Implementar Claude Haiku 4.5 como OCR Provider
# Projeto: figurinhas2026-web_V2 (Next.js 15 / Vercel)
# Leia este arquivo INTEIRO antes de escrever qualquer linha de código.

---

## 0. LEITURA OBRIGATÓRIA ANTES DE QUALQUER AÇÃO

Execute e mostre o output antes de continuar:

```bash
# Confirmar repositório correto
pwd

# Confirmar que types/ocrProvider.ts tem 'tesseract' no union type
cat src/types/ocrProvider.ts

# Confirmar estrutura atual de ocrProviders
ls src/services/ocrProviders/
cat src/services/ocrProviders/index.ts
```

Aguarde confirmação antes de continuar.

---

## 1. CONTEXTO

**O que já existe e NÃO deve ser alterado:**
- `src/types/ocrProvider.ts` — interface OCRProvider + union OCRProviderType
- `src/services/ocrProviders/googleVision.ts` — provider Google Vision
- `src/services/ocrProviders/tesseract.ts` — provider Tesseract
- `src/services/ocrProviders/index.ts` — registro de providers
- `src/stores/ocrProviderStore.ts` — Zustand store
- `src/components/scanner/GoogleVisionScanner.tsx` — componente com ComboBox

**O que será criado:**
```
src/app/api/ocr/route.ts                    ← API Route Next.js (server-side)
src/services/ocrProviders/claudeHaiku.ts    ← Provider Claude Haiku
```

**O que será modificado (mínimo):**
```
src/types/ocrProvider.ts          ← adicionar 'claude-haiku' ao union
src/services/ocrProviders/index.ts ← registrar claudeHaikuProvider
.env.local                         ← adicionar ANTHROPIC_API_KEY
```

---

## 2. REGRAS ABSOLUTAS

```
NUNCA expor ANTHROPIC_API_KEY no browser (sem NEXT_PUBLIC_ prefix)
NUNCA modificar googleVision.ts ou tesseract.ts
NUNCA usar `any` no TypeScript
NUNCA assumir path de import — verificar antes de escrever
SEMPRE verificar se arquivo existe antes de criar
SEMPRE seguir o padrão exato dos providers existentes
```

---

## 3. PASSO 1 — INSTALAR SDK

```bash
npm install @anthropic-ai/sdk
```

Confirmar no package.json antes de continuar.

---

## 4. PASSO 2 — CONFIGURAR VARIÁVEL DE AMBIENTE

Adicionar ao `.env.local`:

```
ANTHROPIC_API_KEY=sua_chave_aqui
```

**IMPORTANTE:** A chave não tem prefixo `NEXT_PUBLIC_`.
Isso garante que ela fique apenas no servidor, nunca exposta no browser.

Após adicionar, confirmar com:
```bash
grep "ANTHROPIC" .env.local
```

---

## 5. PASSO 3 — CRIAR API ROUTE (src/app/api/ocr/route.ts)

Esta é a única parte que roda no servidor e tem acesso à chave Anthropic.

```typescript
// src/app/api/ocr/route.ts
// NÃO adicionar 'use client' — esta rota roda apenas no servidor

import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

// Instância singleton do cliente Anthropic
// Reutilizada entre requisições para eficiência
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export async function POST(request: NextRequest) {
  // Verificar se a chave está configurada
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY não configurada' },
      { status: 500 }
    )
  }

  let imageBase64: string
  let mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'

  try {
    const body = await request.json()
    imageBase64 = body.image
    mediaType = body.mediaType ?? 'image/jpeg'

    if (!imageBase64) {
      return NextResponse.json(
        { error: 'Campo "image" obrigatório (base64)' },
        { status: 400 }
      )
    }
  } catch {
    return NextResponse.json(
      { error: 'Body inválido — esperado JSON com campo "image"' },
      { status: 400 }
    )
  }

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 50, // Resposta curta — apenas o código da figurinha
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: imageBase64,
              },
            },
            {
              type: 'text',
              text: `Esta é a foto do verso de uma figurinha da Copa do Mundo FIFA 2026 (Panini).
No canto superior direito há um badge escuro com o código da figurinha.
O código tem o formato: 2 a 4 letras maiúsculas seguidas de 1 ou 2 números.
Exemplos: TUR 1, IRQ 19, BRA 5, FWC 12, SCO 16.

Retorne APENAS o código da figurinha, sem explicações, sem pontuação.
Se não conseguir identificar o código, retorne apenas: UNKNOWN`,
            },
          ],
        },
      ],
    })

    // Extrair texto da resposta
    const textBlock = response.content.find(block => block.type === 'text')
    const text = textBlock && textBlock.type === 'text' ? textBlock.text.trim() : 'UNKNOWN'

    return NextResponse.json({
      text,
      model: response.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    })
  } catch (error) {
    console.error('[Claude Haiku OCR] Erro:', error)
    return NextResponse.json(
      { error: 'Erro ao processar imagem com Claude Haiku' },
      { status: 500 }
    )
  }
}
```

Após criar, executar:
```bash
npx tsc --noEmit 2>&1 | head -20
```

---

## 6. PASSO 4 — CRIAR PROVIDER (src/services/ocrProviders/claudeHaiku.ts)

Seguir exatamente o mesmo padrão do googleVision.ts.

Antes de escrever, ler:
```bash
cat src/services/ocrProviders/googleVision.ts
```

```typescript
// src/services/ocrProviders/claudeHaiku.ts
// 'use client' — este provider roda no browser mas chama API Route server-side

'use client'

// Verificar path real de OCRProvider antes de escrever este import
// cat src/types/ocrProvider.ts para confirmar o caminho
import type { OCRProvider } from '@/types/ocrProvider'

// Reutilizar toBase64 do googleVision — verificar se está exportada
// Se não estiver exportada, reimplementar aqui
async function toBase64(imageData: Blob | string): Promise<string> {
  if (typeof imageData === 'string') return imageData
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '')
    reader.onerror = reject
    reader.readAsDataURL(imageData)
  })
}

export const claudeHaikuProvider: OCRProvider = {
  id: 'claude-haiku',
  name: 'Claude Haiku (IA)',
  description: 'Claude Haiku 4.5 — Alta precisão para identificação de códigos.',

  async recognizeText(imageData: Blob | string): Promise<string> {
    const base64 = await toBase64(imageData)

    const response = await fetch('/api/ocr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image: base64,
        mediaType: 'image/jpeg',
      }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Erro desconhecido' }))
      throw new Error(error.error ?? `HTTP ${response.status}`)
    }

    const data = await response.json()
    console.debug('[Claude Haiku OCR] resultado:', data.text, `(${data.inputTokens}+${data.outputTokens} tokens)`)

    // Retornar UNKNOWN como string vazia para o pipeline tratar como não identificado
    return data.text === 'UNKNOWN' ? '' : data.text
  },
}
```

Após criar, executar:
```bash
npx tsc --noEmit 2>&1 | head -20
```

---

## 7. PASSO 5 — ATUALIZAR types/ocrProvider.ts

Adicionar 'claude-haiku' ao union type.

Verificar arquivo atual antes:
```bash
cat src/types/ocrProvider.ts
```

Modificação:
```typescript
// ANTES:
export type OCRProviderType = 'google-vision' | 'tesseract'

// DEPOIS:
export type OCRProviderType = 'google-vision' | 'tesseract' | 'claude-haiku'
```

Adicionar entry no objeto OCR_PROVIDERS:
```typescript
'claude-haiku': {
  name: 'Claude Haiku (IA)',
  description: 'Claude Haiku 4.5 — Alta precisão.',
},
```

Após modificar:
```bash
npx tsc --noEmit 2>&1 | head -20
```

Erro esperado: Property 'claude-haiku' missing in index.ts — será resolvido no próximo passo.

---

## 8. PASSO 6 — REGISTRAR EM index.ts

Verificar arquivo atual:
```bash
cat src/services/ocrProviders/index.ts
```

Adicionar import e entry seguindo exatamente o padrão existente:

```typescript
import { claudeHaikuProvider } from './claudeHaiku'

// No objeto/mapa de providers, adicionar:
'claude-haiku': claudeHaikuProvider,
```

Após modificar:
```bash
npx tsc --noEmit 2>&1 | head -20
```

Resultado esperado: zero errors.

---

## 9. PASSO 7 — CONFIGURAR VERCEL

A ANTHROPIC_API_KEY precisa estar nas variáveis de ambiente da Vercel para funcionar em staging/produção. NÃO apenas no .env.local.

```bash
# Verificar se Vercel CLI está disponível
npx vercel env ls 2>/dev/null | head -10

# Se disponível, adicionar:
# npx vercel env add ANTHROPIC_API_KEY
# (vai pedir o valor interativamente)
```

Se o CLI não estiver disponível ou não funcionar:
- Reportar que a chave precisa ser adicionada manualmente
- Acessar: Vercel Dashboard → projeto → Settings → Environment Variables
- Adicionar: ANTHROPIC_API_KEY = [valor da chave]
- Selecionar: Production + Preview + Development

---

## 10. CHECKLIST DE EXECUÇÃO

```
[ ] 0. Executar comandos da Seção 0 e aguardar confirmação
[ ] 1. npm install @anthropic-ai/sdk → confirmar no package.json
[ ] 2. Adicionar ANTHROPIC_API_KEY ao .env.local
[ ] 3. Criar src/app/api/ocr/route.ts
[ ] 4. tsc --noEmit → zero errors
[ ] 5. Ler googleVision.ts → confirmar padrão de export
[ ] 6. Criar src/services/ocrProviders/claudeHaiku.ts
[ ] 7. tsc --noEmit → zero errors
[ ] 8. Modificar src/types/ocrProvider.ts → adicionar 'claude-haiku'
[ ] 9. Modificar src/services/ocrProviders/index.ts → registrar provider
[ ] 10. tsc --noEmit → zero errors (zero mesmo)
[ ] 11. Configurar ANTHROPIC_API_KEY na Vercel
[ ] 12. npm run build → zero errors
[ ] 13. npx vercel → deploy staging
[ ] 14. Testar: dropdown mostra 3 opções?
[ ] 15. Testar: Claude Haiku identifica TUR 1 corretamente?
[ ] 16. Testar: 3 capturas seguidas funcionam?
[ ] 17. Testar: Google Vision e Tesseract não foram afetados?
```

---

## 11. TESTES MANUAIS

```
Teste 1 — Dropdown com 3 opções
  Esperado: "Google Vision", "Tesseract (Offline)", "Claude Haiku (IA)"

Teste 2 — Claude Haiku, foto nítida
  Selecionar Claude Haiku → fotografar TUR 1
  Esperado: retorna "TUR 1" ou "TUR1"

Teste 3 — Claude Haiku, 3 capturas seguidas
  Esperado: todas identificam corretamente (sem bug de estado)

Teste 4 — Log de tokens no console
  F12 → Console → ver linha:
  [Claude Haiku OCR] resultado: TUR 1 (450+5 tokens)

Teste 5 — Regressão Google Vision e Tesseract
  Trocar para cada um → fotografar → comportamento igual ao de antes
```

---

## 12. RISCOS E MITIGAÇÕES

| Risco | Mitigação |
|-------|-----------|
| ANTHROPIC_API_KEY não configurada na Vercel | Passo 7 obrigatório antes do deploy |
| Modelo 'claude-haiku-4-5' depreciado ou renomeado | Verificar docs.anthropic.com se der erro 404 |
| max_tokens=50 insuficiente para algum caso | Aumentar para 100 se retornar texto cortado |
| CORS na API Route | Next.js /app/api não tem CORS por padrão — ok |
| Custo inesperado | ~$0,00053 por foto — monitorar no Anthropic Dashboard |

---

## 13. FORA DO ESCOPO

```
- Corrigir Google Vision (Edge Function não existe — sessão separada)
- Implementar retry automático na API Route
- Rate limiting na API Route
- Métricas de uso por usuário
- Cache de resultados OCR
```

---

## FIM

Confirme que leu respondendo: "Entendido — executando Seção 0."
Execute os comandos da Seção 0 e mostre o output antes de continuar.
