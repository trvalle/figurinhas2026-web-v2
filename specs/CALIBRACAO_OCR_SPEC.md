# SPEC: Calibração Cirúrgica do Pipeline OCR — ≥90% Taxa de Acerto

**Spec ID**: SPEC-20260601-ocr-calibration  
**Date**: 2026-06-01  
**Target Environment**: dev  
**Change Domain**: frontend (+ backend services)  
**Author**: TB System  

---

## 1. Objetivo

Implementar a calibração exata descrita em `CALIBRACAO_OCR_Pipeline_Figurinhas.md` para elevar a taxa de acerto de detecção de códigos de figurinhas (padrão XXX NN) para **≥90% em condições normais de iluminação**, substituindo/refinando a implementação anterior que usava parâmetros genéricos do OpenCV.js e Tesseract.

**Impacto esperado:**
- Taxa de acerto ≥90% em luz natural com ângulo reto
- Taxa de acerto ≥75% em luz artificial (indoor)
- Taxa de acerto ≥60% em ângulo inclinado (~20°)

---

## 2. Contexto

O módulo de **Tempo Real** (RealtimeScanner) já existe funcionalmente, mas usa parâmetros OpenCV e Tesseract genéricos. O arquivo `CALIBRACAO_OCR_Pipeline_Figurinhas.md` fornece calibração cirúrgica baseada em características visuais específicas das tags Panini Copa 2026:

- Retângulos com fundo escuro (preto/azul) + texto branco
- Proporção horizontal ~2:1 a 3.5:1
- Largura absoluta após redimensionamento: 80–200px
- Altura absoluta: 25–60px

A calibração refina:
1. **Constantes OpenCV** (aspect ratio, tamanho mínimo/máximo)
2. **Parâmetros Tesseract** (PSM 7, OEM 1, whitelist de caracteres)
3. **Função de validação com auto-correção** (3 camadas: normalização → regex → correção de erros OCR comuns)
4. **Fallback para frame completo** quando OpenCV não detecta ROIs

---

## 3. Scope

### In scope
- Etapa 1: Substituir constantes de calibração em `src/services/opencvPipeline.ts` (valores exatos do documento)
- Etapa 1: Substituir função `extractROIs()` com pipeline correto (resize → gray → blur → threshold → contours → filter)
- Etapa 1: Substituir função `cropROI()` / `cropROIFromCanvas()` com padding correto
- Etapa 1: Substituir função `preprocessForOCR()` com escala 3x e contraste exato
- Etapa 2: Substituir `REALTIME_OCR_CONFIG` em `src/services/ocrService.ts` (PSM 7, OEM 1, whitelist, sem dicionário)
- Etapa 2: Adicionar função `validarECorrigirCodigo()` com 3 camadas de validação
- Etapa 2: Integrar `validarECorrigirCodigo()` em `recognizeBatch()` 
- Etapa 3: Substituir bloco de fallback em `src/hooks/useRealtimeScanner.ts` para OCR em frame completo
- Etapa 4: Validação TypeScript (`npx tsc --noEmit`) e build (`npm run build`)

### Out of scope
- Não alterar `VALID_COUNTRY_CODES` — já calibrada
- Não alterar `initOCR()`, `recognizeText()`, `extractAndValidateCodes()`, `loadCatalogCache()`
- Não criar segundo worker Tesseract
- Não alterar `RealtimeScanner.tsx`, `opencvLoader.ts` (já funcionam)
- Não alterar database, migrations, ou qualquer coisa Supabase
- Não alterar design/UI do componente (estrutura já OK, apenas lógica)

---

## 4. Requirements (Verifiable Statements)

- [ ] Constante `TARGET_WIDTH_PX = 1280` ✓ redimensionamento correto
- [ ] Constante `ADAPTIVE_BLOCK_SIZE = 15` (ímpar obrigatório) ✓ área de análise local
- [ ] Constante `ADAPTIVE_C_CONSTANT = 2` ✓ threshold adaptativo
- [ ] Constante `ROI_MIN_ASPECT_RATIO = 1.8` ✓ filtra quadrados
- [ ] Constante `ROI_MAX_ASPECT_RATIO = 4.0` ✓ filtra muito retangulares
- [ ] Constante `ROI_MIN_WIDTH_PX = 80` ✓ elimina ruído
- [ ] Constante `ROI_MAX_WIDTH_PX = 200` ✓ elimina capturas erradas
- [ ] Constante `ROI_MIN_HEIGHT_PX = 20`, `ROI_MAX_HEIGHT_PX = 70` ✓ altura válida
- [ ] Função `extractROIs()` redimensiona para 1280px ✓ antes de processar
- [ ] Função `extractROIs()` converte para grayscale ✓ cv.cvtColor
- [ ] Função `extractROIs()` aplica GaussianBlur 3x3 ✓ reduz ruído
- [ ] Função `extractROIs()` usa `adaptiveThreshold` com `GAUSSIAN_C` e `THRESH_BINARY_INV` ✓ inverte corretamente
- [ ] Função `extractROIs()` encontra contornos externos apenas ✓ `RETR_EXTERNAL`
- [ ] Função `extractROIs()` filtra por aspect ratio, width, height ✓ em ordem
- [ ] Função `extractROIs()` ordena por área decrescente ✓ TOP 12 máximo
- [ ] Função `extractROIs()` limpa **todas as Mats** no finally ✓ previne memory leak
- [ ] Função `preprocessForOCR()` escala 3x ✓ texto ≥30px altura
- [ ] Função `preprocessForOCR()` desabilita `imageSmoothingEnabled` ✓ pixelated mantém contraste
- [ ] `REALTIME_OCR_CONFIG.tessedit_pageseg_mode = '7'` ✓ PSM 7: linha única
- [ ] `REALTIME_OCR_CONFIG.tessedit_ocr_engine_mode = '1'` ✓ OEM 1: LSTM
- [ ] `REALTIME_OCR_CONFIG.tessedit_char_whitelist = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 '` ✓ apenas válidos
- [ ] `REALTIME_OCR_CONFIG.load_system_dawg = '0'` ✓ sem dicionário
- [ ] `REALTIME_OCR_CONFIG.load_freq_dawg = '0'` ✓ sem correção automática
- [ ] Função `validarECorrigirCodigo()` existe ✓ 3 camadas (normalização → regex → correção)
- [ ] Camada 1: normaliza espaços, maiúsculas, remove caracteres inválidos ✓
- [ ] Camada 2: regex estrita `/^([A-Z]{3})\s(\d{1,3})$/` ✓ padrão exato
- [ ] Camada 3: auto-correção de erros comuns (0→O, 1→I, 5→S, 8→B) ✓ em cada seção
- [ ] Função `validarECorrigirCodigo()` integrada em `recognizeBatch()` ✓ processa resultado
- [ ] Fallback OCR executa quando `crops.length === 0` ✓ tenta frame completo
- [ ] Fallback redimensiona para 1280px ✓ consistência
- [ ] TypeScript compila sem erros ✓ `npx tsc --noEmit`
- [ ] Build produção sucede ✓ `npm run build`
- [ ] Nenhuma alteração fora dos arquivos listados ✓ escopo respeitado

---

## 5. Acceptance Criteria

- [ ] Arquivo `src/services/opencvPipeline.ts` contém **exatamente** as 9 constantes de calibração do doc
- [ ] Arquivo `src/services/opencvPipeline.ts` função `extractROIs()` segue pipeline exato (resize → gray → blur → threshold → contours → filter → crop)
- [ ] Arquivo `src/services/opencvPipeline.ts` função `preprocessForOCR()` escala 3x com `imageSmoothingEnabled = false`
- [ ] Arquivo `src/services/ocrService.ts` contém `REALTIME_OCR_CONFIG` com 6 propriedades exatas
- [ ] Arquivo `src/services/ocrService.ts` função `validarECorrigirCodigo()` implementa 3 camadas exatas
- [ ] Arquivo `src/services/ocrService.ts` função `recognizeBatch()` chama `validarECorrigirCodigo()` como primeira tentativa
- [ ] Arquivo `src/hooks/useRealtimeScanner.ts` bloco de fallback (seção 5) implementado exatamente
- [ ] `npx tsc --noEmit` retorna **zero erros**
- [ ] `npm run build` sucede sem warnings relacionados aos arquivos alterados
- [ ] Teste manual: ao apontar câmera para figurinha com código visível, overlay mostra detecção (verde "Nova", azul "Tenho", amarelo "Repetida", cinza "Colada")
- [ ] Teste manual: nenhuma chamada para `vision.googleapis.com` é feita
- [ ] Teste manual: console sem erros `Mat is not defined` ou memory leak warnings

---

## 6. Test Strategy

### Unit tests
- `validarECorrigirCodigo("BRA 5")` → `"BRA 5"` ✓
- `validarECorrigirCodigo("BRA5")` → `"BRA 5"` ✓ sem espaço → inserir
- `validarECorrigirCodigo("BRAS")` → `null` ✓ sem número
- `validarECorrigirCodigo("0RA 5")` → `"BRA 5"` ✓ correção 0→O
- `validarECorrigirCodigo("BRA 0")` → `"BRA 0"` ✓ número válido

### Integration tests
- `npm run build` sucede
- `npx tsc --noEmit` retorna zero erros
- RealtimeScanner carrega sem erros no navegador (DevTools console limpo)

### Smoke tests (manual)
- Apontar para 3+ figurinhas reais em boa iluminação
- Registrar: taxa de acerto vs. ângulo e iluminação
- Esperado: ≥90% em condição ideal, ≥75% em indoor, ≥60% em inclinado

---

## 7. Architecture Constraints

- Não quebrar module boundaries — alterações confinadas a `opencvPipeline.ts`, `ocrService.ts`, `useRealtimeScanner.ts`
- Manter tipos TypeScript estritamente tipados — zero uso de `any`
- Não remover exports ou funções existentes — apenas substituir blocos internos
- OpenCV: sempre deletar Mats no finally (memory leak crítico)
- Tesseract: reutilizar worker singleton — não criar segundo worker
- Fallback deve usar **exatamente** as mesmas constantes e pré-processamento que OpenCV (1280px, preprocessForOCR 3x)

---

## 8. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Compilação TypeScript falha após alterações | Medium | High | Validação strict de tipos, rodar `tsc --noEmit` após cada etapa |
| Memory leak no heap Wasm (Mat não deletada) | Low | Critical | Nunca remover bloco `finally` com `mat.delete()` |
| OCR com confiança baixa mesmo após calibração | Medium | Medium | Fallback para frame completo + auto-correção mitiga. Se <60% em ideal, aumentar contraste em preprocessForOCR |
| Regressão em casos edge (ângulo, luz baixa) | Low | Low | Auto-correção de erros OCR comuns cobre maioria. Log de debug registra taxa de fallback. |

---

## 9. Reference

- **Primary source**: CALIBRACAO_OCR_Pipeline_Figurinhas.md (este projeto)
- **Secondary source**: SESSAO_WEB5_RealtimeScanner_OpenCV_Tesseract.md (contexto)
- **Architecture doc**: docs/stack.md (estrutura)

---

## 10. Metadata

- **Estimated effort**: 2-3 hours (4 etapas, validação inline)
- **Blast radius**: Frontend (scanner realtime) apenas
- **Reversibility**: Alta (Git commit isolado, fácil reverter)
- **Dependencies**: OpenCV.js (CDN), Tesseract.js v5 (npm)
