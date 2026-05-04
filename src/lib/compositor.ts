import type { FitResult, Photo } from '@/types';
import { ensureFontsReady } from './fonts';
import {
  POSTER_LOGICAL_SIZE_PX,
  TEXT_ZONE_PADDING_PX,
  WATERMARK_PADDING_PX,
  LINE1_FONT_PX,
  LINE2_FONT_PX,
  WATERMARK_FONT_PX,
  LINE1_LINE_HEIGHT_RATIO,
  LINE_GAP_PX,
  LETTER_SPACING_LINE1,
  LETTER_SPACING_LINE2,
  LETTER_SPACING_WATERMARK,
  WATERMARK_OPACITY,
  MIN_FIT_SCALE,
  WATERMARK_TEXT,
} from './poster-layout';

function setLetterSpacing(ctx: CanvasRenderingContext2D, value: string): void {
  // CanvasRenderingContext2D.letterSpacing is a relatively recent addition
  // (Chromium 99, Safari 16.4) and TS lib.dom may not include it depending
  // on the consumer's lib target. Cast through unknown to set the property
  // when available, no-op when not — graceful degradation.
  if ('letterSpacing' in ctx) {
    (ctx as unknown as { letterSpacing: string }).letterSpacing = value;
  }
}

// `getContext('2d')` returns null only on canvases that have already had
// a different context type acquired, or on user agents that disabled 2D
// (vanishingly rare). All consumers of the helpers below construct a fresh
// canvas, so a null return is unrecoverable — throw with a descriptive
// message rather than letting a `!`-suppressed null propagate as a confusing
// "Cannot read properties of null (reading 'fillText')" stack later.
function require2dContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to acquire 2D canvas context');
  }
  return ctx;
}

// Outer cap on the image fetch + decode round-trip. `img.decode()` resolves once
// the bytes are downloaded AND the browser has a paint-ready bitmap; if the CDN
// stalls (DNS hang, TLS failure, mid-stream socket drop), the promise never
// settles and the user sits on a blank canvas indefinitely after a successful
// /generate response. The HTML <img> element has no AbortSignal support yet, so
// we race `decode()` with a setTimeout — on timeout we surface the error so the
// PosterCanvas catch path logs `poster_render_failed` for ops grep, and clear
// `img.src` as a soft hint that the browser can drop the in-flight fetch.
// 15s gives broadband + slow-3G enough headroom to win on cold cache without
// keeping a stuck user waiting past attention span; in practice firebasestorage
// serves these photos in <2s on broadband and <8s on slow-3G.
export const IMAGE_LOAD_TIMEOUT_MS = 15_000;

export async function loadImage(
  url: string,
  timeoutMs: number = IMAGE_LOAD_TIMEOUT_MS
): Promise<HTMLImageElement> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = url;

  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      img.decode(),
      new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          // Hint to the browser that the in-flight fetch is unwanted. Spec
          // doesn't guarantee abort, but Chromium/WebKit treat src reassignment
          // as a cancel signal in practice; worst case it's a no-op.
          img.src = '';
          reject(new Error(`Image load timeout after ${timeoutMs}ms: ${url}`));
        }, timeoutMs);
      }),
    ]);
    return img;
  } finally {
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
  }
}

interface CompositeOptions {
  canvas: HTMLCanvasElement;
  img: HTMLImageElement;
  photo: Photo;
  line1: string;
  line2: string;
  scale?: number;
}

export function setupCanvas(canvas: HTMLCanvasElement, displaySize: number): CanvasRenderingContext2D {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = POSTER_LOGICAL_SIZE_PX * dpr;
  canvas.height = POSTER_LOGICAL_SIZE_PX * dpr;
  canvas.style.width = `${displaySize}px`;
  canvas.style.height = `${displaySize}px`;

  const ctx = require2dContext(canvas);
  ctx.scale(dpr, dpr);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  return ctx;
}

export function composite({ canvas, img, photo, line1, line2, scale = 1 }: CompositeOptions): void {
  const ctx = require2dContext(canvas);
  const dpr = window.devicePixelRatio || 1;

  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.clearRect(0, 0, POSTER_LOGICAL_SIZE_PX, POSTER_LOGICAL_SIZE_PX);

  ctx.drawImage(img, 0, 0, POSTER_LOGICAL_SIZE_PX, POSTER_LOGICAL_SIZE_PX);

  const fillColor = photo.textColor === 'white' ? '#FFFFFF' : '#1A1612';
  ctx.fillStyle = fillColor;

  const zoneX = photo.textZone.x * POSTER_LOGICAL_SIZE_PX;
  const zoneY = photo.textZone.y * POSTER_LOGICAL_SIZE_PX;
  const zoneW = photo.textZone.width * POSTER_LOGICAL_SIZE_PX;
  const centerX = zoneX + zoneW / 2;

  const line1Size = Math.round(LINE1_FONT_PX * scale);
  ctx.font = `500 ${line1Size}px "Cormorant Garamond"`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'center';
  setLetterSpacing(ctx, LETTER_SPACING_LINE1);
  const line1Y = zoneY + TEXT_ZONE_PADDING_PX;
  ctx.fillText(line1, centerX, line1Y);

  const line2Size = Math.round(LINE2_FONT_PX * scale);
  ctx.font = `italic 400 ${line2Size}px "Cormorant Garamond"`;
  setLetterSpacing(ctx, LETTER_SPACING_LINE2);
  const line2Y = line1Y + line1Size * LINE1_LINE_HEIGHT_RATIO + LINE_GAP_PX;
  ctx.fillText(line2, centerX, line2Y);

  drawWatermark(ctx, photo);

  ctx.restore();
}

function drawWatermark(ctx: CanvasRenderingContext2D, photo: Photo): void {
  ctx.font = `400 ${WATERMARK_FONT_PX}px "Cormorant Garamond"`;
  setLetterSpacing(ctx, LETTER_SPACING_WATERMARK);
  ctx.fillStyle = photo.textColor === 'white' ? '#FFFFFF' : '#1A1612';
  ctx.globalAlpha = WATERMARK_OPACITY;

  const farEdge = POSTER_LOGICAL_SIZE_PX - WATERMARK_PADDING_PX;

  switch (photo.watermarkPosition) {
    case 'lower-left':
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(WATERMARK_TEXT, WATERMARK_PADDING_PX, farEdge);
      break;
    case 'lower-right':
      ctx.textAlign = 'right';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(WATERMARK_TEXT, farEdge, farEdge);
      break;
    case 'upper-left':
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(WATERMARK_TEXT, WATERMARK_PADDING_PX, WATERMARK_PADDING_PX);
      break;
    case 'upper-right':
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText(WATERMARK_TEXT, farEdge, WATERMARK_PADDING_PX);
      break;
  }

  ctx.globalAlpha = 1.0;
}

export async function checkFit(
  line1: string,
  line2: string,
  photo: Photo
): Promise<FitResult> {
  await ensureFontsReady();

  const offscreen = document.createElement('canvas');
  const ctx = require2dContext(offscreen);

  const usable = photo.textZone.width * POSTER_LOGICAL_SIZE_PX - 2 * TEXT_ZONE_PADDING_PX;

  ctx.font = `500 ${LINE1_FONT_PX}px "Cormorant Garamond"`;
  setLetterSpacing(ctx, LETTER_SPACING_LINE1);
  const line1Width = ctx.measureText(line1).width;

  ctx.font = `italic 400 ${LINE2_FONT_PX}px "Cormorant Garamond"`;
  setLetterSpacing(ctx, LETTER_SPACING_LINE2);
  const line2Width = ctx.measureText(line2).width;

  const line1Scale = line1Width <= usable ? 1 : usable / line1Width;
  const line2Scale = line2Width <= usable ? 1 : usable / line2Width;
  const minScale = Math.min(line1Scale, line2Scale);

  if (minScale >= MIN_FIT_SCALE) {
    return { ok: true, scale: minScale };
  }

  return { ok: false, reason: 'overflow' };
}
