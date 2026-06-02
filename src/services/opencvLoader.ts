// src/services/opencvLoader.ts
// Carrega OpenCV.js via CDN de forma lazy (apenas quando RealtimeScanner é montado)
// OpenCV.js expõe o objeto global `cv` após carregamento assíncrono

declare global {
  interface Window {
    cv: any;
    Module: {
      onRuntimeInitialized?: () => void;
    };
  }
}

const OPENCV_CDN_URL = 'https://docs.opencv.org/4.8.0/opencv.js';

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
