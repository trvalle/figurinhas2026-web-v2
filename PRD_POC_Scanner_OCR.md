# 🏆 FIGURINHAS COPA 2026
## PRD — POC Scanner OCR com Fallback Vision API

**Feature: Botão LAB (restrito: trvalle@gmail.com)**

*TB Implantação de Sistemas | Versão 1.0 | Maio 2026*

---

## 1. Contexto e Motivação

O app Figurinhas Copa 2026 utiliza Google Cloud Vision API para identificar códigos de figurinhas (padrão XXX 00) via câmera. Em testes de admin, o custo por requisição é irrelevante. Porém, ao liberar o scanner para usuários finais, o modelo de custo muda radicalmente:

| Usuários | Fotos/figurinha | Total req/mês | Custo estimado |
|---|---|---|---|
| 100 | 2-3 | ~190.000 | $285 |
| 500 | 2-3 | ~960.000 | $1.440 |
| 1.000 | 2-3 | ~1.920.000 | $2.880 |

Premissa: álbum tem 980 figurinhas. Usuário médio tira 2-3 fotos por figurinha até acertar a leitura.

> **Conclusão: Vision API como rota padrão é inviável acima de 100 usuários ativos.**

---

## 2. Objetivo da POC

Validar, no ambiente de admin (botão LAB), uma arquitetura de OCR em camadas que:

- Usa Tesseract.js (gratuito) como primeira tentativa de leitura
- Escala para Google Cloud Vision apenas quando Tesseract falha ou tem confiança baixa
- Aplica cache local para eliminar chamadas redundantes
- Impõe rate limit diário por usuário para controle de custo
- Oferece entrada manual como alternativa zero-custo sempre visível

> **Impacto esperado: redução de 70-80% nas chamadas Vision API em produção.**

---

## 3. Escopo

### 3.1 Dentro do escopo

- Botão LAB na área de admin — visível somente para trvalle@gmail.com
- Pipeline OCR em camadas: Cache → Tesseract → Vision API → Manual
- Pré-processamento de imagem (contraste, grayscale, crop)
- Rate limit: 30 chamadas Vision/dia por usuário (configurável)
- Cache local via IndexedDB (figurinhas já identificadas não chamam API)
- Tela de confirmação antes de persistir — elimina loop de fotos repetidas
- Log de debug visível na interface LAB

### 3.2 Fora do escopo

- Rollout para usuários finais (depende dos resultados da POC)
- OCR em tempo real contínuo (frame-by-frame) — apenas captura manual
- Identificação por imagem visual do jogador (requer modelo treinado)
- Integração com Supabase nesta POC — resultado é exibido na tela apenas

---

## 4. Controle de Acesso — Botão LAB

O botão LAB deve aparecer exclusivamente para o usuário autenticado com e-mail `trvalle@gmail.com`. Nenhum outro usuário — independente de role ou permissão — deve visualizar ou acessar a feature durante a POC.

### 4.1 Lógica de guard

```typescript
// utils/labAccess.ts
const LAB_WHITELIST = ['trvalle@gmail.com'];

export function isLabUser(email: string | null | undefined): boolean {
  if (!email) return false;
  return LAB_WHITELIST.includes(email.toLowerCase());
}
```

### 4.2 Renderização condicional

```typescript
// No componente de admin
const { data: { user } } = await supabase.auth.getUser();

{isLabUser(user?.email) && (
  <button onClick={() => router.push('/admin/lab/scanner')}>
    🧪 LAB — Scanner OCR
  </button>
)}
```

> *Observação: a validação deve ocorrer tanto no client (renderização) quanto no server (middleware de rota), impedindo acesso direto via URL.*

---

## 5. Arquitetura do Pipeline OCR

### 5.1 Fluxo em camadas

```
Usuário captura foto
       │
       ▼
┌─────────────────────────────┐
│  1. CACHE (IndexedDB)       │  ← Gratuito
│  Já identificou esse hash?  │
└──────────┬──────────────────┘
   HIT ◄───┘    MISS
           │
           ▼
┌─────────────────────────────┐
│  2. PRÉ-PROCESSAMENTO       │  ← Gratuito
│  Crop + Contraste + Gray    │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│  3. TESSERACT.JS            │  ← Gratuito
│  Confiança ≥ 70%?           │
└──────────┬──────────────────┘
   OK ◄────┘    BAIXA CONFIANÇA
           │
           ▼
┌─────────────────────────────┐
│  4. RATE LIMIT CHECK        │  ← Gratuito
│  Usuário tem créditos?      │
└──────────┬──────────────────┘
   SEM CRÉDITO → MANUAL
           │ COM CRÉDITO
           ▼
┌─────────────────────────────┐
│  5. GOOGLE CLOUD VISION     │  ← Pago ($1.50/1k)
│  Resultado + decrementa     │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│  6. CONFIRMAÇÃO USUÁRIO     │  ← UX
│  Exibe resultado p/ validar │
└──────────┬──────────────────┘
           │
           ▼
      Persiste resultado
```

### 5.2 Estrutura do cache (IndexedDB)

```typescript
interface CacheEntry {
  imageHash: string;      // MD5 do blob da imagem
  result: { pais: string; numero: string };
  confianca: number;
  source: 'tesseract' | 'vision';
  createdAt: number;      // timestamp — expira em 7 dias
}
```

### 5.3 Rate limit (localStorage)

```typescript
interface RateLimitState {
  date: string;             // 'YYYY-MM-DD'
  visionCallsUsed: number;
  visionCallsLimit: number; // default: 30
}

// Reseta automaticamente ao virar o dia
function checkRateLimit(): boolean {
  const state = getRateLimitState();
  if (state.date !== today()) resetDailyCount();
  return state.visionCallsUsed < state.visionCallsLimit;
}
```

---

## 6. Lógica de Extração de Código

Padrão alvo: sigla de 3 letras maiúsculas + espaço + número de 1 a 3 dígitos.
Exemplos válidos: `BRA 5`, `ARG 12`, `FRA 243`

```typescript
// Extração + validação contra lista de países
const PAISES_VALIDOS = ['BRA','ARG','FRA','ENG','ESP', /* ... */];

function extrairCodigo(textoOCR: string): ExtractionResult | null {
  const regex = /\b([A-Z]{3})\s?(\d{1,3})\b/g;
  const matches = [...textoOCR.matchAll(regex)]
    .map(m => ({ pais: m[1], numero: m[2] }))
    .filter(r => PAISES_VALIDOS.includes(r.pais));

  return matches.length > 0 ? matches[0] : null;
}
```

---

## 7. Interface do Botão LAB

### 7.1 Componentes da tela

| Componente | Descrição |
|---|---|
| **Viewfinder** | Preview da câmera via `getUserMedia`. Overlay com crosshair central indicando área de leitura. |
| **Botão Capturar** | Dispara OCR manual. Desabilitado durante processamento. Não há disparo automático por frame. |
| **Painel de Resultado** | Exibe: código detectado (`XXX 00`), fonte (Tesseract/Vision/Cache), confiança em %, badge Válida/Revisar. |
| **Rate Limit Indicator** | Mostra créditos Vision restantes no dia. Ex: `28/30 Vision calls disponíveis hoje`. |
| **Entrada Manual** | Campo de texto sempre visível. Usuário digita o código diretamente sem tirar foto. |
| **Log do Sistema** | Painel de debug: timestamp, camada usada, confiança, resultado bruto do OCR. Visível apenas em LAB. |
| **Botão Confirmar** | Aparece após detecção. Exige confirmação explícita antes de qualquer persistência. |

### 7.2 Estados da interface

```typescript
type ScannerState =
  | 'idle'          // aguardando captura
  | 'processing'    // OCR em andamento (qualquer camada)
  | 'confirming'    // resultado exibido, aguarda confirmação
  | 'rate_limited'  // sem créditos Vision — mostra manual
  | 'error';        // falha irrecuperável
```

---

## 8. Critérios de Sucesso da POC

| Critério | Meta | Status |
|---|---|---|
| Tesseract identifica corretamente | ≥ 60% das fotos em boa iluminação | `A MEDIR` |
| Vision API acionada só no fallback | < 40% das capturas totais | `A MEDIR` |
| Cache elimina chamadas repetidas | 100% de hit rate em figurinha já lida | `A MEDIR` |
| Rate limit funciona corretamente | Bloqueia após 30 calls/dia | `A MEDIR` |
| Acesso bloqueado para outros usuários | Zero acesso fora da whitelist | ⚠️ `CRÍTICO` |
| Confirmação antes de persistir | 100% dos fluxos exigem confirmação | ⚠️ `CRÍTICO` |

---

## 9. Riscos e Mitigações

| Risco | Impacto | Mitigação |
|---|---|---|
| Tesseract abaixo de 60% de precisão | 🔴 ALTO | Escala automaticamente para Vision. Log registra taxa de fallback para ajuste do threshold. |
| Usuário burla rate limit limpando localStorage | 🟡 MÉDIO | Aceitável em POC. Em produção: mover controle para Supabase (server-side). |
| Acesso não autorizado via URL direta | 🔴 ALTO | Middleware Next.js valida e-mail no servidor. Redireciona para `/admin` se não autorizado. |
| Custo Vision em testes intensivos | 🟢 BAIXO | Limit de 30 calls/dia. Com 1 usuário LAB, custo máximo: ~$0.045/dia. |
| `getUserMedia` negado no iOS Safari | 🟡 MÉDIO | Fallback para `input file` com `capture=environment`. Registrar no log como aviso. |

---

## 10. Checklist de Implementação

### Fase 1 — Guard de acesso
- [ ] Criar `utils/labAccess.ts` com `LAB_WHITELIST`
- [ ] Implementar middleware Next.js para rota `/admin/lab/*`
- [ ] Renderização condicional do botão LAB no painel admin
- [ ] Testar: outro e-mail logado não deve ver o botão nem acessar a rota

### Fase 2 — Serviço OCR em camadas
- [ ] Criar `services/ocrPipeline.ts` com a lógica de camadas
- [ ] Integrar Tesseract.js v5 (worker persistente entre capturas)
- [ ] Implementar pré-processamento (contraste + grayscale no canvas)
- [ ] Implementar cache IndexedDB com hash MD5 da imagem
- [ ] Implementar rate limit com localStorage + reset diário
- [ ] Integrar Google Cloud Vision como fallback (endpoint existente)

### Fase 3 — Interface LAB
- [ ] Criar página `/admin/lab/scanner/page.tsx`
- [ ] Componente viewfinder com `getUserMedia` + fallback file input
- [ ] Painel de resultado com fonte, confiança e badge de validação
- [ ] Rate limit indicator em tempo real
- [ ] Log de debug visível apenas nessa rota
- [ ] Botão de confirmação explícito antes de qualquer ação

### Fase 4 — Validação
- [ ] Testar com 20+ figurinhas reais em diferentes iluminações
- [ ] Registrar: taxa Tesseract OK / taxa fallback Vision / taxa manual
- [ ] Validar que rate limit bloqueia na 31ª chamada Vision do dia
- [ ] Confirmar que cache retorna sem chamada API em figurinha repetida

---

## 11. Critério de Go / No-Go para Rollout

Após validação do LAB, o rollout para usuários finais só ocorre se:

| Condição | Decisão |
|---|---|
| Tesseract ≥ 60% + Vision < 30% das calls | ✅ GO |
| Tesseract < 60% mas custo Vision < $0.01/usuário ativo | 🟡 GO CONDICIONAL |
| Custo Vision projetado > $0.05/usuário ativo/mês | ❌ NO-GO |
| Falha no controle de acesso LAB | 🚫 BLOQUEANTE |

---

*Figurinhas Copa 2026 — PRD POC Scanner OCR v1.0 | TB Implantação de Sistemas | Maio 2026*
