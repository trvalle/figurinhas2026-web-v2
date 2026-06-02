// Type declarations for OpenCV.js (loaded via CDN)
declare module 'opencv.js' {
  export interface Mat {
    delete(): void
  }

  export interface MatVector {
    size(): number
    get(index: number): Mat
    delete(): void
  }

  export interface Size {
    width: number
    height: number
  }

  export interface Rect {
    x: number
    y: number
    width: number
    height: number
  }

  export const Mat: any
  export const MatVector: any
  export const Size: (w: number, h: number) => Size
  export const IMREAD_COLOR: number
  export const COLOR_RGBA2GRAY: number
  export const THRESH_BINARY: number
  export const THRESH_BINARY_INV: number
  export const ADAPTIVE_THRESH_MEAN_C: number
  export const RETR_EXTERNAL: number
  export const CHAIN_APPROX_SIMPLE: number

  export function imread(canvas: HTMLCanvasElement): Mat
  export function cvtColor(src: Mat, dst: Mat, code: number): void
  export function GaussianBlur(src: Mat, dst: Mat, ksize: Size, sigma: number): void
  export function adaptiveThreshold(src: Mat, dst: Mat, maxValue: number, adaptiveMethod: number, thresholdType: number, blockSize: number, C: number): void
  export function findContours(image: Mat, contours: MatVector, hierarchy: Mat, mode: number, method: number): void
  export function boundingRect(contour: Mat): Rect
}

declare global {
  interface Window {
    cv?: typeof import('opencv.js')
    Module?: {
      onRuntimeInitialized?: () => void
    }
  }
}
