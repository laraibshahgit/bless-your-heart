import type { Photo } from '@/types';
import { ensureFontsReady } from './fonts';

const LOGICAL_SIZE = 1080;
const PADDING = 24;

export async function loadImage(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = url;
  await img.decode();
  return img;
}

export interface CompositeOptions {
  canvas: HTMLCanvasElement;
  img: HTMLImageElement;
  photo: Photo;
  line1: string;
  line2: string;
  scale?: number;
}

export function setupCanvas(canvas: HTMLCanvasElement, displaySize: number): CanvasRenderingContext2D {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = LOGICAL_SIZE * dpr;
  canvas.height = LOGICAL_SIZE * dpr;
  canvas.style.width = `${displaySize}px`;
  canvas.style.height = `${displaySize}px`;

  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  return ctx;
}

export function composite({ canvas, img, photo, line1, line2, scale = 1 }: CompositeOptions): void {
  const ctx = canvas.getContext('2d')!;
  const dpr = window.devicePixelRatio || 1;

  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.clearRect(0, 0, LOGICAL_SIZE, LOGICAL_SIZE);

  ctx.drawImage(img, 0, 0, LOGICAL_SIZE, LOGICAL_SIZE);

  const fillColor = photo.textColor === 'white' ? '#FFFFFF' : '#1A1612';
  ctx.fillStyle = fillColor;

  const zoneX = photo.textZone.x * LOGICAL_SIZE;
  const zoneY = photo.textZone.y * LOGICAL_SIZE;
  const zoneW = photo.textZone.width * LOGICAL_SIZE;
  const centerX = zoneX + zoneW / 2;

  const line1Size = Math.round(64 * scale);
  ctx.font = `500 ${line1Size}px "Cormorant Garamond"`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'center';
  if ('letterSpacing' in ctx) {
    (ctx as any).letterSpacing = '0.02em';
  }
  const line1Y = zoneY + PADDING;
  ctx.fillText(line1, centerX, line1Y);

  const line2Size = Math.round(44 * scale);
  ctx.font = `italic 400 ${line2Size}px "Cormorant Garamond"`;
  if ('letterSpacing' in ctx) {
    (ctx as any).letterSpacing = '0.01em';
  }
  const line2Y = line1Y + line1Size * 1.15 + 16;
  ctx.fillText(line2, centerX, line2Y);

  drawWatermark(ctx, photo);

  ctx.restore();
}

function drawWatermark(ctx: CanvasRenderingContext2D, photo: Photo): void {
  const text = 'Bless Your Heart';
  const padding = 32;

  ctx.font = '400 18px "Cormorant Garamond"';
  if ('letterSpacing' in ctx) {
    (ctx as any).letterSpacing = '0.04em';
  }
  ctx.fillStyle = photo.textColor === 'white' ? '#FFFFFF' : '#1A1612';
  ctx.globalAlpha = 0.85;

  switch (photo.watermarkPosition) {
    case 'lower-left':
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(text, padding, LOGICAL_SIZE - padding);
      break;
    case 'lower-right':
      ctx.textAlign = 'right';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(text, LOGICAL_SIZE - padding, LOGICAL_SIZE - padding);
      break;
    case 'upper-left':
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(text, padding, padding);
      break;
    case 'upper-right':
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText(text, LOGICAL_SIZE - padding, padding);
      break;
  }

  ctx.globalAlpha = 1.0;
}

export type FitCheckResult = {
  ok: true;
  scale: number;
} | {
  ok: false;
  reason: 'overflow';
};

export async function checkFit(
  line1: string,
  line2: string,
  photo: Photo
): Promise<FitCheckResult> {
  await ensureFontsReady();

  const offscreen = document.createElement('canvas');
  const ctx = offscreen.getContext('2d')!;

  const usable = photo.textZone.width * LOGICAL_SIZE - 2 * PADDING;

  ctx.font = '500 64px "Cormorant Garamond"';
  if ('letterSpacing' in ctx) {
    (ctx as any).letterSpacing = '0.02em';
  }
  const line1Width = ctx.measureText(line1).width;

  ctx.font = 'italic 400 44px "Cormorant Garamond"';
  if ('letterSpacing' in ctx) {
    (ctx as any).letterSpacing = '0.01em';
  }
  const line2Width = ctx.measureText(line2).width;

  const line1Scale = line1Width <= usable ? 1 : usable / line1Width;
  const line2Scale = line2Width <= usable ? 1 : usable / line2Width;
  const minScale = Math.min(line1Scale, line2Scale);

  if (minScale >= 0.95) {
    return { ok: true, scale: minScale };
  }

  return { ok: false, reason: 'overflow' };
}
