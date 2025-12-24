import { ThemeColors } from './types';

export const THEME: ThemeColors = {
  bg: '#f2f2eb',
  panel: '#ffffff',
  border: '#333333',
  text: '#1a1a1a',
  textDim: '#666666',
  primary: '#ff4d00',
  secondary: '#00a3cc',
  grid: '#e0e0d0',
  accent: '#ff0055',
  measure: '#10b981',
};

export const CUSTOM_COOLWARM_HEX = [
  '#b30326', '#d95847', '#f08d6f', '#f6b79c', '#ead3c7',
  '#cdd9ec', '#aac6fd', '#82a5fb', '#5c7be5', '#3a4cc0'
];

export const MAP_OPTIONS = [
  { value: 'coolwarm', label: 'COOLWARM' },
  { value: 'stepped30', label: 'STEPPED 30 (0.02)' },
  { value: 'stepped20', label: 'STEPPED 20 (0.03)' },
  { value: 'stepped15', label: 'STEPPED 15 (0.04)' },
  { value: 'jet', label: 'JET' },
  { value: 'magma', label: 'MAGMA' },
  { value: 'anomaly', label: 'ANOMALY' },
];
