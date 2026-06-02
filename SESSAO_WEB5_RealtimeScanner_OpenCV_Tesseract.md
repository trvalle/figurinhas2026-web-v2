# ⚡ SESSÃO WEB-5 (REVISADA) — RealtimeScanner com OpenCV.js + Tesseract.js

> **Escopo:** Substituir completamente a lógica de OCR do módulo "Tempo Real" (`RealtimeScanner`)  
> **Remove:** Google Cloud Vision API (todas as chamadas e dependências)  
> **Adiciona:** Pipeline local OpenCV.js (segmentação) + Tesseract.js (OCR focado)  
> **Custo:** $0 — 100% client-side, sem chamadas externas  
> **Projeto:** `figurinhas2026-web/`  
> **Pré-requisito:** Sessões Web-1 a Web-4 concluídas

---

## REGRAS OBRIGATÓRIAS ANTES DE COMEÇAR

```
1. Leia CLAUDE.md e docs/stack-web.md (seções OCR e CÂMERA) integralmente
2. Confirme que está no diretório figurinhas2026-web/
3. NÃO altere nenhum arquivo fora dos listados neste documento
4. NÃO remova imports ou funções existentes sem instrução explícita
5. Mantenha todos os tipos TypeScript — zero uso de `any`
6. Cada etapa deve compilar sem erros antes de avançar para a próxima
7. Execute `npm run build` ao final de todas as etapas
```

---

## VISÃO GERAL DA ARQUITETURA

```
┌─────────────────────────────────────────────────────────────┐
│                    RealtimeScanner.tsx                       │
│                                                              │
│  <video> (câmera ao vivo)                                    │
│     │                                                        │
│     ▼  a cada 1200ms (intervalo configurável)                │
│  capturaFrame() → <canvas> oculto                            │
│     │                                                        │
│     ▼                                                        │
│  ┌─────────────────────────────────────┐                     │
│  │    opencvPipeline.ts                │                     │
│  │                                     │                     │
│  │  1. toGrayscale()                   │                     │
│  │  2. applyThreshold()  ← binariza    │                     │
│  │  3. findContours()    ← detecta     │                     │
│  │     retângulos dos códigos          │                     │
│  │  4. filterAndSortROIs() ← filtra    │                     │
│  │     por tamanho/proporção           │                     │
│  │  5. cropROIs() → ImageData[]        │                     │
│  └──────────────┬──────────────────────┘                     │
│                 │ array de recortes (mini-canvases)           │
│                 ▼                                            │
│  ┌─────────────────────────────────────┐                     │
│  │    ocrService.ts (revisado)         │                     │
│  │                                     │                     │
│  │  recognizeBatch(crops[])            │                     │
│  │  → Tesseract worker (persistente)   │                     │
│  │  → whitelist: A-Z0-9 + espaço       │                     │
│  │  → PSM 7 (linha única por crop)     │                     │
│  │  → extrai padrão /[A-Z]{3}\d{1,3}/  │                     │
│  └──────────────┬──────────────────────┘                     │
│                 │ StickerCode[]                               │
│                 ▼                                            │
│  validaCatalogo() → DetectedSticker[]                        │
│                 │                                            │
│                 ▼                                            │
│  StickerOverlay (overlay colorido sobre o vídeo)             │
│  + painel lateral com lista detectada                        │
│  + botão "Confirmar X figurinhas"                            │
└─────────────────────────────────────────────────────────────┘
```

---

## DEPENDÊNCIAS

### Instalar (execute antes de começar)

```bash
# Na raiz de figurinhas2026-web/
npm install tesseract.js@5
npm install opencv.js  # OU usar CDN — ver Etapa 1
```

> **Atenção sobre OpenCV.js:** O pacote npm `opencv.js` tem builds desatualizados.  
> **Usar CDN é mais confiável.** A Etapa 1 cobre o carregamento via script dinâmico.

### Verificar se já instalado

```bash
cat package.json | grep -E "tesseract|opencv"
```

---

## ETAPA 1 — Loader do OpenCV.js

**Arquivo:** `src/services/opencvLoader.ts`  
**Ação:** CRIAR (arquivo novo)

```typescript
// src/services/opencvLoader.ts
// Carrega OpenCV.js via CDN de forma lazy (apenas quando RealtimeScanner é montado)
// OpenCV.js expõe o objeto global `cv` após carregamento assíncrono

declare global {
  interface Window {
    cv: typeof import('opencv.js') | undefined;
    Module: {
      onRuntimeInitialized?: () => void;
    };
  }
}

const OPENCV_CDN_URL =
  'https://docs.opencv.org/4.8.0/opencv.js';

let loadPromise: Promise<void> | null = null;

export function loadOpenCV(): Promise<void> {
  // Retorna promise existente se já está carregando ou carregado
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<void>((resolve, reject) => {
    // Já carregado anteriormente
    if (window.cv && typeof window.cv.Mat !== 'undefined') {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = OPENCV_CDN_URL;
    script.async = true;

    // OpenCV.js chama Module.onRuntimeInitialized quando pronto
    window.Module = {
      onRuntimeInitialized: () => {
        if (window.cv) {
          resolve();
        } else {
          reject(new Error('OpenCV.js carregou mas window.cv não foi definido'));
        }
      },
    };

    script.onerror = () => {
      loadPromise = null; // Permite nova tentativa
      reject(new Error('Falha ao carregar OpenCV.js do CDN'));
    };

    document.head.appendChild(script);
  });

  return loadPromise;
}

export function isOpenCVReady(): boolean {
  return !!(window.cv && typeof window.cv.Mat !== 'undefined');
}
```

---

## ETAPA 2 — Pipeline OpenCV (Segmentação por Contornos)

**Arquivo:** `src/services/opencvPipeline.ts`  
**Ação:** CRIAR (arquivo novo)

> **Contexto visual das figurinhas Panini Copa 2026:**  
> Os códigos (`BRA 5`, `MAR 12`) aparecem dentro de **retângulos arredondados com fundo escuro e texto branco**, localizados na parte inferior ou lateral da figurinha. O pipeline abaixo detecta exatamente esses retângulos.

```typescript
// src/services/opencvPipeline.ts
// Pipeline de visão computacional para segmentação dos códigos das figurinhas
// Dependência: OpenCV.js (carregado via opencvLoader.ts)

export interface ROI {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CropResult {
  canvas: HTMLCanvasElement;
  roi: ROI;
}

// ─── Constantes de configuração ────────────────────────────────────────────

// Proporção esperada dos retângulos de código (largura / altura)
// Códigos como "BRA 12" têm proporção aproximada de 2:1 a 5:1
const ROI_MIN_ASPECT_RATIO = 1.5;
const ROI_MAX_ASPECT_RATIO = 6.0;

// Área mínima e máxima do contorno em pixels (relativo à resolução do canvas)
// Muito pequeno → ruído; muito grande → capturou elemento errado
const ROI_MIN_AREA_RATIO = 0.001;  // 0.1% da área total do frame
const ROI_MAX_AREA_RATIO = 0.08;   // 8% da área total do frame

// Padding ao redor do recorte para não cortar letras nas bordas
const CROP_PADDING_PX = 4;

// Número máximo de ROIs a processar por frame (evita sobrecarga)
const MAX_ROIS_PER_FRAME = 8;

// ─── Função principal ───────────────────────────────────────────────────────

/**
 * Recebe um canvas com o frame atual da câmera e retorna
 * um array de mini-canvases, cada um contendo um recorte
 * de uma área candidata a ser um código de figurinha.
 *
 * Retorna array vazio se OpenCV não estiver pronto ou não
 * encontrar candidatos válidos.
 */
export function extractROIs(sourceCanvas: HTMLCanvasElement): CropResult[] {
  const cv = window.cv;
  if (!cv || typeof cv.Mat === 'undefined') return [];

  const results: CropResult[] = [];

  // Matrizes OpenCV — DEVEM ser deletadas no finally para evitar memory leak
  let src: import('opencv.js').Mat | null = null;
  let gray: import('opencv.js').Mat | null = null;
  let blurred: import('opencv.js').Mat | null = null;
  let thresh: import('opencv.js').Mat | null = null;
  let hierarchy: import('opencv.js').Mat | null = null;
  let contours: import('opencv.js').MatVector | null = null;

  try {
    const { width, height } = sourceCanvas;
    const totalArea = width * height;

    // 1. Ler pixels do canvas para Mat OpenCV
    src = cv.imread(sourceCanvas);

    // 2. Converter para escala de cinza
    gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    // 3. Suavização leve para reduzir ruído de câmera
    blurred = new cv.Mat();
    const ksize = new cv.Size(3, 3);
    cv.GaussianBlur(gray, blurred, ksize, 0);

    // 4. Limiarização adaptativa (Adaptive Threshold)
    // Usa ADAPTIVE_THRESH_MEAN_C para lidar com variações de iluminação
    // Binariza: fundo escuro → preto, texto branco → branco
    thresh = new cv.Mat();
    cv.adaptiveThreshold(
      blurred,
      thresh,
      255,
      cv.ADAPTIVE_THRESH_MEAN_C,
      cv.THRESH_BINARY_INV, // INV: retângulos escuros ficam brancos
      15,                    // blockSize: área de análise local (px)
      8                      // C: constante subtraída da média
    );

    // 5. Detectar contornos externos
    contours = new cv.MatVector();
    hierarchy = new cv.Mat();
    cv.findContours(
      thresh,
      contours,
      hierarchy,
      cv.RETR_EXTERNAL,      // Apenas contornos externos (sem nested)
      cv.CHAIN_APPROX_SIMPLE // Comprime pontos redundantes
    );

    // 6. Filtrar e ordenar contornos por critérios de proporção e área
    const candidates: ROI[] = [];

    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const rect = cv.boundingRect(contour);
      contour.delete();

      const area = rect.width * rect.height;
      const aspectRatio = rect.width / rect.height;
      const areaRatio = area / totalArea;

      // Filtra por proporção (retângulo horizontal, não quadrado)
      if (aspectRatio < ROI_MIN_ASPECT_RATIO) continue;
      if (aspectRatio > ROI_MAX_ASPECT_RATIO) continue;

      // Filtra por tamanho relativo ao frame
      if (areaRatio < ROI_MIN_AREA_RATIO) continue;
      if (areaRatio > ROI_MAX_AREA_RATIO) continue;

      candidates.push({
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      });
    }

    // 7. Ordenar por área decrescente e limitar ao máximo configurado
    candidates
      .sort((a, b) => b.width * b.height - a.width * a.height)
      .slice(0, MAX_ROIS_PER_FRAME);

    // 8. Recortar cada candidato no canvas original
    for (const roi of candidates) {
      const crop = cropROI(sourceCanvas, roi);
      if (crop) {
        results.push({ canvas: crop, roi });
      }
    }
  } catch (error) {
    // Falha silenciosa: o scanner continua operando sem segmentação
    console.warn('[opencvPipeline] Erro na segmentação:', error);
  } finally {
    // Liberar memória — CRÍTICO para evitar memory leak no Wasm heap
    src?.delete();
    gray?.delete();
    blurred?.delete();
    thresh?.delete();
    hierarchy?.delete();
    contours?.delete();
  }

  return results;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Recorta uma ROI do canvas fonte e retorna um novo canvas menor.
 * Aplica padding para não cortar bordas do texto.
 */
function cropROI(
  source: HTMLCanvasElement,
  roi: ROI
): HTMLCanvasElement | null {
  try {
    const { width: srcW, height: srcH } = source;

    // Aplicar padding com clamp nas bordas
    const x = Math.max(0, roi.x - CROP_PADDING_PX);
    const y = Math.max(0, roi.y - CROP_PADDING_PX);
    const w = Math.min(srcW - x, roi.width + CROP_PADDING_PX * 2);
    const h = Math.min(srcH - y, roi.height + CROP_PADDING_PX * 2);

    if (w <= 0 || h <= 0) return null;

    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = w;
    cropCanvas.height = h;

    const ctx = cropCanvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(source, x, y, w, h, 0, 0, w, h);
    return cropCanvas;
  } catch {
    return null;
  }
}

/**
 * Pré-processa um canvas para melhorar legibilidade do OCR:
 * - Escala 2x (Tesseract performa melhor com texto maior)
 * - Alto contraste
 * - Grayscale
 *
 * Usar este output como input para o Tesseract, não o crop bruto.
 */
export function preprocessForOCR(cropCanvas: HTMLCanvasElement): HTMLCanvasElement {
  const SCALE = 2;
  const out = document.createElement('canvas');
  out.width = cropCanvas.width * SCALE;
  out.height = cropCanvas.height * SCALE;

  const ctx = out.getContext('2d');
  if (!ctx) return cropCanvas;

  // Escala e aplica filtros CSS via drawImage
  ctx.filter = 'grayscale(1) contrast(1.8) brightness(1.1)';
  ctx.drawImage(cropCanvas, 0, 0, out.width, out.height);
  ctx.filter = 'none';

  return out;
}
```

---

## ETAPA 3 — Revisão do Serviço OCR (ocrService.ts)

**Arquivo:** `src/services/ocrService.ts`  
**Ação:** ALTERAR o arquivo existente

> **Atenção:** NÃO remover funções existentes (`initOCR`, `recognizeText`, `extractAndValidateCodes`, `loadCatalogCache`).  
> APENAS adicionar as novas exportações abaixo ao final do arquivo existente.

### Adicionar ao final de `src/services/ocrService.ts`:

```typescript
// ─── ADIÇÃO: OCR focado por batch de crops (RealtimeScanner) ────────────────
// Adicionar ao final do arquivo existente src/services/ocrService.ts

import type { CropResult } from './opencvPipeline';

/**
 * Configuração Tesseract otimizada para códigos de figurinhas.
 *
 * PSM 7 = trata a imagem como uma única linha de texto (ideal para crops)
 * PSM 6 = bloco uniforme de texto (fallback se PSM 7 falhar)
 * OEM 1 = LSTM neural net (mais preciso que OEM 0 legado)
 *
 * allowlist: apenas caracteres que existem nos códigos
 * Elimina confusões comuns: O↔0, I↔1, S↔5, B↔8
 */
const REALTIME_OCR_CONFIG = {
  tessedit_pageseg_mode: '7',       // PSM 7: linha única
  tessedit_ocr_engine_mode: '1',    // OEM 1: LSTM
  tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ',
  // Desabilitar dicionário — códigos não são palavras do dicionário
  load_system_dawg: '0',
  load_freq_dawg: '0',
};

// Regex do padrão de código: 3 letras maiúsculas + espaço opcional + 1-3 dígitos
const STICKER_CODE_REGEX = /\b([A-Z]{3})\s?(\d{1,3})\b/g;

/**
 * Lista completa de siglas de países válidos na Copa 2026.
 * Usada para validar o resultado do OCR antes de aceitar.
 */
const VALID_COUNTRY_CODES = new Set([
  'AFG','ALB','ALG','AND','ANG','ARG','ARM','AUS','AUT','AZE',
  'BAH','BAN','BEL','BEN','BHU','BIH','BOL','BOT','BRA','BUL',
  'BUR','CAM','CAN','CAP','CHI','CHN','CIV','CMR','COD','COG',
  'COL','COM','CRC','CRO','CUB','CZE','DEN','DJI','DOM','ECU',
  'EGY','ENG','ERI','ESP','EST','ETH','FIJ','FIN','FRA','GAB',
  'GAM','GER','GHA','GNB','GRE','GTM','GUI','GUY','HAI','HON',
  'HUN','IDN','IND','IRL','IRN','IRQ','ISL','ISR','ITA','JAM',
  'JOR','JPN','KAZ','KEN','KGZ','KOR','KSA','KUW','LAO','LBA',
  'LBN','LBR','LES','LIB','LIE','LTU','LUX','MAD','MAL','MAR',
  'MAS','MDA','MEX','MKD','MLI','MLT','MNE','MON','MOZ','MRI',
  'MTN','MWI','MYA','NAM','NCA','NED','NEP','NGA','NIG','NIR',
  'NOR','NZL','OMA','PAK','PAN','PAR','PER','PHI','POL','POR',
  'PRK','PUR','QAT','ROU','RSA','RUS','RWA','SCO','SEN','SIN',
  'SKN','SLE','SLV','SMR','SOM','SRB','SRI','SSD','SUD','SUI',
  'SUR','SVK','SVN','SWE','SYR','TAH','TAN','TGA','THA','TJK',
  'TKM','TOG','TRI','TUN','TUR','UAE','UGA','UKR','URU','USA',
  'UZB','VEN','VIE','WAL','YEM','ZAM','ZIM',
]);

export interface RealtimeOCRResult {
  code: string;        // Ex: "BRA5" (normalizado, sem espaço)
  rawCode: string;     // Ex: "BRA 5" (como veio do OCR)
  country: string;     // Ex: "BRA"
  number: string;      // Ex: "5"
  confidence: number;  // 0-100, confiança do Tesseract
  isValid: boolean;    // true se país está em VALID_COUNTRY_CODES
}

/**
 * Processa um array de crops em batch usando o worker Tesseract existente.
 * Retorna apenas resultados com padrão válido detectado.
 *
 * Usa o worker já inicializado por initOCR() — não cria novo worker.
 */
export async function recognizeBatch(
  crops: CropResult[]
): Promise<RealtimeOCRResult[]> {
  if (crops.length === 0) return [];

  // Importar o worker Tesseract já inicializado pelo ocrService existente
  // O worker é um singleton — reutilizar sem reinicializar
  const worker = getOCRWorker(); // função existente no arquivo
  if (!worker) {
    console.warn('[ocrService] Worker Tesseract não inicializado. Chame initOCR() primeiro.');
    return [];
  }

  const results: RealtimeOCRResult[] = [];
  const seen = new Set<string>(); // deduplicação de códigos no mesmo frame

  for (const { canvas } of crops) {
    try {
      // Aplicar configurações específicas para linha única
      await worker.setParameters(REALTIME_OCR_CONFIG);

      const { data } = await worker.recognize(canvas);
      const text = data.text.toUpperCase().trim();
      const confidence = data.confidence;

      // Extrair todos os padrões do texto retornado
      const matches = [...text.matchAll(STICKER_CODE_REGEX)];

      for (const match of matches) {
        const country = match[1];
        const number = match[2];
        const rawCode = `${country} ${number}`;
        const code = `${country}${number}`;

        // Deduplicar: mesmo código não aparece duas vezes no mesmo frame
        if (seen.has(code)) continue;
        seen.add(code);

        results.push({
          code,
          rawCode,
          country,
          number,
          confidence,
          isValid: VALID_COUNTRY_CODES.has(country),
        });
      }
    } catch (error) {
      // Falha em um crop não deve interromper os demais
      console.warn('[ocrService] Erro ao processar crop:', error);
    }
  }

  return results;
}

/**
 * Retorna o worker Tesseract singleton.
 * IMPORTANTE: esta função DEVE acessar a variável `worker` já declarada
 * no restante do arquivo ocrService.ts.
 *
 * Se a variável tiver outro nome no arquivo existente, ajuste aqui.
 */
function getOCRWorker() {
  // Ajustar conforme o nome da variável no arquivo existente
  // Exemplo: se o arquivo usa `let ocrWorker = null`, retornar ocrWorker
  // @ts-ignore — acessa variável do módulo
  return typeof worker !== 'undefined' ? worker : null;
}
```

> **⚠️ Atenção Claude Code:** A função `getOCRWorker()` acessa o worker singleton do arquivo.  
> Inspecione a declaração do worker no arquivo existente (`let worker`, `const worker`, etc.)  
> e ajuste o retorno de `getOCRWorker()` para referenciar a variável correta.  
> **Não crie um segundo worker** — isso causa conflito de recursos.

---

## ETAPA 4 — Hook useRealtimeScanner (revisado)

**Arquivo:** `src/hooks/useRealtimeScanner.ts`  
**Ação:** SUBSTITUIR completamente o conteúdo do arquivo existente

```typescript
// src/hooks/useRealtimeScanner.ts
// Hook que orquestra o pipeline OpenCV + Tesseract para o RealtimeScanner
// Substitui a versão anterior que usava Google Cloud Vision

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { loadOpenCV, isOpenCVReady } from '@/services/opencvLoader';
import { extractROIs, preprocessForOCR } from '@/services/opencvPipeline';
import { initOCR, recognizeBatch } from '@/services/ocrService';
import type { RealtimeOCRResult } from '@/services/ocrService';
import type { UserSticker } from '@/types'; // ajuste o path conforme o projeto

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type StickerStatus = 'new' | 'owned' | 'duplicate' | 'pasted';

export interface DetectedSticker extends RealtimeOCRResult {
  status: StickerStatus;
  albumPage?: number;
}

export type ScannerReadyState =
  | 'loading_opencv'   // OpenCV.js sendo carregado do CDN
  | 'loading_ocr'      // Tesseract worker sendo inicializado
  | 'ready'            // Pronto para escanear
  | 'scanning'         // Frame sendo processado
  | 'error';           // Falha irrecuperável

export interface RealtimeScannerState {
  detected: DetectedSticker[];
  readyState: ScannerReadyState;
  errorMessage: string | null;
  framesProcessed: number;
  lastScanDurationMs: number;
}

// ─── Configuração ────────────────────────────────────────────────────────────

// Intervalo entre scans em ms (aumentar se dispositivo for lento)
const SCAN_INTERVAL_MS = 1200;

// Confiança mínima do Tesseract para aceitar um resultado (0-100)
const MIN_CONFIDENCE = 55;

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useRealtimeScanner(
  videoRef: React.RefObject<HTMLVideoElement>,
  stickers: UserSticker[],
  isActive: boolean
) {
  const [state, setState] = useState<RealtimeScannerState>({
    detected: [],
    readyState: 'loading_opencv',
    errorMessage: null,
    framesProcessed: 0,
    lastScanDurationMs: 0,
  });

  // Canvas oculto reutilizado a cada frame (evita criar/destruir DOM)
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isProcessingRef = useRef(false);

  // ── Inicialização assíncrona ──────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        // 1. Carregar OpenCV.js
        setState(s => ({ ...s, readyState: 'loading_opencv' }));
        await loadOpenCV();
        if (cancelled) return;

        // 2. Inicializar Tesseract worker
        setState(s => ({ ...s, readyState: 'loading_ocr' }));
        await initOCR();
        if (cancelled) return;

        // 3. Criar canvas reutilizável
        canvasRef.current = document.createElement('canvas');

        setState(s => ({ ...s, readyState: 'ready' }));
      } catch (err) {
        if (cancelled) return;
        setState(s => ({
          ...s,
          readyState: 'error',
          errorMessage: err instanceof Error ? err.message : 'Erro desconhecido na inicialização',
        }));
      }
    }

    init();

    return () => {
      cancelled = true;
    };
  }, []);

  // ── Processamento de frame ────────────────────────────────────────────────

  const processFrame = useCallback(async () => {
    // Guards: não processar se não estiver pronto ou já processando
    if (isProcessingRef.current) return;
    if (!videoRef.current || !canvasRef.current) return;
    if (!isOpenCVReady()) return;

    const video = videoRef.current;
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

    isProcessingRef.current = true;
    const startTime = performance.now();

    setState(s => ({ ...s, readyState: 'scanning' }));

    try {
      // 1. Capturar frame atual do vídeo no canvas
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(video, 0, 0);

      // 2. OpenCV: detectar e recortar ROIs (retângulos de código)
      const crops = extractROIs(canvas);

      let ocrResults: RealtimeOCRResult[] = [];

      if (crops.length > 0) {
        // 3. Pré-processar cada crop para melhor qualidade OCR
        const processedCrops = crops.map(crop => ({
          ...crop,
          canvas: preprocessForOCR(crop.canvas),
        }));

        // 4. Tesseract: OCR em batch nos crops
        ocrResults = await recognizeBatch(processedCrops);
      }

      // 5. Fallback: se OpenCV não encontrou ROIs, tenta OCR no frame completo
      // (útil para figurinhas com tags de baixo contraste)
      if (crops.length === 0) {
        const fullFrameCanvas = preprocessForOCR(canvas);
        ocrResults = await recognizeBatch([
          { canvas: fullFrameCanvas, roi: { x: 0, y: 0, width: canvas.width, height: canvas.height } }
        ]);
      }

      // 6. Filtrar por confiança mínima
      const confident = ocrResults.filter(r => r.confidence >= MIN_CONFIDENCE && r.isValid);

      // 7. Enriquecer com status do álbum do usuário
      const detected: DetectedSticker[] = confident.map(result => ({
        ...result,
        status: getStickerStatus(result.code, stickers),
        albumPage: getCatalogPage(result.code),
      }));

      const duration = performance.now() - startTime;

      setState(s => ({
        ...s,
        detected,
        readyState: 'ready',
        framesProcessed: s.framesProcessed + 1,
        lastScanDurationMs: Math.round(duration),
      }));
    } catch (error) {
      console.warn('[useRealtimeScanner] Erro ao processar frame:', error);
      setState(s => ({ ...s, readyState: 'ready' }));
    } finally {
      isProcessingRef.current = false;
    }
  }, [videoRef, stickers]);

  // ── Controle do intervalo ─────────────────────────────────────────────────

  useEffect(() => {
    if (!isActive || state.readyState === 'error' || state.readyState === 'loading_opencv' || state.readyState === 'loading_ocr') {
      // Parar intervalo se scanner está inativo ou não pronto
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    if (state.readyState === 'ready' || state.readyState === 'scanning') {
      if (!intervalRef.current) {
        intervalRef.current = setInterval(processFrame, SCAN_INTERVAL_MS);
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isActive, state.readyState, processFrame]);

  return state;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getStickerStatus(code: string, stickers: UserSticker[]): StickerStatus {
  const sticker = stickers.find(s => s.sticker_code === code);
  if (!sticker) return 'new';
  if (sticker.is_pasted) return 'pasted';
  if (sticker.quantity_owned > 1) return 'duplicate';
  return 'owned';
}

function getCatalogPage(code: string): number | undefined {
  // Busca no cache do catálogo (localStorage) — mesma lógica do ocrService existente
  try {
    const raw = localStorage.getItem('sticker_catalog_cache');
    if (!raw) return undefined;
    const { data } = JSON.parse(raw) as { data: Array<{ sticker_code: string; album_page: number }> };
    return data.find(e => e.sticker_code === code)?.album_page;
  } catch {
    return undefined;
  }
}
```

---

## ETAPA 5 — Componente RealtimeScanner.tsx (revisado)

**Arquivo:** `src/components/scanner/RealtimeScanner.tsx`  
**Ação:** SUBSTITUIR completamente o conteúdo do arquivo existente

```typescript
// src/components/scanner/RealtimeScanner.tsx
// Componente principal do scanner em tempo real
// OpenCV.js detecta ROIs → Tesseract.js lê os códigos → overlay colorido

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRealtimeScanner, StickerStatus, DetectedSticker } from '@/hooks/useRealtimeScanner';
import type { UserSticker } from '@/types'; // ajuste conforme o projeto

// ─── Tipos e props ────────────────────────────────────────────────────────────

interface RealtimeScannerProps {
  stickers: UserSticker[];
  onConfirm: (codes: string[]) => void;
  onClose: () => void;
}

// ─── Cores semânticas por status ─────────────────────────────────────────────

const STATUS_CONFIG: Record<StickerStatus, { bg: string; border: string; label: string; emoji: string }> = {
  new:       { bg: 'rgba(16, 185, 129, 0.25)',  border: '#10B981', label: 'Nova',      emoji: '✨' },
  owned:     { bg: 'rgba(59, 130, 246, 0.25)',  border: '#3B82F6', label: 'Tenho',     emoji: '✅' },
  duplicate: { bg: 'rgba(245, 158, 11, 0.25)',  border: '#F59E0B', label: 'Repetida',  emoji: '🔄' },
  pasted:    { bg: 'rgba(107, 114, 128, 0.25)', border: '#6B7280', label: 'Colada',    emoji: '📌' },
};

// ─── Componente ───────────────────────────────────────────────────────────────

export default function RealtimeScanner({ stickers, onConfirm, onClose }: RealtimeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isActive, setIsActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());

  const { detected, readyState, errorMessage, framesProcessed, lastScanDurationMs } =
    useRealtimeScanner(videoRef, stickers, isActive);

  // ── Câmera ──────────────────────────────────────────────────────────────

  useEffect(() => {
    let stream: MediaStream | null = null;

    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setIsActive(true);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Acesso à câmera negado';
        setCameraError(msg);
      }
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Câmera não suportada neste navegador. Use Chrome ou Safari atualizado.');
      return;
    }

    startCamera();

    return () => {
      setIsActive(false);
      stream?.getTracks().forEach(t => t.stop());
    };
  }, []);

  // ── Seleção de figurinhas para confirmar ─────────────────────────────────

  // Auto-selecionar figurinhas novas detectadas
  useEffect(() => {
    setSelectedCodes(prev => {
      const next = new Set(prev);
      detected
        .filter(d => d.status === 'new')
        .forEach(d => next.add(d.code));
      return next;
    });
  }, [detected]);

  const toggleCode = useCallback((code: string) => {
    setSelectedCodes(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }, []);

  const handleConfirm = useCallback(() => {
    if (selectedCodes.size === 0) return;
    onConfirm([...selectedCodes]);
  }, [selectedCodes, onConfirm]);

  // ── Mensagens de estado ──────────────────────────────────────────────────

  const statusMessage = {
    loading_opencv: 'Carregando OpenCV.js...',
    loading_ocr:    'Iniciando OCR...',
    ready:          'Aponte para as figurinhas',
    scanning:       'Analisando frame...',
    error:          errorMessage ?? 'Erro',
  }[readyState];

  const isReady = readyState === 'ready' || readyState === 'scanning';

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: '#000',
      display: 'flex', flexDirection: 'column',
      zIndex: 50,
    }}>

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px',
        background: 'rgba(0,0,0,0.8)',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        zIndex: 10,
      }}>
        <button
          onClick={onClose}
          style={{
            background: 'none', border: 'none', color: '#fff',
            fontSize: '24px', cursor: 'pointer', padding: '4px 8px',
          }}
          aria-label="Fechar scanner"
        >
          ✕
        </button>

        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#fff', fontSize: '14px', fontWeight: 600 }}>
            Scanner Tempo Real
          </div>
          <div style={{
            fontSize: '11px',
            color: readyState === 'error' ? '#EF4444' : isReady ? '#10B981' : '#F59E0B',
          }}>
            {statusMessage}
          </div>
        </div>

        {/* Debug info (remover em produção se desejado) */}
        <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', textAlign: 'right' }}>
          <div>F#{framesProcessed}</div>
          <div>{lastScanDurationMs}ms</div>
        </div>
      </div>

      {/* Área da câmera + overlay */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>

        {/* Erro de câmera */}
        {cameraError && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            background: '#111', color: '#EF4444',
            padding: '24px', textAlign: 'center', gap: '12px',
          }}>
            <span style={{ fontSize: '40px' }}>📷</span>
            <p style={{ fontSize: '14px', lineHeight: 1.5 }}>{cameraError}</p>
          </div>
        )}

        {/* Vídeo */}
        <video
          ref={videoRef}
          style={{
            width: '100%', height: '100%',
            objectFit: 'cover',
            display: cameraError ? 'none' : 'block',
          }}
          muted
          playsInline
        />

        {/* Overlay de figurinhas detectadas */}
        {detected.length > 0 && (
          <StickerOverlay detected={detected} selectedCodes={selectedCodes} onToggle={toggleCode} />
        )}

        {/* Indicador de scanning */}
        {readyState === 'scanning' && (
          <div style={{
            position: 'absolute', top: '12px', left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,0.6)',
            borderRadius: '20px', padding: '4px 12px',
            fontSize: '11px', color: '#F59E0B',
          }}>
            ⟳ Analisando...
          </div>
        )}

        {/* Guia visual quando nada detectado */}
        {detected.length === 0 && isReady && !cameraError && (
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            border: '2px dashed rgba(255,255,255,0.3)',
            borderRadius: '12px',
            width: '70%', height: '40%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '12px' }}>
              Aponte para as figurinhas
            </span>
          </div>
        )}
      </div>

      {/* Painel inferior: lista detectada + botão confirmar */}
      {detected.length > 0 && (
        <div style={{
          background: 'rgba(0,0,0,0.9)',
          borderTop: '1px solid rgba(255,255,255,0.1)',
          maxHeight: '40vh', overflowY: 'auto',
          padding: '12px 16px',
        }}>

          <div style={{
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', marginBottom: '8px',
          }}>
            <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px' }}>
              {detected.length} figurinha{detected.length > 1 ? 's' : ''} detectada{detected.length > 1 ? 's' : ''}
            </span>
            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px' }}>
              Toque para selecionar
            </span>
          </div>

          {/* Lista */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
            {detected.map(d => {
              const cfg = STATUS_CONFIG[d.status];
              const isSelected = selectedCodes.has(d.code);
              return (
                <button
                  key={d.code}
                  onClick={() => toggleCode(d.code)}
                  style={{
                    background: isSelected ? cfg.bg : 'rgba(255,255,255,0.05)',
                    border: `2px solid ${isSelected ? cfg.border : 'rgba(255,255,255,0.2)'}`,
                    borderRadius: '8px',
                    padding: '6px 12px',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '6px',
                    transition: 'all 150ms',
                  }}
                >
                  <span style={{ fontSize: '14px' }}>{cfg.emoji}</span>
                  <span style={{ color: '#fff', fontSize: '14px', fontWeight: 700 }}>{d.rawCode}</span>
                  <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '10px' }}>{cfg.label}</span>
                </button>
              );
            })}
          </div>

          {/* Botão confirmar */}
          <button
            onClick={handleConfirm}
            disabled={selectedCodes.size === 0}
            style={{
              width: '100%', padding: '14px',
              background: selectedCodes.size > 0
                ? 'linear-gradient(135deg, #065F46, #10B981)'
                : 'rgba(255,255,255,0.1)',
              color: selectedCodes.size > 0 ? '#fff' : 'rgba(255,255,255,0.3)',
              border: 'none', borderRadius: '10px',
              fontSize: '15px', fontWeight: 700,
              cursor: selectedCodes.size > 0 ? 'pointer' : 'not-allowed',
              transition: 'all 150ms',
            }}
          >
            {selectedCodes.size > 0
              ? `✓ Confirmar ${selectedCodes.size} figurinha${selectedCodes.size > 1 ? 's' : ''}`
              : 'Selecione figurinhas para confirmar'}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Sub-componente: overlay colorido ─────────────────────────────────────────

interface StickerOverlayProps {
  detected: DetectedSticker[];
  selectedCodes: Set<string>;
  onToggle: (code: string) => void;
}

function StickerOverlay({ detected, selectedCodes, onToggle }: StickerOverlayProps) {
  return (
    <div
      style={{
        position: 'absolute', inset: 0,
        pointerEvents: 'none', // O overlay não bloqueia toque no vídeo
      }}
    >
      {detected.map(d => {
        const cfg = STATUS_CONFIG[d.status];
        const isSelected = selectedCodes.has(d.code);

        return (
          <div
            key={d.code}
            onClick={() => onToggle(d.code)}
            style={{
              position: 'absolute',
              // Posição centralizada (sem coordenadas de bounding box neste componente)
              // As coordenadas reais viriam do ROI detectado pelo OpenCV
              // Por ora, exibir como lista flutuante no canto
              bottom: '8px', right: '8px',
              pointerEvents: 'all',
              background: isSelected ? cfg.bg : 'rgba(0,0,0,0.5)',
              border: `2px solid ${cfg.border}`,
              borderRadius: '6px',
              padding: '4px 8px',
              cursor: 'pointer',
              transition: 'opacity 150ms',
            }}
          >
            <span style={{ color: '#fff', fontSize: '13px', fontWeight: 700 }}>
              {d.rawCode}
            </span>
          </div>
        );
      })}
    </div>
  );
}
```

---

## ETAPA 6 — Integração na Tela de Scan

**Arquivo:** `src/app/(app)/scan/page.tsx`  
**Ação:** ALTERAR — substituir a importação e uso do scanner de tempo real

Localizar no arquivo o bloco que renderiza o `RealtimeScanner` (opção 3 — ⚡ Tempo Real) e garantir que:

1. Importa de `@/components/scanner/RealtimeScanner` (sem alteração de path)
2. Passa `stickers` como prop (array `UserSticker[]` do estado da página)
3. Passa `onConfirm` que chama `upsertSticker` para cada código
4. Passa `onClose` que fecha o scanner

```typescript
// Exemplo de uso na page.tsx — NÃO substituir toda a page, apenas este bloco:

{activeScanner === 'realtime' && (
  <RealtimeScanner
    stickers={userStickers}          // UserSticker[] — já disponível na página
    onConfirm={async (codes) => {
      for (const code of codes) {
        await upsertSticker(code);   // função existente na página
      }
      setActiveScanner(null);
      showToast(`${codes.length} figurinha${codes.length > 1 ? 's' : ''} salva${codes.length > 1 ? 's' : ''}!`);
    }}
    onClose={() => setActiveScanner(null)}
  />
)}
```

---

## ETAPA 7 — Validação Final

Execute na ordem:

```bash
# 1. Verificar tipos TypeScript
npx tsc --noEmit

# 2. Build de produção
npm run build

# 3. Checar que não há referências ao Google Cloud Vision no módulo de scanner
grep -r "vision" src/services/ src/hooks/ src/components/scanner/ --include="*.ts" --include="*.tsx"
# Esperado: zero resultados relacionados a Cloud Vision
```

### Checklist de comportamento esperado

- [ ] OpenCV.js carrega via CDN na primeira montagem do componente
- [ ] Tesseract worker inicializa uma única vez e é reutilizado entre frames
- [ ] Scanner processa um frame a cada ~1200ms (não em paralelo)
- [ ] Figurinhas com código `XXX 00` são detectadas e exibidas no painel
- [ ] Figurinhas novas ficam selecionadas automaticamente (verde)
- [ ] Botão "Confirmar" só ativa quando há pelo menos 1 selecionada
- [ ] Fechar o componente para o stream da câmera e o intervalo
- [ ] Nenhuma chamada para Google Cloud Vision é feita (verificar Network tab)
- [ ] `npm run build` sem erros de TypeScript

---

## PROBLEMAS CONHECIDOS E SOLUÇÕES

| Problema | Causa | Solução |
|---|---|---|
| `window.cv is not defined` | OpenCV.js ainda carregando | `loadOpenCV()` retorna Promise — sempre aguardar com `await` |
| Worker Tesseract duplicado | `initOCR()` chamado duas vezes | Verificar que `initOCR` usa singleton — não cria worker se já existe |
| Memory leak após muitos frames | `Mat` OpenCV não deletada | O `finally` no `extractROIs` deleta todas — não remover |
| OCR lento no primeiro frame | Worker Tesseract sendo iniciado | Normal — após inicialização o worker fica em memória |
| OpenCV não detecta ROIs | Iluminação insuficiente ou figurinha fora do ângulo | Fallback para OCR no frame completo cobre esse caso |
| `getOCRWorker` retorna null | Nome da variável diferente no ocrService.ts | Inspecionar o arquivo e ajustar a referência conforme Etapa 3 |

---

## O QUE NÃO ALTERAR

```
❌ NÃO alterar src/services/ocrService.ts exceto adicionar o bloco da Etapa 3
❌ NÃO alterar src/app/(app)/scan/page.tsx exceto o bloco do RealtimeScanner
❌ NÃO alterar CameraScanner.tsx, GalleryUpload.tsx, ScanResultScreen.tsx
❌ NÃO remover initOCR(), recognizeText(), extractAndValidateCodes(), loadCatalogCache()
❌ NÃO criar segundo worker Tesseract — reutilizar o singleton existente
❌ NÃO usar `any` em TypeScript — manter tipagem estrita
```

---

*Figurinhas Copa 2026 — Sessão Web-5 Revisada | OpenCV.js + Tesseract.js | Sem Google Vision | Maio 2026*
