# 🔍 Arquitetura de Providers OCR

## Visão Geral

A aplicação usa uma arquitetura desacoplada de providers OCR que permite trocar diferentes engines de reconhecimento de texto sem modificar a lógica de negócio.

---

## Estrutura

```
src/
├── types/
│   └── ocrProvider.ts          ← Interface base
├── services/
│   └── ocrProviders/
│       ├── index.ts            ← Factory/Registry
│       └── googleVision.ts      ← Implementação Google Vision
├── stores/
│   └── ocrProviderStore.ts      ← Estado global do provider selecionado
└── components/scanner/
    └── GoogleVisionScanner.tsx  ← Usa provider selecionado
```

---

## Interface OCRProvider

```typescript
interface OCRProvider {
  id: OCRProviderType
  name: string
  description: string
  recognizeText(imageData: Blob | string): Promise<string>
}
```

**Responsabilidades:**
- `id`: Identificador único do provider
- `name`: Nome exibido no UI (ex: "Google Vision")
- `description`: Descrição técnica
- `recognizeText()`: Retorna texto extraído da imagem

---

## Adicionando Novo Provider

### 1️⃣ Criar implementação

Arquivo: `src/services/ocrProviders/tesseract.ts`

```typescript
import type { OCRProvider } from '@/types/ocrProvider'

export const tesseractProvider: OCRProvider = {
  id: 'tesseract',
  name: 'Tesseract.js',
  description: 'OCR open-source via Tesseract.js',

  async recognizeText(imageData: Blob | string): Promise<string> {
    // Implementar lógica com Tesseract
    const { Tesseract } = await import('tesseract.js')
    // ...
    return extractedText
  },
}
```

### 2️⃣ Registrar no Registry

Arquivo: `src/services/ocrProviders/index.ts`

```typescript
import { tesseractProvider } from './tesseract'

const PROVIDERS: Record<OCRProviderType, OCRProvider> = {
  'google-vision': googleVisionProvider,
  'tesseract': tesseractProvider,  // ← Adicionar
}
```

### 3️⃣ Adicionar tipo

Arquivo: `src/types/ocrProvider.ts`

```typescript
export type OCRProviderType = 'google-vision' | 'tesseract'  // ← Adicionar

export const OCR_PROVIDERS: Record<OCRProviderType, ...> = {
  'google-vision': { ... },
  'tesseract': {                     // ← Adicionar
    name: 'Tesseract.js',
    description: 'OCR open-source',
  },
}
```

---

## Fluxo de Uso

```
┌─────────────────────────────────────────┐
│  Tela: Tempo Real (Scanner)             │
│  ┌────────────────────────────────────┐ │
│  │ ⚡ TEMPO REAL                      │ │
│  │          [Google Vision ▼]          │ ← Combo box
│  │                                    │ │
│  │  Ao alterar: setSelectedProvider() │ │
│  └────────────────────────────────────┘ │
└─────────────────────────────────────────┘
            ↓
┌─────────────────────────────────────────┐
│  GoogleVisionScanner.tsx                 │
│  const ocrProvider = getOCRProvider(...) │
│  const text = await ocrProvider          │
│    .recognizeText(blob)                  │
└─────────────────────────────────────────┘
            ↓
┌─────────────────────────────────────────┐
│  ocrProviderStore (Zustand)              │
│  selectedProvider → "google-vision"      │
└─────────────────────────────────────────┘
            ↓
┌─────────────────────────────────────────┐
│  getOCRProvider("google-vision")         │
│  → googleVisionProvider instance         │
└─────────────────────────────────────────┘
            ↓
┌─────────────────────────────────────────┐
│  googleVisionProvider.recognizeText()    │
│  → Chamar Edge Function 'ocr'            │
│  → Retornar texto extraído               │
└─────────────────────────────────────────┘
```

---

## Seleção de Provider

A seleção é feita via **combo box** na tela de "Tempo Real":

```
Header: ⚡ TEMPO REAL [Google Vision ▼]
         |____________|
         setSelectedProvider("google-vision")
```

**Storage:** A seleção é armazenada em Zustand (estado global)

---

## Lógica de Negócio (Invariável)

Independente do provider selecionado:

1. ✅ Extrair texto da imagem
2. ✅ Validar e normalizar códigos
3. ✅ Enriquecer com status (novo/repetida/colada)
4. ✅ Mostrar preview com símbolos
5. ✅ Salvar no banco de dados

**Todos os providers retornam:**
- `string`: Texto extraído (OCR bruto)

**Processamento posterior (igual para todos):**
- `extractAndValidateCodes()` normaliza os códigos
- `enrichDetected()` enriquece com status do inventário

---

## Providers Disponíveis (Roadmap)

| Provider | Status | Custo | Offline | Acurácia |
|----------|--------|-------|---------|----------|
| **Google Vision** | ✅ Pronto | $$$ | ❌ Não | ⭐⭐⭐⭐⭐ |
| Tesseract.js | 🔜 Próximo | $0 | ✅ Sim | ⭐⭐⭐ |
| OpenCV + Tesseract | 🔜 Futuro | $0 | ✅ Sim | ⭐⭐⭐⭐ |
| AWS Textract | 📋 Planejado | $$ | ❌ Não | ⭐⭐⭐⭐ |
| Azure Vision | 📋 Planejado | $$ | ❌ Não | ⭐⭐⭐⭐ |

---

## Testes

### Testar novo provider

```typescript
import { getOCRProvider } from '@/services/ocrProviders'
import { extractAndValidateCodes } from '@/services/ocr'

const provider = getOCRProvider('tesseract')
const text = await provider.recognizeText(imageBlob)
const { codes } = await extractAndValidateCodes(text)
console.log(codes) // ['BRA 5', 'ESP 14', ...]
```

---

## Performance & Configuração

Por provider, você pode configurar:

- **Timeout:** Quanto tempo esperar pela resposta
- **Retry:** Quantas tentativas em caso de erro
- **Fallback:** Qual provider usar se falhar

Exemplo futuro:

```typescript
const provider = getOCRProvider('tesseract')
await provider.recognizeText(blob, {
  timeout: 30000,        // 30 segundos
  retries: 2,            // Tentar 2x se falhar
  fallback: 'google-vision'
})
```

---

**Criado em:** 2 de junho de 2026  
**Última atualização:** Implementação de arquitetura desacoplada
