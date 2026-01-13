
export interface Point {
  x: number;
  y: number;
  z: number;
}

export interface GridData {
  w: number;
  h: number;
  data: Float32Array;
  minZ: number;
  maxZ: number;
  xs: Float32Array | number[];
  ys: Float32Array | number[];
}

export interface SelectionBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SelectionLine {
  s: { x: number; y: number };
  e: { x: number; y: number };
}

export interface TransformState {
  k: number; // Scale
  x: number; // Translate X
  y: number; // Translate Y
}

export interface Marker {
  id: string;
  label?: string;
  gridX: number;
  gridY: number;
  realX: number;
  realY: number;
  z: number;
  type?: 'measure' | 'point';
  color?: string;
}

export type ViewMode = 'height' | 'gradient' | 'curvature';
export type ToolType = 'box' | 'line' | 'pan';
export type ChartAxis = 'horizontal' | 'vertical';
export type CameraView = 'iso' | 'top' | 'front' | 'side';

// New Chart Tool Types
export type ChartToolType = 'inspect' | 'measure_p2l' | 'measure_z' | 'measure_xy';

export interface ThemeColors {
  bg: string;
  panel: string;
  border: string;
  text: string;
  textDim: string;
  primary: string;
  secondary: string;
  grid: string;
  accent: string;
  measure: string;
}

export interface ColorSettings {
  mode: 'relative' | 'absolute';
  min: number;
  max: number;
}

export interface MeasurementState {
  step: 'idle' | 'p1' | 'complete'; 
  p1: { x: number, y: number, gridX: number, gridY: number } | null;
  p2: { x: number, y: number, gridX: number, gridY: number } | null;
  // For P2L mode (multi-point)
  baseLine: { p1: {x: number, y: number, gridX: number, gridY: number}, p2: {x: number, y: number, gridX: number, gridY: number} } | null;
  points: { x: number, y: number, dist: number, gridX: number, gridY: number }[];
}

export interface ActiveLayer {
  data: Float32Array;
  min: number;
  max: number;
  type: ViewMode;
}

// --- Converter Types ---

export interface ReferencePlane {
  id: string;
  x: number; // Pixel X on original image
  y: number; // Pixel Y on original image
  w: number;
  h: number;
  offsetZ: number; // Compensation value
}

export interface ConverterConfig {
  widthMM: number;
  heightMM: number;
  zScale: number; // Height scale (mm)
  stepX: number; // Sampling step
  stepY: number;
  rotation: 0 | 90 | 180 | -90;
  references: ReferencePlane[];
}

export interface ConversionPreset {
  id: string;
  name: string;
  config: ConverterConfig;
}
