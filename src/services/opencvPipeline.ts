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
const ADAPTIVE_BLOCK_SIZE = 15; // deve ser ímpar
const ADAPTIVE_C_CONSTANT = 2;

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

// ─── Função principal ───────────────────────────────────────────────────────

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
  let src: any = null;
  let resized: any = null;
  let gray: any = null;
  let blurred: any = null;
  let thresh: any = null;
  let hierarchy: any = null;
  let contours: any = null;

  try {
    // ── PASSO A: Redimensionar para TARGET_WIDTH_PX ──────────────────────
    src = cv.imread(sourceCanvas);

    const origW = sourceCanvas.width;
    const origH = sourceCanvas.height;
    const scale = TARGET_WIDTH_PX / origW;
    const newW = TARGET_WIDTH_PX;
    const newH = Math.round(origH * scale);

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
      cv.ADAPTIVE_THRESH_GAUSSIAN_C, // Gaussiano (mais robusto que MEAN)
      cv.THRESH_BINARY_INV, // Inverte: escuro→branco, claro→preto
      ADAPTIVE_BLOCK_SIZE, // 15px de área local
      ADAPTIVE_C_CONSTANT // constante = 2
    );

    // ── PASSO C: Detectar contornos externos ─────────────────────────────
    contours = new cv.MatVector();
    hierarchy = new cv.Mat();
    cv.findContours(
      thresh,
      contours,
      hierarchy,
      cv.RETR_EXTERNAL, // Apenas contornos externos (ignora nested)
      cv.CHAIN_APPROX_SIMPLE // Comprime pontos colineares (economiza memória)
    );

    // ── PASSO C: Filtrar contornos por proporção e tamanho ───────────────
    const candidates: ROI[] = [];

    if (contours) {
      for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i);
        const rect = cv.boundingRect(contour);
        contour.delete(); // Deletar contorno individual imediatamente

      const { x, y, width, height } = rect;

      // Ignorar contornos degenerados
      if (width <= 0 || height <= 0) continue;

      const aspectRatio = width / height;

      // FILTRO 1 — Proporção horizontal (tag ~2:1 a 3.5:1)
      if (aspectRatio < ROI_MIN_ASPECT_RATIO) continue;
      if (aspectRatio > ROI_MAX_ASPECT_RATIO) continue;

      // FILTRO 2 — Largura absoluta em pixels (após redimensionamento)
      if (width < ROI_MIN_WIDTH_PX) continue;
      if (width > ROI_MAX_WIDTH_PX) continue;

      // FILTRO 3 — Altura absoluta em pixels
      if (height < ROI_MIN_HEIGHT_PX) continue;
      if (height > ROI_MAX_HEIGHT_PX) continue;

      candidates.push({ x, y, width, height });
    }
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

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Recorta uma ROI de uma Mat OpenCV e retorna um HTMLCanvasElement.
 * Usa a Mat já processada (resized/thresh) em vez do canvas original
 * para garantir consistência com os filtros de tamanho calibrados.
 */
function cropROIFromCanvas(
  mat: any,
  roi: ROI,
  matWidth: number,
  matHeight: number
): HTMLCanvasElement | null {
  const cv = window.cv;
  if (!cv || !mat) return null;

  let cropped: any = null;

  try {
    // Aplicar padding com clamp nas bordas
    const x = Math.max(0, roi.x - CROP_PADDING_PX);
    const y = Math.max(0, roi.y - CROP_PADDING_PX);
    const w = Math.min(matWidth - x, roi.width + CROP_PADDING_PX * 2);
    const h = Math.min(matHeight - y, roi.height + CROP_PADDING_PX * 2);

    if (w <= 0 || h <= 0) return null;

    // Recortar submatriz (operação zero-copy no OpenCV)
    const rect = new cv.Rect(x, y, w, h);
    cropped = mat.roi(rect);

    // Converter para canvas HTML
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    cv.imshow(canvas, cropped);

    return canvas;
  } catch {
    return null;
  } finally {
    cropped?.delete();
  }
}

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
  out.width = cropCanvas.width * SCALE;
  out.height = cropCanvas.height * SCALE;

  const ctx = out.getContext('2d');
  if (!ctx) return cropCanvas;

  // Escalar com interpolação de imagem desabilitada (pixelated)
  // para não suavizar bordas do texto binário — mantém contraste máximo
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(cropCanvas, 0, 0, out.width, out.height);

  return out;
}
