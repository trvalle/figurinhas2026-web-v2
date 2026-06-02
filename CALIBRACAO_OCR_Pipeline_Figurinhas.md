# 🎯 CALIBRAÇÃO DO PIPELINE OCR — Figurinhas Copa 2026
## Sessão de Refinamento: OpenCV.js + Tesseract.js (Alta Precisão)

> **Escopo:** Substituir os parâmetros atuais do pipeline OCR por uma calibração cirúrgica  
> **Arquivos afetados:** `src/services/opencvPipeline.ts` e `src/services/ocrService.ts`  
> **Objetivo:** Taxa de acerto ≥ 90% em condições normais de iluminação  
> **Pré-requisito:** Sessão Web-5 (RealtimeScanner) concluída e funcionando

---

## REGRAS OBRIGATÓRIAS

```
1. Leia CLAUDE.md antes de qualquer alteração
2. Confirme que está no diretório figurinhas2026-web/
3. Execute `npx tsc --noEmit` após CADA etapa — zero erros TypeScript
4. NÃO altere nenhum arquivo além dos listados neste documento
5. NÃO remova funções existentes — apenas substitua os blocos indicados
6. NÃO use `any` — tipagem estrita em todo o código
```

---

## CONTEXTO VISUAL DAS FIGURINHAS

As tags de código da Panini Copa 2026 têm características visuais fixas e previsíveis:

```
┌─────────────────────────────┐
│  Foto do jogador / arte     │
│                             │
│  ┌─────────────┐            │
│  │  BRA  5     │  ← TAG     │
│  └─────────────┘            │
│  Fundo escuro (preto/azul)  │
│  Texto branco               │
│  Proporção ~2:1 a 3.5:1     │
│  Largura: 80–200px          │
└─────────────────────────────┘
```

**Por que isso importa para o pipeline:**
- Fundo escuro + texto branco → `THRESH_BINARY_INV` inverte corretamente
- Proporção horizontal consistente → filtro de aspect ratio é confiável
- Tamanho previsível → filtro de área elimina 95% do ruído

---

## ETAPA 1 — Calibração do OpenCV Pipeline

**Arquivo:** `src/services/opencvPipeline.ts`  
**Ação:** Substituir os valores das constantes de configuração e a função `extractROIs`

### 1.1 — Substituir bloco de constantes

Localizar o bloco de constantes no topo do arquivo (após os imports) e **substituir completamente**:

```typescript
// ─── Constantes de calibração (CALIBRADAS para Panini Copa 2026) ────────────

/**
 * PASSO A — Redimensionamento
 * Fotos de celular chegam em resoluções gigantescas (4K+).
 * Trabalhar em 1280px de largura é suficiente para detectar as tags
 * e reduz drasticamente o tempo de processamento do OpenCV.
 */
const TARGET_WIDTH_PX = 1280;

/**
 * PASSO B — Limiarização (Thresholding)
 * Parâmetros do cv.adaptiveThreshold calibrados para retângulos
 * escuros com texto branco em condições variadas de iluminação.
 *
 * blockSize: 15 — área de análise local em pixels (deve ser ímpar)
 *   → Muito pequeno (<9): sensível a ruído de câmera
 *   → Muito grande (>21): perde detalhes em variações de luz
 * C: 2 — constante subtraída da média local
 *   → Valor baixo (2-4) funciona bem para texto branco em fundo escuro
 */
const ADAPTIVE_BLOCK_SIZE = 15;  // deve ser ímpar
const ADAPTIVE_C_CONSTANT  = 2;

/**
 * PASSO C — Proporção (Aspect Ratio) das tags de código
 * Tags da Panini têm formato retangular horizontal: largura ~2x a 3.5x a altura
 *
 * Exemplos reais medidos:
 *   "BRA 5"  → proporção ~2.1
 *   "MAR 12" → proporção ~2.8
 *   "SCO 8"  → proporção ~2.3
 *   "FRA 243"→ proporção ~3.2
 *
 * Margem de segurança: 1.8 a 4.0 (cobre inclinação leve da câmera)
 */
const ROI_MIN_ASPECT_RATIO = 1.8;
const ROI_MAX_ASPECT_RATIO = 4.0;

/**
 * PASSO C — Largura absoluta das tags (em pixels após redimensionamento)
 * Assumindo imagem reduzida para TARGET_WIDTH_PX = 1280px:
 *   → Tags válidas medem entre 80px e 200px de largura
 *   → Abaixo de 80px: ruído, texto de copyright, elementos gráficos
 *   → Acima de 200px: capturou elemento errado (borda, faixa, etc.)
 */
const ROI_MIN_WIDTH_PX = 80;
const ROI_MAX_WIDTH_PX = 200;

/**
 * Altura mínima das tags em pixels
 * Tags típicas têm 25–60px de altura após redimensionamento
 */
const ROI_MIN_HEIGHT_PX = 20;
const ROI_MAX_HEIGHT_PX = 70;

/**
 * Padding ao redor do recorte para não cortar bordas das letras
 */
const CROP_PADDING_PX = 6;

/**
 * Máximo de ROIs processadas por frame
 * Uma página de álbum tem no máximo 9 figurinhas visíveis
 */
const MAX_ROIS_PER_FRAME = 12;
```

---

### 1.2 — Substituir função `extractROIs`

Localizar a função `extractROIs` no arquivo e **substituir completamente**:

```typescript
/**
 * PIPELINE PRINCIPAL — Extrai ROIs (regiões de interesse) de um frame de câmera.
 *
 * Fluxo:
 *   1. Redimensionar para TARGET_WIDTH_PX (performance)
 *   2. Converter para escala de cinza
 *   3. Suavização Gaussiana (reduz ruído de câmera)
 *   4. Threshold adaptativo GAUSSIAN com BINARY_INV
 *      → Retângulos escuros viram branco; texto branco vira preto
 *      → Resulta em: fundo branco, texto preto (ideal para Tesseract)
 *   5. findContours: detectar formas geométricas
 *   6. Filtrar por: proporção + largura + altura
 *   7. Recortar cada candidato com padding
 *
 * @param sourceCanvas Canvas com o frame atual da câmera (resolução original)
 * @returns Array de CropResult com mini-canvases de cada tag detectada
 */
export function extractROIs(sourceCanvas: HTMLCanvasElement): CropResult[] {
  const cv = window.cv;
  if (!cv || typeof cv.Mat === 'undefined') return [];

  const results: CropResult[] = [];

  // Todas as Mats devem ser deletadas no finally — CRÍTICO para evitar
  // memory leak no heap Wasm do OpenCV (não coletado pelo GC do JS)
  let src:       import('opencv.js').Mat | null = null;
  let resized:   import('opencv.js').Mat | null = null;
  let gray:      import('opencv.js').Mat | null = null;
  let blurred:   import('opencv.js').Mat | null = null;
  let thresh:    import('opencv.js').Mat | null = null;
  let hierarchy: import('opencv.js').Mat | null = null;
  let contours:  import('opencv.js').MatVector | null = null;

  try {
    // ── PASSO A: Redimensionar para TARGET_WIDTH_PX ──────────────────────
    src = cv.imread(sourceCanvas);

    const origW = sourceCanvas.width;
    const origH = sourceCanvas.height;
    const scale = TARGET_WIDTH_PX / origW;
    const newW  = TARGET_WIDTH_PX;
    const newH  = Math.round(origH * scale);

    resized = new cv.Mat();
    const newSize = new cv.Size(newW, newH);
    cv.resize(src, resized, newSize, 0, 0, cv.INTER_LINEAR);

    // ── PASSO A: Converter para escala de cinza ───────────────────────────
    gray = new cv.Mat();
    cv.cvtColor(resized, gray, cv.COLOR_RGBA2GRAY);

    // ── PASSO A: Suavização Gaussiana (3x3) ──────────────────────────────
    // Remove ruído de compressão JPEG e granulação da câmera
    blurred = new cv.Mat();
    const ksize = new cv.Size(3, 3);
    cv.GaussianBlur(gray, blurred, ksize, 0);

    // ── PASSO B: Threshold Adaptativo Gaussiano ───────────────────────────
    // ADAPTIVE_THRESH_GAUSSIAN_C: peso gaussiano na vizinhança local
    //   → Mais robusto que MEAN_C para variações graduais de luz (sombras)
    // THRESH_BINARY_INV: inverte — fundo escuro vira branco, texto branco vira preto
    //   → Tesseract performa melhor com texto escuro em fundo claro
    thresh = new cv.Mat();
    cv.adaptiveThreshold(
      blurred,
      thresh,
      255,
      cv.ADAPTIVE_THRESH_GAUSSIAN_C,  // Gaussiano (mais robusto que MEAN)
      cv.THRESH_BINARY_INV,           // Inverte: escuro→branco, claro→preto
      ADAPTIVE_BLOCK_SIZE,            // 15px de área local
      ADAPTIVE_C_CONSTANT             // constante = 2
    );

    // ── PASSO C: Detectar contornos externos ─────────────────────────────
    contours  = new cv.MatVector();
    hierarchy = new cv.Mat();
    cv.findContours(
      thresh,
      contours,
      hierarchy,
      cv.RETR_EXTERNAL,       // Apenas contornos externos (ignora nested)
      cv.CHAIN_APPROX_SIMPLE  // Comprime pontos colineares (economiza memória)
    );

    // ── PASSO C: Filtrar contornos por proporção e tamanho ───────────────
    const candidates: ROI[] = [];

    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const rect    = cv.boundingRect(contour);
      contour.delete(); // Deletar contorno individual imediatamente

      const { x, y, width, height } = rect;

      // Ignorar contornos degenerados
      if (width <= 0 || height <= 0) continue;

      const aspectRatio = width / height;

      // FILTRO 1 — Proporção horizontal (tag ~2:1 a 3.5:1)
      if (aspectRatio < ROI_MIN_ASPECT_RATIO) continue;
      if (aspectRatio > ROI_MAX_ASPECT_RATIO) continue;

      // FILTRO 2 — Largura absoluta em pixels (após redimensionamento)
      if (width < ROI_MIN_WIDTH_PX)  continue;
      if (width > ROI_MAX_WIDTH_PX)  continue;

      // FILTRO 3 — Altura absoluta em pixels
      if (height < ROI_MIN_HEIGHT_PX) continue;
      if (height > ROI_MAX_HEIGHT_PX) continue;

      candidates.push({ x, y, width, height });
    }

    // Ordenar por área decrescente e limitar ao máximo configurado
    const top = candidates
      .sort((a, b) => (b.width * b.height) - (a.width * a.height))
      .slice(0, MAX_ROIS_PER_FRAME);

    // ── PASSO D: Recortar cada candidato ─────────────────────────────────
    // IMPORTANTE: recortar do canvas `resized` (escala 1280px) para
    // manter proporcionalidade com os filtros de tamanho acima.
    // O canvas recortado é depois escalado em preprocessForOCR().
    for (const roi of top) {
      const crop = cropROIFromCanvas(resized, roi, newW, newH);
      if (crop) results.push({ canvas: crop, roi });
    }

  } catch (error) {
    console.warn('[opencvPipeline] Erro no pipeline de segmentação:', error);
  } finally {
    // Liberar TODA memória Wasm — NÃO remover este bloco
    src?.delete();
    resized?.delete();
    gray?.delete();
    blurred?.delete();
    thresh?.delete();
    hierarchy?.delete();
    contours?.delete();
  }

  return results;
}
```

---

### 1.3 — Substituir função `cropROI` / `cropROIFromCanvas`

Localizar a função `cropROI` (ou `cropROIFromCanvas`) existente e **substituir**:

```typescript
/**
 * Recorta uma ROI de uma Mat OpenCV e retorna um HTMLCanvasElement.
 * Usa a Mat já processada (resized/thresh) em vez do canvas original
 * para garantir consistência com os filtros de tamanho calibrados.
 */
function cropROIFromCanvas(
  mat: import('opencv.js').Mat,
  roi: ROI,
  matWidth: number,
  matHeight: number
): HTMLCanvasElement | null {
  const cv = window.cv;
  if (!cv) return null;

  let cropped: import('opencv.js').Mat | null = null;

  try {
    // Aplicar padding com clamp nas bordas
    const x = Math.max(0, roi.x - CROP_PADDING_PX);
    const y = Math.max(0, roi.y - CROP_PADDING_PX);
    const w = Math.min(matWidth  - x, roi.width  + CROP_PADDING_PX * 2);
    const h = Math.min(matHeight - y, roi.height + CROP_PADDING_PX * 2);

    if (w <= 0 || h <= 0) return null;

    // Recortar submatriz (operação zero-copy no OpenCV)
    const rect = new cv.Rect(x, y, w, h);
    cropped = mat.roi(rect);

    // Converter para canvas HTML
    const canvas = document.createElement('canvas');
    canvas.width  = w;
    canvas.height = h;
    cv.imshow(canvas, cropped);

    return canvas;
  } catch {
    return null;
  } finally {
    cropped?.delete();
  }
}
```

---

### 1.4 — Substituir função `preprocessForOCR`

Localizar a função `preprocessForOCR` existente e **substituir**:

```typescript
/**
 * PASSO D (continuação) — Pré-processamento final antes do Tesseract
 *
 * O crop vem do threshold (preto e branco binário).
 * Aqui aplicamos:
 *   1. Escala 3x (Tesseract performa melhor com texto >= 30px de altura)
 *   2. Alto contraste (garante binarização perfeita)
 *   3. Sem filtro de cor (já está em grayscale do OpenCV)
 *
 * Resultado: texto preto nítido em fundo branco, tamanho legível pelo OCR
 */
export function preprocessForOCR(cropCanvas: HTMLCanvasElement): HTMLCanvasElement {
  // Escala 3x: texto de ~15px vira ~45px — zona de alta precisão do Tesseract
  const SCALE = 3;

  const out = document.createElement('canvas');
  out.width  = cropCanvas.width  * SCALE;
  out.height = cropCanvas.height * SCALE;

  const ctx = out.getContext('2d');
  if (!ctx) return cropCanvas;

  // Escalar com interpolação de imagem desabilitada (pixelated)
  // para não suavizar bordas do texto binário — mantém contraste máximo
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(cropCanvas, 0, 0, out.width, out.height);

  return out;
}
```

---

## ETAPA 2 — Calibração do Tesseract (ocrService.ts)

**Arquivo:** `src/services/ocrService.ts`  
**Ação:** Substituir apenas o bloco `REALTIME_OCR_CONFIG` e a função `validarCodigo`

### 2.1 — Substituir `REALTIME_OCR_CONFIG`

Localizar a constante `REALTIME_OCR_CONFIG` e **substituir completamente**:

```typescript
/**
 * Configuração Tesseract calibrada para tags de figurinhas Panini Copa 2026.
 *
 * PSM 7 (SINGLE_LINE): trata o crop como uma única linha de texto.
 *   → CRÍTICO: cada crop contém exatamente uma tag ("BRA 5")
 *   → PSM 6 (bloco) gera erros pois tenta organizar múltiplas linhas
 *
 * OEM 1 (LSTM only): usa apenas a rede neural LSTM, sem legado.
 *   → Mais preciso para fontes condensadas e bold
 *
 * tessedit_char_whitelist: o filtro mais importante de todos.
 *   → Tesseract nunca retornará caracteres fora desta lista
 *   → Elimina confusões: @ # $ % & * ( ) etc.
 *   → Espaço incluído: "BRA 5" tem espaço entre sigla e número
 *
 * load_system_dawg / load_freq_dawg: desabilitar dicionário.
 *   → "SCO", "MAR", "HAI" não são palavras do dicionário
 *   → Com dicionário ativo, Tesseract "corrige" para palavras reais
 *   → SEMPRE desabilitar para leitura de códigos
 */
const REALTIME_OCR_CONFIG = {
  tessedit_pageseg_mode:    '7',   // PSM 7: linha única — OBRIGATÓRIO para crops
  tessedit_ocr_engine_mode: '1',   // OEM 1: LSTM neural net apenas
  tessedit_char_whitelist:  'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ',
  load_system_dawg:         '0',   // Desabilita dicionário de palavras
  load_freq_dawg:           '0',   // Desabilita dicionário de frequência
} as const;
```

---

### 2.2 — Adicionar função `validarECorrigirCodigo`

Localizar a função `extrairCodigo` ou `extractAndValidateCodes` e adicionar **logo abaixo dela** a seguinte função:

```typescript
/**
 * FILTRO DE LINHA DE CHEGADA — Validação + Auto-correção do resultado OCR
 *
 * Mesmo com OpenCV + Tesseract calibrados, condições extremas podem gerar
 * leituras quase corretas. Esta função aplica 3 camadas de validação:
 *
 * Camada 1 — Normalização: remove espaços extras, força maiúsculo
 * Camada 2 — Regex estrita: padrão exato do álbum (3 letras + espaço + 1-3 dígitos)
 * Camada 3 — Auto-correção: substitui erros OCR comuns em posições conhecidas
 *
 * Erros OCR comuns mapeados:
 *   Na parte LETRA (posições 0-2): 0→O, 1→I, 5→S, 8→B
 *   Na parte NÚMERO (posição 4+): O→0, I→1, S→5, B→8
 *
 * Retorna o código normalizado ou null se inválido após correção.
 */
export function validarECorrigirCodigo(textoOcr: string): string | null {
  if (!textoOcr || textoOcr.trim().length === 0) return null;

  // ── Camada 1: Normalização ────────────────────────────────────────────
  const normalizado = textoOcr
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ')       // Múltiplos espaços → um espaço
    .replace(/[^A-Z0-9 ]/g, ''); // Remove tudo que não é letra, número ou espaço

  // ── Camada 2: Regex estrita ───────────────────────────────────────────
  // Padrão: exatamente 3 letras + 1 espaço + 1 a 3 dígitos
  const PADRAO = /^([A-Z]{3})\s(\d{1,3})$/;

  if (PADRAO.test(normalizado)) {
    return normalizado; // Perfeito — sem necessidade de correção
  }

  // ── Camada 3: Tentativa de auto-correção ─────────────────────────────
  // Tenta extrair partes mesmo que o formato não seja exato
  // Aceita padrões sem espaço ("BRA5") ou com ruído ("BRA  5")
  const PADRAO_FLEXIVEL = /([A-Z0-9]{3})\s*(\d{1,3})/;
  const match = normalizado.match(PADRAO_FLEXIVEL);

  if (!match) return null;

  let [, parteLetra, parteNumero] = match;

  // Corrigir erros OCR na parte LETRA (posições 0–2)
  // Números que parecem letras em fontes bold
  parteLetra = parteLetra
    .replace(/0/g, 'O')   // zero → O maiúsculo
    .replace(/1/g, 'I')   // um → I maiúsculo
    .replace(/5/g, 'S')   // cinco → S maiúsculo
    .replace(/8/g, 'B');  // oito → B maiúsculo

  // Corrigir erros OCR na parte NÚMERO (posição 4+)
  // Letras que parecem números em contexto numérico
  parteNumero = parteNumero
    .replace(/O/g, '0')   // O → zero
    .replace(/I/g, '1')   // I → um
    .replace(/S/g, '5')   // S → cinco
    .replace(/B/g, '8');  // B → oito

  const corrigido = `${parteLetra} ${parteNumero}`;

  // Validar resultado corrigido com regex estrita
  return PADRAO.test(corrigido) ? corrigido : null;
}
```

---

### 2.3 — Integrar `validarECorrigirCodigo` em `recognizeBatch`

Localizar dentro da função `recognizeBatch` o bloco que processa o resultado do Tesseract e **substituir o trecho de extração de matches**:

```typescript
// SUBSTITUIR este bloco dentro de recognizeBatch(),
// na parte que processa o texto retornado pelo Tesseract:

// ── Antes (remover): ──────────────────────────────────────────────────
// const matches = [...text.matchAll(STICKER_CODE_REGEX)];
// for (const match of matches) { ... }

// ── Depois (inserir): ─────────────────────────────────────────────────
const textoBruto = data.text ?? '';

// Primeiro tenta validação direta do texto completo
const codigoValidado = validarECorrigirCodigo(textoBruto);

if (codigoValidado) {
  const [country, number] = codigoValidado.split(' ');
  const code = `${country}${number}`;

  if (!seen.has(code)) {
    seen.add(code);
    results.push({
      code,
      rawCode:    codigoValidado,
      country:    country ?? '',
      number:     number  ?? '',
      confidence: data.confidence,
      isValid:    VALID_COUNTRY_CODES.has(country ?? ''),
    });
  }
} else {
  // Fallback: tenta extrair múltiplos códigos via regex
  // (cobre casos onde o crop capturou mais de uma tag)
  const matches = [...textoBruto.toUpperCase().matchAll(/\b([A-Z]{3})\s?(\d{1,3})\b/g)];

  for (const match of matches) {
    const candidato = `${match[1]} ${match[2]}`;
    const validado  = validarECorrigirCodigo(candidato);
    if (!validado) continue;

    const [country, number] = validado.split(' ');
    const code = `${country}${number}`;

    if (seen.has(code)) continue;
    seen.add(code);

    results.push({
      code,
      rawCode:    validado,
      country:    country ?? '',
      number:     number  ?? '',
      confidence: data.confidence,
      isValid:    VALID_COUNTRY_CODES.has(country ?? ''),
    });
  }
}
```

---

## ETAPA 3 — Fallback: Frame Completo sem OpenCV

**Arquivo:** `src/hooks/useRealtimeScanner.ts`  
**Ação:** Substituir apenas o bloco do fallback dentro de `processFrame`

Localizar o bloco comentado `// 5. Fallback` e **substituir**:

```typescript
// SUBSTITUIR o bloco de fallback dentro de processFrame():

// 5. Fallback: OpenCV não encontrou ROIs com as proporções esperadas.
//    Tenta OCR direto no frame completo redimensionado.
//    Menos preciso, mas garante que nenhuma figurinha seja perdida
//    por variação de ângulo ou contraste incomum.
if (crops.length === 0) {
  // Criar canvas redimensionado para 1280px (mesma escala do OpenCV)
  const fallbackCanvas = document.createElement('canvas');
  const scale = 1280 / sourceCanvas.width;
  fallbackCanvas.width  = 1280;
  fallbackCanvas.height = Math.round(sourceCanvas.height * scale);

  const fallbackCtx = fallbackCanvas.getContext('2d');
  if (fallbackCtx) {
    // Aplicar pré-processamento mesmo no fallback
    fallbackCtx.filter = 'grayscale(1) contrast(2) brightness(1.1)';
    fallbackCtx.drawImage(sourceCanvas, 0, 0, fallbackCanvas.width, fallbackCanvas.height);
    fallbackCtx.filter = 'none';

    ocrResults = await recognizeBatch([{
      canvas: fallbackCanvas,
      roi: { x: 0, y: 0, width: fallbackCanvas.width, height: fallbackCanvas.height },
    }]);
  }
}
```

> **⚠️ Atenção Claude Code:** A variável `sourceCanvas` referencia o canvas onde o frame foi desenhado  
> (o canvas oculto da câmera). Ajuste o nome conforme a variável usada no arquivo existente.

---

## ETAPA 4 — Validação e Testes

### 4.1 — Verificação TypeScript

```bash
npx tsc --noEmit
```

Esperado: zero erros.

### 4.2 — Build de produção

```bash
npm run build
```

Esperado: build sem warnings relacionados aos arquivos alterados.

### 4.3 — Checklist de comportamento esperado no navegador

Abrir DevTools → Network → verificar:

- [ ] Zero chamadas para `vision.googleapis.com` ou qualquer API externa
- [ ] OpenCV.js carregado uma única vez via CDN (não recarrega entre frames)
- [ ] Console sem erros `Mat is not defined` ou `Cannot read properties of undefined`
- [ ] Console sem warnings de memory leak (heap Wasm estável entre frames)

Abrir DevTools → Performance → verificar:

- [ ] Tempo de processamento por frame: < 1500ms em celular intermediário
- [ ] Sem aumento contínuo de memória após 10+ frames (Mat.delete() funcionando)

### 4.4 — Teste de precisão com figurinhas reais

Testar com pelo menos 15 figurinhas diferentes em 3 condições:

| Condição | Meta de acerto |
|---|---|
| Luz natural, ângulo reto | ≥ 90% |
| Luz artificial (indoor) | ≥ 75% |
| Ângulo inclinado (~20°) | ≥ 60% |

---

## REFERÊNCIA: Parâmetros e Por Que Cada Um Importa

```
ADAPTIVE_THRESH_GAUSSIAN_C  vs  ADAPTIVE_THRESH_MEAN_C
  → Gaussiano: peso maior para pixels mais próximos do centro
  → Melhor para iluminação com gradiente (sombra de um lado)
  → MEAN trata todos os pixels da vizinhança igualmente
  → Use GAUSSIAN para fotos de câmera, MEAN para documentos escaneados

blockSize = 15  (deve ser ímpar)
  → Define a área de análise local em pixels
  → < 9: sensível a ruído de sensor de câmera
  → > 21: não detecta variações locais de contraste
  → 15 é o equilíbrio para tags de ~20-60px de altura

C = 2
  → Constante subtraída da média ponderada local
  → Controla "quanto escuro precisa ser para virar preto"
  → 0: binarização agressiva (muito ruído)
  → 5: muito conservador (perde texto de baixo contraste)
  → 2-4: zona ideal para texto branco em fundo colorido escuro

PSM 7 (SINGLE_LINE)
  → Tesseract assume que a imagem é uma única linha horizontal
  → Drasticamente mais rápido e preciso para crops isolados
  → PSM 6 (UNIFORM_BLOCK) tenta organizar múltiplas linhas → erros em crops

Whitelist 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 '
  → O filtro mais impactante na precisão
  → Sem whitelist: Tesseract pode retornar qualquer caractere Unicode
  → Com whitelist: limitado ao universo de caracteres dos códigos

load_system_dawg = '0'
  → Desabilita o dicionário de palavras em inglês
  → Sem isso: "SCO" vira "SCO." ou é corrigido para "SCOT"
  → "MAR" pode ser corrigido para "MAR." ou "MARS"
  → SEMPRE desabilitar para leitura de códigos alfanuméricos

Scale 3x no preprocessForOCR
  → Tesseract tem zona de precisão máxima entre 30-60px de altura de caractere
  → Tags com 15-20px de altura → escalar 3x → 45-60px → zona ideal
  → imageSmoothingEnabled = false: evita antialiasing que borra bordas do texto binário
```

---

## O QUE NÃO ALTERAR

```
❌ NÃO alterar VALID_COUNTRY_CODES — lista já calibrada para Copa 2026
❌ NÃO alterar initOCR() — inicialização do worker singleton
❌ NÃO alterar opencvLoader.ts — carregamento já funciona
❌ NÃO alterar RealtimeScanner.tsx — componente não muda nesta sessão
❌ NÃO alterar useRealtimeScanner.ts exceto o bloco do fallback (Etapa 3)
❌ NÃO remover o bloco finally com Mat.delete() — causa memory leak
❌ NÃO usar imageSmoothingEnabled = true no preprocessForOCR
```

---

*Figurinhas Copa 2026 — Calibração OCR Pipeline v1.0 | OpenCV.js + Tesseract.js | Maio 2026*
