import { GridData } from "../types";

export const computeGradientMap = (data: Float32Array, width: number, height: number, minZ: number, maxZ: number): Float32Array => {
  const grad = new Float32Array(data.length);
  const range = maxZ - minZ || 1;
  let maxGrad = 0;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const n = (v: number) => (v - minZ) / range;

      const gx = -1 * n(data[idx - width - 1]) - 2 * n(data[idx - 1]) - 1 * n(data[idx + width - 1]) +
        1 * n(data[idx - width + 1]) + 2 * n(data[idx + 1]) + 1 * n(data[idx + width + 1]);
      const gy = -1 * n(data[idx - width - 1]) - 2 * n(data[idx - width]) - 1 * n(data[idx - width + 1]) +
        1 * n(data[idx + width - 1]) + 2 * n(data[idx + width]) + 1 * n(data[idx + width + 1]);

      const mag = Math.sqrt(gx * gx + gy * gy);
      grad[idx] = mag;
      if (mag > maxGrad) maxGrad = mag;
    }
  }
  if (maxGrad > 0) {
    for (let i = 0; i < grad.length; i++) grad[i] /= maxGrad;
  }
  return grad;
};

export const computeCurvatureMap = (data: Float32Array, width: number, height: number, minZ: number, maxZ: number): Float32Array => {
  const curv = new Float32Array(data.length);
  const range = maxZ - minZ || 1;
  let maxCurv = 0;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const n = (v: number) => (v - minZ) / range;

      // Central differences for First Derivatives
      // hx = (z(x+1, y) - z(x-1, y)) / 2
      const hx = (n(data[idx + 1]) - n(data[idx - 1])) * 0.5;
      const hy = (n(data[idx + width]) - n(data[idx - width])) * 0.5;

      // Central differences for Second Derivatives
      // hxx = z(x+1, y) - 2z(x, y) + z(x-1, y)
      const hxx = n(data[idx + 1]) - 2 * n(data[idx]) + n(data[idx - 1]);
      const hyy = n(data[idx + width]) - 2 * n(data[idx]) + n(data[idx - width]);
      
      // Mixed Partial Derivative
      // hxy = (z(x+1, y+1) - z(x-1, y+1) - z(x+1, y-1) + z(x-1, y-1)) / 4
      const hxy = (n(data[idx + width + 1]) - n(data[idx + width - 1]) - n(data[idx - width + 1]) + n(data[idx - width - 1])) * 0.25;

      // Mean Curvature Formula
      const num = (1 + hy * hy) * hxx - 2 * hx * hy * hxy + (1 + hx * hx) * hyy;
      const den = 2 * Math.pow(1 + hx * hx + hy * hy, 1.5);
      
      const H = num / Math.max(1e-5, den); // Avoid div by zero
      const mag = Math.abs(H);
      
      curv[idx] = mag;
      if (mag > maxCurv) maxCurv = mag;
    }
  }

  // Normalize to 0-1
  if (maxCurv > 0) {
    for (let i = 0; i < curv.length; i++) curv[i] /= maxCurv;
  }
  return curv;
};

export const parseCSV = (text: string): GridData | null => {
  const lines = text.split('\n');
  const points: { x: number, y: number, z: number }[] = [];
  const uX = new Set<number>();
  const uY = new Set<number>();

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const parts = line.split(',');
    if (parts.length >= 3) {
      const x = parseFloat(parts[0]);
      const y = parseFloat(parts[1]);
      const z = parseFloat(parts[2]);
      if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
        const xKey = Math.round(x * 1000000) / 1000000;
        const yKey = Math.round(y * 1000000) / 1000000;
        points.push({ x: xKey, y: yKey, z });
        uX.add(xKey); uY.add(yKey);
      }
    }
  }

  if (points.length === 0) return null;

  const sX = Array.from(uX).sort((a, b) => a - b);
  const sY = Array.from(uY).sort((a, b) => a - b);
  const w = sX.length;
  const h = sY.length;
  const grid = new Float32Array(w * h);

  let minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < points.length; i++) {
    if (points[i].z < minZ) minZ = points[i].z;
    if (points[i].z > maxZ) maxZ = points[i].z;
  }

  const xMap = new Map(sX.map((v, i) => [v, i]));
  const yMap = new Map(sY.map((v, i) => [v, i]));

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const gx = xMap.get(p.x);
    const gy = yMap.get(p.y);

    if (gx !== undefined && gy !== undefined) {
      // Invert Y axis for visual consistency if needed, but standard is typically bottom-left origin
      // The original code used (h - 1) - gy which flips the Y axis
      const bufferRow = (h - 1) - gy;
      const idx = bufferRow * w + gx;
      grid[idx] = p.z;
    }
  }

  return { data: grid, w, h, minZ, maxZ, xs: sX, ys: sY };
};

export const generateData = (w = 300, h = 300): GridData => {
  const data = new Float32Array(w * h);
  const xs = new Float32Array(w);
  const ys = new Float32Array(h);

  const cx = w / 2, cy = h / 2;

  for (let i = 0; i < w; i++) xs[i] = i;
  for (let i = 0; i < h; i++) ys[i] = i;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      let z = Math.max(0, Math.cos(d / 40) * 0.5 + 0.5);
      if (Math.abs(x - y) < 2) z *= 0.8;
      data[y * w + x] = z;
    }
  }
  return { data: data, w, h, minZ: 0, maxZ: 1, xs, ys };
};