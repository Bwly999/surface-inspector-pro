import { DerivedLayerKey, DerivedLayerKind, Direction, DirectionalMaps, GridData } from '../types';

/**
 * Replicates numpy.gradient for 2D data along a specific axis.
 * @param data Flat data array
 * @param width Grid width
 * @param height Grid height
 * @param spacing Physical spacing along the axis
 * @param axis 'x' (axis 1) or 'y' (axis 0)
 */
export const npGradient = (data: Float32Array, width: number, height: number, spacing: number, axis: Direction): Float32Array => {
  const grad = new Float32Array(data.length);
  const size = axis === 'x' ? width : height;
  const otherSize = axis === 'x' ? height : width;
  const edgeOrder = size >= 3 ? 2 : 1;

  for (let i = 0; i < otherSize; i++) {
    for (let j = 0; j < size; j++) {
      const idx = axis === 'x' ? (i * width + j) : (j * width + i);
      const step = axis === 'x' ? 1 : width;
      
      if (size < 2) {
        grad[idx] = 0;
      } else if (edgeOrder === 1 || size < 3) {
        if (j === 0) grad[idx] = (data[idx + step] - data[idx]) / spacing;
        else if (j === size - 1) grad[idx] = (data[idx] - data[idx - step]) / spacing;
        else grad[idx] = (data[idx + step] - data[idx - step]) / (2 * spacing);
      } else {
        if (j === 0) grad[idx] = (-1.5 * data[idx] + 2 * data[idx + step] - 0.5 * data[idx + 2 * step]) / spacing;
        else if (j === size - 1) grad[idx] = (0.5 * data[idx - 2 * step] - 2 * data[idx - step] + 1.5 * data[idx]) / spacing;
        else grad[idx] = (data[idx + step] - data[idx - step]) / (2 * spacing);
      }
    }
  }
  return grad;
};

export const computeGradientMaps = (
  data: Float32Array,
  width: number,
  height: number,
  dx: number,
  dy: number,
): DirectionalMaps => {
  const x = npGradient(data, width, height, dx, 'x');
  const y = npGradient(data, width, height, -dy, 'y'); // Use -dy because rows are in descending Y order
  return { x, y };
};

export const computeCurvatureMaps = (
  data: Float32Array,
  width: number,
  height: number,
  dx: number,
  dy: number,
): DirectionalMaps => {
  const gradX = npGradient(data, width, height, dx, 'x');
  const gradY = npGradient(data, width, height, -dy, 'y');
  
  const curv2_x = npGradient(gradX, width, height, dx, 'x');
  const curv2_y = npGradient(gradY, width, height, -dy, 'y');
  
  const x = new Float32Array(data.length);
  const y = new Float32Array(data.length);
  
  for (let i = 0; i < data.length; i++) {
    x[i] = curv2_x[i] / Math.pow(1.0 + gradX[i] * gradX[i], 1.5);
    y[i] = curv2_y[i] / Math.pow(1.0 + gradY[i] * gradY[i], 1.5);
  }
  
  return { x, y };
};

// Keeping these for backward compatibility during transition if needed, 
// but we will update callers to use the new Maps versions.
export const computeGradientMap = (data: Float32Array, width: number, height: number, dx: number, dy: number): Float32Array => {
  const { x, y } = computeGradientMaps(data, width, height, dx, dy);
  const mag = new Float32Array(data.length);
  for (let i = 0; i < data.length; i++) {
    mag[i] = Math.sqrt(x[i] * x[i] + y[i] * y[i]);
  }
  return mag;
};

export const computeCurvatureMap = (data: Float32Array, width: number, height: number, dx: number, dy: number): Float32Array => {
  const { x, y } = computeCurvatureMaps(data, width, height, dx, dy);
  const mag = new Float32Array(data.length);
  for (let i = 0; i < data.length; i++) {
    mag[i] = (x[i] + y[i]) * 0.5; // Mean curvature approximation
  }
  return mag;
};

const normalizeCoordinateKey = (value: number) => Math.round(value * 1_000_000) / 1_000_000;

const toSortedNumbers = (values: Set<number>, descending = false): number[] =>
  Array.from(values).sort((a, b) => (descending ? b - a : a - b));

export const getGridSpacing = (grid: GridData) => {
  const xs = grid.xs as ArrayLike<number>;
  const ys = grid.ys as ArrayLike<number>;

  return {
    dx: xs.length > 1 ? Math.abs((xs[1] ?? 0) - (xs[0] ?? 0)) || 1 : 1,
    dy: ys.length > 1 ? Math.abs((ys[0] ?? 0) - (ys[1] ?? 0)) || 1 : 1,
  };
};

export const buildDerivedLayerKey = (kind: DerivedLayerKind, direction: Direction): DerivedLayerKey =>
  `${kind}:${direction}`;

export const parseCSV = (text: string): GridData | null => {
  const lines = text.split(/\r?\n/);
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
        const xKey = normalizeCoordinateKey(x);
        const yKey = normalizeCoordinateKey(y);
        points.push({ x: xKey, y: yKey, z });
        uX.add(xKey); uY.add(yKey);
      }
    }
  }

  if (points.length === 0) return null;

  const sX = toSortedNumbers(uX);
  const sY = toSortedNumbers(uY, true);
  const w = sX.length;
  const h = sY.length;
  const grid = new Float32Array(w * h);

  let minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < points.length; i++) {
    if (points[i].z < minZ) minZ = points[i].z;
    if (points[i].z > maxZ) maxZ = points[i].z;
  }

  const xMap = new Map<number, number>();
  const yMap = new Map<number, number>();

  for (let i = 0; i < sX.length; i++) xMap.set(sX[i]!, i);
  for (let i = 0; i < sY.length; i++) yMap.set(sY[i]!, i);

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const gx = xMap.get(p.x);
    const gy = yMap.get(p.y);

    if (gx !== undefined && gy !== undefined) {
      const bufferRow = gy;
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
