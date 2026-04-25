
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

export interface DirectionalMaps {
  x: Float32Array;
  y: Float32Array;
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

export interface ColorPreset {
  id: string;
  name: string;
  map: string;
  settings: ColorSettings;
}

export interface P2LGroup {
  id: string;
  name: string;
  color: string;
  visible: boolean;
  baseLine: { 
    p1: { x: number, y: number, gridX: number, gridY: number, realX: number, realY: number }, 
    p2: { x: number, y: number, gridX: number, gridY: number, realX: number, realY: number } 
  } | null;
  points: { id: string, x: number, y: number, dist: number, gridX: number, gridY: number }[];
}

export interface MeasurementState {
  step: 'idle' | 'p1' | 'complete'; 
  p1: { x: number, y: number, gridX: number, gridY: number, realX: number, realY: number } | null;
  p2: { x: number, y: number, gridX: number, gridY: number, realX: number, realY: number } | null;
  // Multi-group P2L
  p2lGroups: P2LGroup[];
  activeGroupId: string | null;
}

export interface MeasurementPreset {
  id: string;
  name: string;
  measState: MeasurementState;
  mode: ChartToolType;
  globalTool?: ToolType;
  chartAxis?: ChartAxis;
  boxSel?: SelectionBox;
  lineSel?: SelectionLine;
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
  pixelSizeX: number; // mm/pixel
  pixelSizeY: number; // mm/pixel
  zScalePerGray: number; // mm per gray level (e.g. 0.01mm for gray=100)
  stepX: number; // Sampling step (px)
  stepY: number;
  rotation: 0 | 90 | 180 | -90;
  references: ReferencePlane[];
}

export interface ConversionPreset {
  id: string;
  name: string;
  config: ConverterConfig;
}
