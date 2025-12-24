import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ZoomIn, ZoomOut, RotateCcw, X } from 'lucide-react';
import { GridData, SelectionBox, SelectionLine, ToolType, ViewMode, ChartAxis } from '../types';
import { THEME } from '../constants';

interface InteractiveSVGChartProps {
  grid: GridData;
  boxSel: SelectionBox;
  lineSel: SelectionLine;
  tool: ToolType;
  mode: ViewMode;
  gradientMap: Float32Array | null;
  color: string;
  axis: ChartAxis;
  onPointClick: (point: { gridX: number; gridY: number; realX: number; realY: number; z: number; type: 'measure' | 'point' }) => void;
  chartMeasureMode: boolean;
}

const InteractiveSVGChart = ({ grid, boxSel, lineSel, tool, mode, gradientMap, color, axis, onPointClick, chartMeasureMode }: InteractiveSVGChartProps) => {
  const [hoverData, setHoverData] = useState<{ x: number, val: number, index: number, gridX: number, gridY: number, realX: number, realY: number } | null>(null);
  const [measurePts, setMeasurePts] = useState<{ index: number, val: number }[]>([]);
  const [viewWindow, setViewWindow] = useState({ start: 0, end: 1 });
  const [isDraggingChart, setIsDraggingChart] = useState(false);
  const dragStartRef = useRef<{ x: number, viewStart: number, viewEnd: number } | null>(null);
  const svgRef = useRef<HTMLDivElement>(null);

  const PADDING_LEFT = 45;
  const PADDING_BOTTOM = 20;
  const PADDING_TOP = 10;
  const PADDING_RIGHT = 10;
  const VW = 1000;
  const VH = 300;

  useEffect(() => {
    if (!chartMeasureMode) setMeasurePts([]);
  }, [chartMeasureMode]);

  const data = useMemo(() => {
    let pts: { val: number, x: number, y: number }[] = [];
    const source = mode === 'gradient' && gradientMap ? gradientMap : grid.data;
    if (!source) return [];

    if (tool === 'line') {
      const p1 = lineSel.s;
      const p2 = lineSel.e;
      const dist = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
      const steps = Math.min(dist, 500);
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = Math.floor(p1.x + (p2.x - p1.x) * t);
        const y = Math.floor(p1.y + (p2.y - p1.y) * t);
        if (x >= 0 && x < grid.w && y >= 0 && y < grid.h) {
          pts.push({ val: source[y * grid.w + x], x, y });
        }
      }
    } else {
      const cx = Math.floor(boxSel.x + boxSel.w / 2);
      const cy = Math.floor(boxSel.y + boxSel.h / 2);
      if (axis === 'vertical') {
        const sy = Math.floor(boxSel.y);
        const ey = Math.floor(boxSel.y + boxSel.h);
        for (let y = sy; y < ey; y++) {
          if (y >= 0 && y < grid.h && cx >= 0 && cx < grid.w) {
            pts.push({ val: source[y * grid.w + cx], x: cx, y: y });
          }
        }
      } else {
        const sx = Math.floor(boxSel.x);
        const ex = Math.floor(boxSel.x + boxSel.w);
        for (let x = sx; x < ex; x++) {
          if (x >= 0 && x < grid.w && cy >= 0 && cy < grid.h) {
            pts.push({ val: source[cy * grid.w + x], x: x, y: cy });
          }
        }
      }
    }
    return pts;
  }, [grid, boxSel, lineSel, tool, mode, gradientMap, axis]);

  const isHeight = mode === 'height';
  let chartMin = Infinity, chartMax = -Infinity;
  if (isHeight && data.length > 0) {
    for (let p of data) { if (p.val < chartMin) chartMin = p.val; if (p.val > chartMax) chartMax = p.val; }
  } else {
    chartMin = 0; chartMax = 1;
  }
  
  // Add margin
  const yMargin = (chartMax - chartMin) * 0.05 || 0.01;
  chartMin -= yMargin;
  chartMax += yMargin;
  const chartRange = chartMax - chartMin || 1;

  // --- Scaling Functions ---
  const mapX = (idx: number) => {
    const totalPoints = data.length - 1;
    if (totalPoints <= 0) return 0;
    const normIdx = idx / totalPoints;
    const viewWidth = viewWindow.end - viewWindow.start;
    const relPos = (normIdx - viewWindow.start) / viewWidth;
    const drawW = VW - PADDING_LEFT - PADDING_RIGHT;
    return PADDING_LEFT + relPos * drawW;
  };

  const mapY = (val: number) => {
    const normVal = (val - chartMin) / chartRange;
    const drawH = VH - PADDING_TOP - PADDING_BOTTOM;
    return VH - PADDING_BOTTOM - (normVal * drawH);
  };

  const screenToData = (mouseX: number, rectWidth: number) => {
    const svgX = (mouseX / rectWidth) * VW;
    const drawW = VW - PADDING_LEFT - PADDING_RIGHT;
    const relPos = (svgX - PADDING_LEFT) / drawW;
    const viewWidth = viewWindow.end - viewWindow.start;
    const normIdx = relPos * viewWidth + viewWindow.start;
    const idx = Math.round(normIdx * (data.length - 1));
    return Math.max(0, Math.min(data.length - 1, idx));
  };

  // --- Handlers ---
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const zoomSpeed = 0.001;
    const delta = e.deltaY * zoomSpeed;
    setViewWindow(prev => {
      let newStart = prev.start - delta;
      let newEnd = prev.end + delta;
      if (newStart < 0) newStart = 0;
      if (newEnd > 1) newEnd = 1;
      if (newEnd - newStart < 0.05) {
        const mid = (prev.start + prev.end) / 2;
        newStart = mid - 0.025;
        newEnd = mid + 0.025;
      }
      return { start: newStart, end: newEnd };
    });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsDraggingChart(true);
      dragStartRef.current = { x: e.clientX, viewStart: viewWindow.start, viewEnd: viewWindow.end };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    
    if (isDraggingChart && dragStartRef.current) {
      const dxPx = dragStartRef.current.x - e.clientX;
      const dxRel = dxPx / rect.width;
      const viewWidth = viewWindow.end - viewWindow.start;
      const shift = dxRel * viewWidth;
      let newStart = dragStartRef.current.viewStart + shift;
      let newEnd = dragStartRef.current.viewEnd + shift;
      if (newStart < 0) { newStart = 0; newEnd = viewWidth; }
      if (newEnd > 1) { newEnd = 1; newStart = 1 - viewWidth; }
      setViewWindow({ start: newStart, end: newEnd });
      return;
    }

    if (data.length === 0) return;
    const mouseX = e.clientX - rect.left;
    const svgX = (mouseX / rect.width) * VW;
    
    if (svgX < PADDING_LEFT || svgX > VW - PADDING_RIGHT) {
      setHoverData(null);
      return;
    }

    const index = screenToData(mouseX, rect.width);
    const pt = data[index];
    if (pt) {
      const realX = grid.xs ? (grid.xs as Float32Array)[pt.x] : pt.x;
      const realY = grid.ys ? (grid.ys as Float32Array)[grid.h - 1 - pt.y] : (grid.h - 1 - pt.y);
      setHoverData({
        x: mouseX, val: pt.val, index: index, gridX: pt.x, gridY: pt.y, realX: realX, realY: realY
      });
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (isDraggingChart && dragStartRef.current) {
      setIsDraggingChart(false);
      const dist = Math.abs(e.clientX - dragStartRef.current.x);
      if (dist < 5) handleClick();
    }
  };

  const handleMouseLeave = () => {
    setIsDraggingChart(false);
    setHoverData(null);
  };

  const handleClick = () => {
    if (!hoverData) return;
    if (chartMeasureMode) {
      setMeasurePts(prev => {
        if (prev.length >= 3) return [{ index: hoverData.index, val: hoverData.val }];
        return [...prev, { index: hoverData.index, val: hoverData.val }];
      });
    } else if (onPointClick) {
      onPointClick({ 
        gridX: hoverData.gridX, 
        gridY: hoverData.gridY, 
        realX: hoverData.realX, 
        realY: hoverData.realY,
        z: hoverData.val,
        type: 'point'
      });
    }
  };

  const pointsStr = useMemo(() => {
    return data.map((p, i) => `${mapX(i).toFixed(1)},${mapY(p.val).toFixed(1)}`).join(' ');
  }, [data, viewWindow, chartMin, chartRange]);

  const yTicks = useMemo(() => {
    const ticks = [];
    const count = 5;
    for (let i = 0; i <= count; i++) {
      const val = chartMin + (chartRange * i) / count;
      const y = mapY(val);
      ticks.push({ y, val });
    }
    return ticks;
  }, [chartMin, chartRange]);

  // --- Measurement Rendering Logic ---
  let measureLineJsx = null;
  let measureResult = null;
  const measurePointsOverlay: React.ReactNode[] = [];

  const getOverlayStyle = (idx: number, val: number): React.CSSProperties => {
    const sx = mapX(idx);
    const sy = mapY(val);
    return {
      position: 'absolute',
      left: `${(sx / VW) * 100}%`,
      top: `${(sy / VH) * 100}%`,
      transform: 'translate(-50%, -50%)'
    };
  };

  if (chartMeasureMode && measurePts.length >= 2) {
    const p1 = measurePts[0];
    const p2 = measurePts[1];
    const run = p2.index - p1.index;
    const rise = p2.val - p1.val;
    const m = run !== 0 ? rise / run : 0;
    const c = p1.val - m * p1.index;
    const yLeft = m * 0 + c;
    const yRight = m * (data.length - 1) + c;

    measureLineJsx = (
      <line x1={mapX(0)} y1={mapY(yLeft)} x2={mapX(data.length - 1)} y2={mapY(yRight)} stroke={THEME.accent} strokeWidth="2" strokeDasharray="5,5" vectorEffect="non-scaling-stroke" />
    );

    measurePointsOverlay.push(<div key="p1" style={getOverlayStyle(p1.index, p1.val)}><X size={12} color={THEME.accent} /></div>);
    measurePointsOverlay.push(<div key="p2" style={getOverlayStyle(p2.index, p2.val)}><X size={12} color={THEME.accent} /></div>);

    if (measurePts.length === 3) {
      const p3 = measurePts[2];
      const projectedZ = m * p3.index + c;
      const delta = p3.val - projectedZ;
      measureResult = delta;

      measureLineJsx = (
        <>
          {measureLineJsx}
          <line x1={mapX(p3.index)} y1={mapY(p3.val)} x2={mapX(p3.index)} y2={mapY(projectedZ)} stroke={THEME.measure} strokeWidth="2" vectorEffect="non-scaling-stroke" />
        </>
      );
      measurePointsOverlay.push(<div key="p3" style={getOverlayStyle(p3.index, p3.val)}><X size={16} color={THEME.measure} strokeWidth={3} /></div>);
    }
  } else if (chartMeasureMode && measurePts.length === 1) {
    const p1 = measurePts[0];
    measurePointsOverlay.push(<div key="p1" style={getOverlayStyle(p1.index, p1.val)}><X size={12} color={THEME.accent} /></div>);
  }

  if (data.length < 2) return <div className="w-full h-full flex items-center justify-center text-gray-400 font-bold">SELECT REGION/LINE</div>;

  return (
    <div className="w-full h-full relative group select-none" ref={svgRef}>
      <div className="absolute top-2 right-2 flex gap-1 z-10">
        <button onClick={() => setViewWindow(prev => {
          const w = prev.end - prev.start;
          const nw = w * 0.8;
          const mid = (prev.start + prev.end) / 2;
          return { start: Math.max(0, mid - nw / 2), end: Math.min(1, mid + nw / 2) };
        })} className="p-1 bg-white border rounded hover:bg-gray-100 text-gray-600"><ZoomIn size={14} /></button>
        <button onClick={() => setViewWindow(prev => {
          const w = prev.end - prev.start;
          const nw = Math.min(1, w * 1.2);
          const mid = (prev.start + prev.end) / 2;
          return { start: Math.max(0, mid - nw / 2), end: Math.min(1, mid + nw / 2) };
        })} className="p-1 bg-white border rounded hover:bg-gray-100 text-gray-600"><ZoomOut size={14} /></button>
        <button onClick={() => setViewWindow({ start: 0, end: 1 })} className="p-1 bg-white border rounded hover:bg-gray-100 text-gray-600"><RotateCcw size={14} /></button>
      </div>

      <svg className="w-full h-full overflow-visible" viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="none" onWheel={handleWheel} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseLeave}>
        <rect x="0" y="0" width={PADDING_LEFT} height={VH} fill="#fafafa" />
        <line x1={PADDING_LEFT} y1="0" x2={PADDING_LEFT} y2={VH} stroke="#ddd" strokeWidth="1" />
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={PADDING_LEFT - 5} y1={t.y} x2={PADDING_LEFT} y2={t.y} stroke="#999" strokeWidth="1" />
            <line x1={PADDING_LEFT} y1={t.y} x2={VW} y2={t.y} stroke="#eee" strokeWidth="1" />
            <text x={PADDING_LEFT - 8} y={t.y + 3} textAnchor="end" fontSize="10" fill="#666" fontFamily="monospace">{t.val.toFixed(2)}</text>
          </g>
        ))}
        <defs><clipPath id="chartClip"><rect x={PADDING_LEFT} y="0" width={VW - PADDING_LEFT - PADDING_RIGHT} height={VH} /></clipPath></defs>
        <g clipPath="url(#chartClip)">
          <polyline points={pointsStr} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.2" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient>
          <polygon points={`${mapX(0)},${VH} ${pointsStr} ${mapX(data.length - 1)},${VH}`} fill="url(#chartFill)" />
          {measureLineJsx}
          {hoverData && <line x1={mapX(hoverData.index)} y1="0" x2={mapX(hoverData.index)} y2={VH} stroke="#333" strokeWidth="1" strokeDasharray="4" vectorEffect="non-scaling-stroke" />}
        </g>
      </svg>

      <div className="absolute inset-0 pointer-events-none overflow-hidden">{measurePointsOverlay}</div>

      {measureResult !== null && (
        <div className="absolute bottom-2 left-12 bg-white/90 border border-green-500 text-green-700 p-2 rounded font-bold text-xs shadow-sm pointer-events-none z-20">
          ΔZ: {measureResult.toFixed(6)}
        </div>
      )}

      {hoverData && (
        <div className="absolute top-0 pointer-events-none p-2 rounded border shadow-lg" style={{ left: (hoverData.x) + 15, top: 20, backgroundColor: 'rgba(255, 255, 255, 0.9)', backdropFilter: 'blur(4px)', borderColor: THEME.border, color: THEME.text, fontFamily: 'monospace', zIndex: 20, transform: 'translateX(-50%)' }}>
          <div className="text-[10px] text-gray-500 font-bold mb-1">DATA POINT</div>
          <div className="flex flex-col gap-0.5 text-xs">
            <div>VAL: <span className="text-orange-600">{hoverData.val.toFixed(4)}</span></div>
            <div>X,Y: <span className="text-blue-600">{typeof hoverData.realX === 'number' ? hoverData.realX.toFixed(4) : String(hoverData.realX)}, {typeof hoverData.realY === 'number' ? hoverData.realY.toFixed(4) : String(hoverData.realY)}</span></div>
          </div>
          <div className="text-[9px] text-gray-400 mt-1">{chartMeasureMode ? (measurePts.length === 0 ? "CLICK PT 1" : measurePts.length === 1 ? "CLICK PT 2" : "CLICK TARGET") : "CLICK TO MARK"}</div>
        </div>
      )}
    </div>
  );
};

export default InteractiveSVGChart;