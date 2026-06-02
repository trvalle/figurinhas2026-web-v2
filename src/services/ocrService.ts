// src/services/ocrService.ts
// DEPRECATED: Serviço OCR com Tesseract.js — mantido apenas para referência histórica
// Usar realtimeScanner.ts com processFrame() em vez disso

// import Tesseract, { createWorker } from 'tesseract.js';
// import type { CropResult } from './opencvPipeline';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface RealtimeOCRResult {
  code: string;        // Ex: "BRA5" (normalizado, sem espaço)
  rawCode: string;     // Ex: "BRA 5" (como veio do OCR)
  country: string;     // Ex: "BRA"
  number: string;      // Ex: "5"
  confidence: number;  // 0-100, confiança do Tesseract
  isValid: boolean;    // true se país está em VALID_COUNTRY_CODES
}

// ─── Configuração Tesseract (DEPRECATED) ──────────────────────────────────

// const REALTIME_OCR_CONFIG = { ... };
// const VALID_COUNTRY_CODES = new Set([ ... ]);
// let workerInstance: Tesseract.Worker | null = null;

// DEPRECATED — Todas as funções dependem de Tesseract.js que não está no stack
// Para novo código, usar realtimeScanner.ts com processFrame()

// export async function initOCR(): Promise<void> { ... }
// export async function recognizeBatch(crops: CropResult[]): Promise<RealtimeOCRResult[]> { ... }
// export function validarECorrigirCodigo(textoOcr: string): string | null { ... }
// export const recognizeText = recognizeBatch;
// export const extractAndValidateCodes = (text: string) => { ... };
