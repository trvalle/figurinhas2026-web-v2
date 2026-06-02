// src/services/ocrService.ts
// Serviço OCR com Tesseract.js — calibrado para códigos de figurinhas Panini Copa 2026

import Tesseract, { createWorker } from 'tesseract.js';
import type { CropResult } from './opencvPipeline';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface RealtimeOCRResult {
  code: string;        // Ex: "BRA5" (normalizado, sem espaço)
  rawCode: string;     // Ex: "BRA 5" (como veio do OCR)
  country: string;     // Ex: "BRA"
  number: string;      // Ex: "5"
  confidence: number;  // 0-100, confiança do Tesseract
  isValid: boolean;    // true se país está em VALID_COUNTRY_CODES
}

// ─── Configuração Tesseract ───────────────────────────────────────────────────

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
  tessedit_pageseg_mode: 7, // PSM 7: linha única — OBRIGATÓRIO para crops
  tessedit_ocr_engine_mode: 1, // OEM 1: LSTM neural net apenas
  tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ',
  load_system_dawg: 0, // Desabilita dicionário de palavras
  load_freq_dawg: 0, // Desabilita dicionário de frequência
} as any;

// ─── Lista de países válidos Copa 2026 ─────────────────────────────────────

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

// ─── Worker Tesseract (singleton) ──────────────────────────────────────────

let workerInstance: Tesseract.Worker | null = null;

/**
 * Inicializa o worker Tesseract singleton.
 * Deve ser chamado uma única vez no montagem do componente.
 * O worker permanece em memória e é reutilizado entre recognizeBatch() calls.
 */
export async function initOCR(): Promise<void> {
  if (workerInstance) return; // Já inicializado

  workerInstance = await createWorker('por', 1); // Português (pode usar 'eng' também)
  await workerInstance.setParameters(REALTIME_OCR_CONFIG);
}

/**
 * Retorna o worker Tesseract singleton.
 * Retorna null se não foi inicializado.
 */
function getOCRWorker(): Tesseract.Worker | null {
  return workerInstance;
}

/**
 * Processa um array de crops em batch usando o worker Tesseract.
 * Retorna apenas resultados com padrão válido detectado.
 *
 * Usa o worker já inicializado por initOCR() — não cria novo worker.
 */
export async function recognizeBatch(
  crops: CropResult[]
): Promise<RealtimeOCRResult[]> {
  if (crops.length === 0) return [];

  const worker = getOCRWorker();
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
            rawCode: codigoValidado,
            country: country ?? '',
            number: number ?? '',
            confidence: data.confidence,
            isValid: VALID_COUNTRY_CODES.has(country ?? ''),
          });
        }
      } else {
        // Fallback: tenta extrair múltiplos códigos via regex
        // (cobre casos onde o crop capturou mais de uma tag)
        const matches = [...textoBruto.toUpperCase().matchAll(/\b([A-Z]{3})\s?(\d{1,3})\b/g)];

        for (const match of matches) {
          const candidato = `${match[1]} ${match[2]}`;
          const validado = validarECorrigirCodigo(candidato);
          if (!validado) continue;

          const [country, number] = validado.split(' ');
          const code = `${country}${number}`;

          if (seen.has(code)) continue;
          seen.add(code);

          results.push({
            code,
            rawCode: validado,
            country: country ?? '',
            number: number ?? '',
            confidence: data.confidence,
            isValid: VALID_COUNTRY_CODES.has(country ?? ''),
          });
        }
      }
    } catch (error) {
      // Falha em um crop não deve interromper os demais
      console.warn('[ocrService] Erro ao processar crop:', error);
    }
  }

  return results;
}

// ─── Validação e correção de códigos ───────────────────────────────────────

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
    .replace(/\s+/g, ' ') // Múltiplos espaços → um espaço
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
    .replace(/0/g, 'O') // zero → O maiúsculo
    .replace(/1/g, 'I') // um → I maiúsculo
    .replace(/5/g, 'S') // cinco → S maiúsculo
    .replace(/8/g, 'B'); // oito → B maiúsculo

  // Corrigir erros OCR na parte NÚMERO (posição 4+)
  // Letras que parecem números em contexto numérico
  parteNumero = parteNumero
    .replace(/O/g, '0') // O → zero
    .replace(/I/g, '1') // I → um
    .replace(/S/g, '5') // S → cinco
    .replace(/B/g, '8'); // B → oito

  const corrigido = `${parteLetra} ${parteNumero}`;

  // Validar resultado corrigido com regex estrita
  return PADRAO.test(corrigido) ? corrigido : null;
}

// ─── Exports de compatibilidade (para integração) ────────────────────────────

/**
 * Compatibilidade com código existente que pode importar essas funções.
 */
export const recognizeText = recognizeBatch;
export const extractAndValidateCodes = (text: string) => {
  const codigo = validarECorrigirCodigo(text);
  return codigo ? [{ code: codigo, isValid: true }] : [];
};
