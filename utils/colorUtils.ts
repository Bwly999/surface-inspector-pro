import { CUSTOM_COOLWARM_HEX } from '../constants';

const hexToRgb = (hex: string): number[] => {
  const bigint = parseInt(hex.slice(1), 16);
  return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const hslToRgb = (h: number, s: number, l: number): number[] => {
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
};

const CUSTOM_COOLWARM_RGB = CUSTOM_COOLWARM_HEX.map(hexToRgb).reverse();

type ColorMapper = (t: number, min: number, max: number) => number[];

const COLOR_MAPS: Record<string, ColorMapper> = {
  coolwarm: (t, min, max) => {
    // If t is outside min/max, clamp it, effectively making colors absolute to the range provided
    const val = Math.max(min, Math.min(max, t));
    const range = max - min;
    const fac = range === 0 ? 0.5 : (val - min) / range;
    
    const len = CUSTOM_COOLWARM_RGB.length;
    const scaled = fac * (len - 1);
    const idx1 = Math.floor(scaled);
    const idx2 = Math.min(len - 1, idx1 + 1);
    const localT = scaled - idx1;
    
    const safeIdx1 = Math.max(0, Math.min(len - 1, idx1));
    const safeIdx2 = Math.max(0, Math.min(len - 1, idx2));
    
    const c1 = CUSTOM_COOLWARM_RGB[safeIdx1] || [0, 0, 0];
    const c2 = CUSTOM_COOLWARM_RGB[safeIdx2] || [0, 0, 0];
    
    return [
      lerp(c1[0], c2[0], localT),
      lerp(c1[1], c2[1], localT),
      lerp(c1[2], c2[2], localT)
    ];
  },
  stepped30: (t, min, max) => steppedHsl(t, min, max, 30),
  stepped20: (t, min, max) => steppedHsl(t, min, max, 20),
  stepped15: (t, min, max) => steppedHsl(t, min, max, 15),
  magma: (t, min, max) => {
    const norm = (t - min) / (max - min || 1);
    const val = Math.max(0, Math.min(1, norm));
    if (val < 0.3) return [val * 20, 0, val * 50 + 20];
    if (val < 0.6) return [val * 200, val * 50, val * 100];
    return [255, 100 + (val - 0.6) * 400, 100];
  },
  jet: (t, min, max) => {
    const norm = (t - min) / (max - min || 1);
    const val = Math.max(0, Math.min(1, norm));
    let r, g, b;
    if (val < 0.125) { r = 0; g = 0; b = 0.5 + 4 * val; }
    else if (val < 0.375) { r = 0; g = 4 * (val - 0.125); b = 1; }
    else if (val < 0.625) { r = 4 * (val - 0.375); g = 1; b = 1 - 4 * (val - 0.375); }
    else if (val < 0.875) { r = 1; g = 1 - 4 * (val - 0.625); b = 0; }
    else { r = 1 - 4 * (val - 0.875); g = 0; b = 0; }
    return [r * 255, g * 255, b * 255];
  },
  anomaly: (t, min, max) => {
    const norm = (t - min) / (max - min || 1);
    const val = Math.max(0, Math.min(1, norm));
    if (val < 0.3) {
      const v = val * 300;
      return [v, v, v];
    } else {
      const i = (val - 0.3) / 0.7;
      return [255, 255 * (1 - i), 0];
    }
  }
};

function steppedHsl(t: number, min: number, max: number, steps: number) {
  const norm = (t - min) / (max - min || 1);
  const val = Math.max(0, Math.min(1, norm));
  const stepIdx = Math.min(steps - 1, Math.floor(val * steps));
  const localT = (val * steps) - stepIdx;
  const hue = 240 - (stepIdx / (steps - 1)) * 240;
  const l = 0.4 + 0.3 * localT;
  const s = 0.8;
  return hslToRgb(hue / 360, s, l);
}

export const getColor = (val: number, mapName = 'coolwarm', min = 0, max = 1): number[] => {
  const mapper = COLOR_MAPS[mapName] || COLOR_MAPS.coolwarm;
  return mapper(val, min, max).map(Math.floor);
};