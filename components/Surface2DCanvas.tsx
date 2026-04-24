import React, { useRef, useEffect, useState } from 'react';
import { GridData, SelectionBox, SelectionLine, TransformState, ToolType, ViewMode, Marker, ColorSettings, MeasurementState, ChartToolType, ActiveLayer } from '../types';
import { getColor } from '../utils/colorUtils';
import { pointToLineDistance, projectPointOntoLine } from '../utils/mathUtils';
import { THEME } from '../constants';
import { Info } from 'lucide-react';

interface Surface2DCanvasProps {
  grid: GridData;
  activeLayer: ActiveLayer;
  activeMap: string;
  tool: ToolType;
  boxSel: SelectionBox;
  lineSel: SelectionLine;
  chartAxis: string;
  chartTool: ChartToolType;
  markers: Marker[];
  showMarkers: boolean;
  showHoverInfo: boolean;
  selectedMarkerId: string | null;
  colorSettings: ColorSettings;
  tempMarker: { gridX: number, gridY: number, z: number } | null;
  hoverMarker: { gridX: number, gridY: number, z: number } | null;
  measState: MeasurementState;
  onSetMeasState: (s: MeasurementState | ((prev: MeasurementState) => MeasurementState)) => void;
  onSetBoxSel: (box: SelectionBox) => void;
  onSetLineSel: (line: React.SetStateAction<SelectionLine>) => void;
  onSetTransform: (t: React.SetStateAction<TransformState>) => void;
  onSelectMarker: (id: string | null) => void;
  onUpdateMarkerPos: (id: string, newPos: { gridX: number, gridY: number, realX: number, realY: number, z: number }) => void;
  onAddMarker: (m: Omit<Marker, 'id' | 'label'> & { id?: string, label?: string }) => void;
  onToggleCursor: () => void;
  transform: TransformState;
}

const Surface2DCanvas = ({
  grid, activeLayer, activeMap, tool, boxSel, lineSel, chartAxis, chartTool, markers, showMarkers, showHoverInfo, selectedMarkerId, colorSettings, tempMarker, hoverMarker, measState,
  onSetMeasState, onSetBoxSel, onSetLineSel, onSetTransform, onSelectMarker, onUpdateMarkerPos, onAddMarker, onToggleCursor, transform
}: Surface2DCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cursorInfoRef = useRef<{x: number, y: number} | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number, y: number, ox?: number, oy?: number, mode?: string, markerId?: string, markerOrigX?: number, markerOrigY?: number, screenX?: number, screenY?: number } | null>(null);
  const [pendingLineStart, setPendingLineStart] = useState<{ x: number, y: number } | null>(null);
  const [cursorInfo, setCursorInfo] = useState<{ x: number, y: number, z: number, screenX: number, screenY: number, realX: number, realY: number } | null>(null);

  // Zoom Input State
  const [zoomInput, setZoomInput] = useState<string>('100');
  const [isEditingZoom, setIsEditingZoom] = useState(false);

  // Reset pending line on tool change
  useEffect(() => {
      setPendingLineStart(null);
  }, [tool]);

  // Sync zoom input with transform when not editing
  useEffect(() => {
    if (!isEditingZoom) {
      setZoomInput(Math.round(transform.k * 100).toString());
    }
  }, [transform.k, isEditingZoom]);

  const handleZoomCommit = () => {
    let val = parseFloat(zoomInput);
    if (isNaN(val) || val <= 0) val = 100;
    // Cap at 500x (50000%)
    val = Math.max(1, Math.min(val, 50000));
    onSetTransform(prev => ({ ...prev, k: val / 100 }));
    setIsEditingZoom(false);
  };

  const heatmapCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // 1. Generate Heatmap Cache
  useEffect(() => {
    if (!activeLayer.data) return;
    const sourceData = activeLayer.data;

    if (!heatmapCanvasRef.current) {
        heatmapCanvasRef.current = document.createElement('canvas');
    }
    const hCvs = heatmapCanvasRef.current;
    if (hCvs.width !== grid.w || hCvs.height !== grid.h) {
        hCvs.width = grid.w;
        hCvs.height = grid.h;
    }
    const hCtx = hCvs.getContext('2d');
    if (!hCtx) return;

    const imgData = hCtx.createImageData(grid.w, grid.h);
    const buf = new Uint32Array(imgData.data.buffer);

    const min = colorSettings.mode === 'absolute' ? colorSettings.min : activeLayer.min;
    const max = colorSettings.mode === 'absolute' ? colorSettings.max : activeLayer.max;

    for (let i = 0; i < sourceData.length; i++) {
      const rawVal = sourceData[i];
      const [r, g, b] = getColor(rawVal, activeMap, min, max);
      buf[i] = (255 << 24) | (b << 16) | (g << 8) | r;
    }
    hCtx.putImageData(imgData, 0, 0);
  }, [grid, activeLayer, activeMap, colorSettings]);

  // 2. Render Canvas
  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs || !activeLayer.data) return;
    
    const ctx = cvs.getContext('2d');
    if (!ctx) return;

    const render = () => {
        const cw = cvs.width;
        const ch = cvs.height;
        ctx.clearRect(0, 0, cw, ch);
        ctx.save();
        ctx.translate(transform.x, transform.y);
        ctx.scale(transform.k, transform.k);
        ctx.imageSmoothingEnabled = false;
        
        if (heatmapCanvasRef.current) {
            ctx.drawImage(heatmapCanvasRef.current, 0, 0);
        }

        ctx.lineWidth = 2 / transform.k;

        // 1. Tool Visualization
        if (tool === 'box') {
            ctx.strokeStyle = THEME.primary;
            ctx.strokeRect(boxSel.x, boxSel.y, boxSel.w, boxSel.h);
            ctx.fillStyle = 'rgba(255, 77, 0, 0.2)';
            ctx.fillRect(boxSel.x, boxSel.y, boxSel.w, boxSel.h);

            const cx = boxSel.x + boxSel.w / 2;
            const cy = boxSel.y + boxSel.h / 2;
            ctx.beginPath();
            ctx.strokeStyle = THEME.secondary;
            ctx.lineWidth = 1 / transform.k;
            if (chartAxis === 'horizontal') {
                ctx.moveTo(boxSel.x, cy);
                ctx.lineTo(boxSel.x + boxSel.w, cy);
            } else {
                ctx.moveTo(cx, boxSel.y);
                ctx.lineTo(cx, boxSel.y + boxSel.h);
            }
            ctx.stroke();

        } else if (tool === 'line') {
            ctx.strokeStyle = THEME.secondary;
            ctx.beginPath();
            ctx.moveTo(lineSel.s.x, lineSel.s.y);
            ctx.lineTo(lineSel.e.x, lineSel.e.y);
            ctx.stroke();
            const r = 4 / transform.k;
            ctx.fillStyle = THEME.secondary;
            ctx.beginPath(); ctx.arc(lineSel.s.x, lineSel.s.y, r, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(lineSel.e.x, lineSel.e.y, r, 0, Math.PI * 2); ctx.fill();
        }

        // 2. Ghost Marker (Temp selection from Chart)
        if (tempMarker) {
             ctx.beginPath();
             const size = 15 / transform.k;
             ctx.strokeStyle = THEME.primary;
             ctx.lineWidth = 2 / transform.k;
             ctx.setLineDash([4 / transform.k, 4 / transform.k]);
             
             ctx.moveTo(tempMarker.gridX - size, tempMarker.gridY);
             ctx.lineTo(tempMarker.gridX + size, tempMarker.gridY);
             ctx.moveTo(tempMarker.gridX, tempMarker.gridY - size);
             ctx.lineTo(tempMarker.gridX, tempMarker.gridY + size);
             ctx.stroke();
             ctx.setLineDash([]); // Reset
        }

        // 3. Hover Marker (Preview from Chart)
        if (hoverMarker) {
             const hx = hoverMarker.gridX;
             const hy = hoverMarker.gridY;
             const size = 20 / transform.k;
             const circleSize = 4 / transform.k;
             
             ctx.beginPath();
             ctx.strokeStyle = '#00ff00';
             ctx.lineWidth = 1.5 / transform.k;
             
             // Crosshair
             ctx.moveTo(hx - size, hy);
             ctx.lineTo(hx + size, hy);
             ctx.moveTo(hx, hy - size);
             ctx.lineTo(hx, hy + size);
             ctx.stroke();

             // Center dot/circle
             ctx.beginPath();
             ctx.arc(hx, hy, circleSize, 0, Math.PI * 2);
             ctx.stroke();
        }
        
        // 4. Active Measurement Markers (X)
        const drawX = (x: number, y: number, color: string) => {
            const size = 6 / transform.k;
            ctx.beginPath();
            ctx.strokeStyle = color;
            ctx.lineWidth = 2 / transform.k;
            ctx.moveTo(x - size, y - size);
            ctx.lineTo(x + size, y + size);
            ctx.moveTo(x + size, y - size);
            ctx.lineTo(x - size, y + size);
            ctx.stroke();
        };

        if (measState.p1) drawX(measState.p1.gridX, measState.p1.gridY, THEME.measure);
        if (measState.p2) drawX(measState.p2.gridX, measState.p2.gridY, THEME.measure);
        
        // Multi-group P2L visualization
        measState.p2lGroups.forEach(group => {
            if (!group.visible) return;
            if (group.baseLine) {
                drawX(group.baseLine.p1.gridX, group.baseLine.p1.gridY, group.color);
                if (group.baseLine.p1 !== group.baseLine.p2) {
                    drawX(group.baseLine.p2.gridX, group.baseLine.p2.gridY, group.color);
                    // Draw Baseline
                    ctx.beginPath();
                    ctx.strokeStyle = group.color;
                    ctx.lineWidth = 1 / transform.k;
                    ctx.setLineDash([4 / transform.k, 4 / transform.k]);
                    ctx.moveTo(group.baseLine.p1.gridX, group.baseLine.p1.gridY);
                    ctx.lineTo(group.baseLine.p2.gridX, group.baseLine.p2.gridY);
                    ctx.stroke();
                    ctx.setLineDash([]);
                }
            }
            group.points.forEach(p => {
                drawX(p.gridX, p.gridY, group.color);
            });
        });

        // 5. Permanent Markers
        if (showMarkers) {
            markers.forEach(m => {
                const isSelected = m.id === selectedMarkerId;
                ctx.beginPath();
                const isMeasure = m.type === 'measure';
                ctx.strokeStyle = isSelected ? THEME.primary : (isMeasure ? THEME.measure : THEME.accent);
                ctx.lineWidth = (isSelected ? 4 : 2) / transform.k;
                const size = (isSelected ? 8 : 5) / transform.k;

                ctx.moveTo(m.gridX - size, m.gridY - size);
                ctx.lineTo(m.gridX + size, m.gridY + size);
                ctx.moveTo(m.gridX + size, m.gridY - size);
                ctx.lineTo(m.gridX - size, m.gridY + size);
                ctx.stroke();

                if (isSelected) {
                    ctx.beginPath();
                    ctx.arc(m.gridX, m.gridY, size * 1.5, 0, Math.PI * 2);
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
                    ctx.lineWidth = 1 / transform.k;
                    ctx.stroke();
                }
            });
        }

        ctx.restore();
    };
    render();

  }, [grid, activeLayer, activeMap, transform, boxSel, lineSel, tool, chartAxis, markers, showMarkers, selectedMarkerId, dragStart, colorSettings, tempMarker, hoverMarker, measState]);

  const screenToData = (sx: number, sy: number) => {
    const cvs = canvasRef.current;
    if (!cvs) return { x: 0, y: 0 };
    const rect = cvs.getBoundingClientRect();
    const scaleX = cvs.width / rect.width;
    const scaleY = cvs.height / rect.height;
    const canvasX = (sx - rect.left) * scaleX;
    const canvasY = (sy - rect.top) * scaleY;
    const x = (canvasX - transform.x) / transform.k;
    const y = (canvasY - transform.y) / transform.k;
    return { x, y };
  };

  const checkMarkerHit = (sx: number, sy: number): string | null => {
      if (!showMarkers) return null;
      const threshold = 10;
      const cvs = canvasRef.current;
      if (!cvs) return null;
      const rect = cvs.getBoundingClientRect();
      const scaleX = cvs.width / rect.width;
      const scaleY = cvs.height / rect.height;
      
      for (let i = markers.length - 1; i >= 0; i--) {
          const m = markers[i];
          const cx = m.gridX * transform.k + transform.x;
          const cy = m.gridY * transform.k + transform.y;
          const screenX = cx / scaleX + rect.left;
          const screenY = cy / scaleY + rect.top;
          if (Math.sqrt((sx - screenX) ** 2 + (sy - screenY) ** 2) < threshold) return m.id;
      }
      return null;
  };

  // Fix: Passive event listener issue for Wheel
  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomIntensity = 0.1;
      const rect = cvs.getBoundingClientRect();
      const scaleX = cvs.width / rect.width;
      const scaleY = cvs.height / rect.height;
      const mouseX = (e.clientX - rect.left) * scaleX;
      const mouseY = (e.clientY - rect.top) * scaleY;
      
      onSetTransform(prev => {
          const dataX = (mouseX - prev.x) / prev.k;
          const dataY = (mouseY - prev.y) / prev.k;
          const delta = e.deltaY < 0 ? 1 + zoomIntensity : 1 / (1 + zoomIntensity);
          let newK = prev.k * delta;
          newK = Math.max(0.1, Math.min(newK, 500)); 
          const newX = mouseX - dataX * newK;
          const newY = mouseY - dataY * newK;
          return { k: newK, x: newX, y: newY };
      });
    };

    cvs.addEventListener('wheel', onWheel, { passive: false });
    return () => cvs.removeEventListener('wheel', onWheel);
  }, [onSetTransform]);

  const handleMapClick = (p: {x: number, y: number}) => {
      const realX = grid.xs && grid.xs[Math.round(p.x)] !== undefined ? grid.xs[Math.round(p.x)] : p.x;
      const realY = grid.ys && grid.ys[Math.round(p.y)] !== undefined ? grid.ys[Math.round(p.y)] : p.y;
      const idx = Math.floor(p.y) * grid.w + Math.floor(p.x);
      
      const z = activeLayer.data[idx] || 0;

      let chartX = 0;
      let chartY = z; 

      if (tool === 'line') {
          const p1 = lineSel.s;
          const p1Rx = grid.xs && grid.xs[Math.round(p1.x)] !== undefined ? grid.xs[Math.round(p1.x)] : p1.x;
          const p1Ry = grid.ys && grid.ys[Math.round(p1.y)] !== undefined ? grid.ys[Math.round(p1.y)] : p1.y;

          const proj = projectPointOntoLine(p.x, p.y, lineSel.s.x, lineSel.s.y, lineSel.e.x, lineSel.e.y);
          
          const projRx = grid.xs && grid.xs[Math.round(proj.x)] !== undefined ? grid.xs[Math.round(proj.x)] : proj.x;
          const projRy = grid.ys && grid.ys[Math.round(proj.y)] !== undefined ? grid.ys[Math.round(proj.y)] : proj.y;
          
          chartX = Math.sqrt((projRx - p1Rx)**2 + (projRy - p1Ry)**2);
      } else {
          if (chartAxis === 'vertical') {
              chartX = realY;
          } else {
              chartX = realX;
          }
      }

      const pointObj = {
          x: chartX,
          y: chartY,
          gridX: p.x,
          gridY: p.y,
          realX,
          realY
      };

      onSetMeasState(prev => {
           if (chartTool === 'measure_p2l') {
                let groups = [...prev.p2lGroups];
                let activeId = prev.activeGroupId;
                
                // Colors should match ProfileChart.tsx
                const P2L_COLORS = ['#ff4d4f', '#1890ff', '#52c41a', '#faad14', '#722ed1', '#13c2c2', '#eb2f96', '#fa541c'];

                if (groups.length === 0 || !activeId) {
                    const newId = `group-${Date.now()}`;
                    const newGroup = {
                        id: newId,
                        name: `基准线 ${groups.length + 1}`,
                        color: P2L_COLORS[groups.length % P2L_COLORS.length],
                        visible: true,
                        baseLine: { p1: pointObj, p2: pointObj },
                        points: []
                    };
                    return { ...prev, step: 'p1', p2lGroups: [...groups, newGroup], activeGroupId: newId };
                }

                const groupIdx = groups.findIndex(g => g.id === activeId);
                if (groupIdx === -1) return prev;
                const group = groups[groupIdx];

                if (!group.baseLine) {
                    groups[groupIdx] = { ...group, baseLine: { p1: pointObj, p2: pointObj } };
                    return { ...prev, step: 'p1', p2lGroups: groups };
                } else if (prev.step === 'p1' || group.baseLine.p1 === group.baseLine.p2) {
                    groups[groupIdx] = { ...group, baseLine: { p1: group.baseLine.p1, p2: pointObj } };
                    return { ...prev, step: 'complete', p2lGroups: groups };
                } else {
                    const dist = pointToLineDistance(
                        pointObj.x, pointObj.y, 
                        group.baseLine.p1.x, group.baseLine.p1.y,
                        group.baseLine.p2.x, group.baseLine.p2.y
                    );
                    const newPoint = { id: `pt-${Date.now()}`, ...pointObj, dist };
                    groups[groupIdx] = { ...group, points: [...group.points, newPoint] };
                    return { ...prev, p2lGroups: groups };
                }
           } else if (chartTool === 'measure_z' || chartTool === 'measure_xy') {
                if (prev.step === 'idle') return { ...prev, step: 'p1', p1: pointObj };
                if (prev.step === 'p1') return { ...prev, step: 'complete', p2: pointObj };
                return { step: 'p1', p1: pointObj, p2: null, p2lGroups: [], activeGroupId: null };
           }
           return prev;
      });
  };

  // 'T' Key Listener for Picking
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if ((e.key === 't' || e.key === 'T') && cursorInfoRef.current && chartTool && chartTool !== 'inspect') {
              const p = cursorInfoRef.current;
              // Ensure pick is within grid
              if (p.x >= 0 && p.x < grid.w && p.y >= 0 && p.y < grid.h) {
                  handleMapClick(p);
              }
          }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [grid, tool, lineSel, chartAxis, chartTool, onSetMeasState, activeLayer]);

  const handleMouseDown = (e: React.MouseEvent) => {
    const p = screenToData(e.clientX, e.clientY);

    // Ctrl + Click to Add Marker (Priority over everything)
    if (e.ctrlKey && e.button === 0) {
        if (p.x >= 0 && p.x < grid.w && p.y >= 0 && p.y < grid.h) {
          const idx = Math.floor(p.y) * grid.w + Math.floor(p.x);
          // Use activeLayer data for Z
          const z = activeLayer.data[idx] || 0;

          const realX = grid.xs ? (grid.xs as Float32Array)[Math.max(0, Math.min(grid.w-1, Math.round(p.x)))] : p.x;
          const realY = grid.ys ? (grid.ys as Float32Array)[Math.max(0, Math.min(grid.h-1, Math.round(p.y)))] : p.y;
          
          onAddMarker({
              gridX: p.x,
              gridY: p.y,
              realX,
              realY,
              z,
              type: 'point'
          });
        }
        return;
    }

    if (e.button === 0 && tool !== 'pan' && showMarkers) {
        const hitId = checkMarkerHit(e.clientX, e.clientY);
        if (hitId) {
            onSelectMarker(hitId);
            const m = markers.find(mark => mark.id === hitId);
            setDragStart({ 
                x: e.clientX, y: e.clientY, mode: 'marker', markerId: hitId,
                markerOrigX: m ? m.gridX : p.x, markerOrigY: m ? m.gridY : p.y, ox: p.x, oy: p.y
            });
            return;
        }
    }

    if (e.button === 1 || e.button === 2 || tool === 'pan') {
      setIsPanning(true);
      setDragStart({ x: e.clientX, y: e.clientY, ox: transform.x, oy: transform.y });
      return;
    }
    
    // Line Tool: Click-Click Logic
    if (tool === 'line') {
        if (!pendingLineStart) {
            setPendingLineStart({ x: p.x, y: p.y });
            onSetLineSel({ s: { x: p.x, y: p.y }, e: { x: p.x, y: p.y } });
        } else {
            onSetLineSel({ s: pendingLineStart, e: { x: p.x, y: p.y } });
            setPendingLineStart(null);
        }
        onSelectMarker(null);
        return;
    }

    // Box Tool or others (Drag)
    setDragStart({ x: p.x, y: p.y, mode: tool, screenX: e.clientX, screenY: e.clientY });
    onSelectMarker(null);
    if (tool === 'box') {
      onSetBoxSel({ x: p.x, y: p.y, w: 0, h: 0 });
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
      e.preventDefault();
      // Double click logic moved to Ctrl + Left Click in handleMouseDown
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const p = screenToData(e.clientX, e.clientY);
    cursorInfoRef.current = p;
    
    // Calculate relative coords for tooltip
    const cvs = canvasRef.current;
    let relX = e.clientX; 
    let relY = e.clientY;
    if (cvs) {
        const rect = cvs.getBoundingClientRect();
        relX = e.clientX - rect.left;
        relY = e.clientY - rect.top;
    }
    
    // Get Z value
    let zVal = 0;
    if (p.x >= 0 && p.x < grid.w && p.y >= 0 && p.y < grid.h) {
        const idx = Math.floor(p.y) * grid.w + Math.floor(p.x);
        zVal = activeLayer.data[idx] || 0;
    }
    
    const realX = grid.xs ? (grid.xs as Float32Array)[Math.max(0, Math.min(grid.w-1, Math.round(p.x)))] : p.x;
    const realY = grid.ys ? (grid.ys as Float32Array)[Math.max(0, Math.min(grid.h-1, Math.round(p.y)))] : p.y;
    
    setCursorInfo({ x: p.x, y: p.y, z: zVal, screenX: relX, screenY: relY, realX, realY });

    if (isPanning && dragStart) {
        const dx = e.clientX - dragStart.x;
        const dy = e.clientY - dragStart.y;
        onSetTransform({ ...transform, x: (dragStart.ox || 0) + dx, y: (dragStart.oy || 0) + dy });
        return;
    }

    if (dragStart && dragStart.mode === 'marker' && dragStart.markerId) {
         const dx = p.x - dragStart.ox!;
         const dy = p.y - dragStart.oy!;
         const nx = (dragStart.markerOrigX || 0) + dx;
         const ny = (dragStart.markerOrigY || 0) + dy;
         
         const idx = Math.max(0, Math.min(grid.h-1, Math.round(ny))) * grid.w + Math.max(0, Math.min(grid.w-1, Math.round(nx)));
         const nz = activeLayer.data[idx] || 0;
         
         const newRealX = grid.xs ? (grid.xs as Float32Array)[Math.max(0, Math.min(grid.w-1, Math.round(nx)))] : nx;
         const newRealY = grid.ys ? (grid.ys as Float32Array)[Math.max(0, Math.min(grid.h-1, Math.round(ny)))] : ny;

         onUpdateMarkerPos(dragStart.markerId, { gridX: nx, gridY: ny, realX: newRealX, realY: newRealY, z: nz });
         return;
    }

    if (dragStart && dragStart.mode === tool) {
        if (tool === 'box') {
            const w = p.x - dragStart.x;
            const h = p.y - dragStart.y;
            // Allow negative selection
            const nx = w < 0 ? dragStart.x + w : dragStart.x;
            const ny = h < 0 ? dragStart.y + h : dragStart.y;
            onSetBoxSel({ x: nx, y: ny, w: Math.abs(w), h: Math.abs(h) });
        }
    }
    
    // Preview Line during 2-click selection
    if (tool === 'line' && pendingLineStart) {
        onSetLineSel({ s: pendingLineStart, e: { x: p.x, y: p.y } });
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    setIsPanning(false);
    setDragStart(null);
  };

  return (
    <div className="relative w-full h-full bg-gray-50 overflow-hidden cursor-crosshair group">
       <canvas 
          ref={canvasRef} 
          width={800} 
          height={600} 
          className="block w-full h-full"
          onMouseDown={handleMouseDown}
          onDoubleClick={handleDoubleClick}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onContextMenu={e => e.preventDefault()}
       />
       
       {/* Interactive Zoom & Position Overlay */}
       <div className="absolute bottom-2 left-2 flex items-center gap-2 bg-white border-2 border-black hard-shadow-sm px-2 py-1.5 z-10 text-[10px] font-black uppercase tracking-tighter">
           <div className="flex items-center gap-1">
              <span className="text-gray-400">Zoom</span>
              <input 
                 className="w-10 bg-transparent border-b-2 border-black/10 focus:outline-none focus:border-black text-center font-black"
                 value={zoomInput}
                 onChange={e => setZoomInput(e.target.value)}
                 onFocus={() => setIsEditingZoom(true)}
                 onBlur={handleZoomCommit}
                 onKeyDown={e => e.key === 'Enter' && handleZoomCommit()}
              />
              <span className="text-gray-400">%</span>
           </div>
           
           <div className="w-px h-3 bg-black/10 mx-1"></div>

           <button
             onClick={onToggleCursor}
             className={`p-1 transition-all ${showHoverInfo ? 'bg-black text-white' : 'hover:bg-gray-100 text-gray-400'}`}
             title="光标信息 (Toggle Cursor Info)"
           >
             <Info size={12}/>
           </button>

           <div className="w-px h-3 bg-black/10 mx-1"></div>
           
           <span className="flex items-center gap-1">
             <span className="text-gray-400">XY:</span> 
             {Math.round(cursorInfo?.x || 0)}, {Math.round(cursorInfo?.y || 0)} 
             <span className="text-[9px] text-gray-300 ml-1">[{cursorInfo?.realX.toFixed(1) || 0}, {cursorInfo?.realY.toFixed(1) || 0}]</span>
           </span>
       </div>
       
       {/* Hover Info Tooltip */}
       {showHoverInfo && cursorInfo && (
           <div className="absolute pointer-events-none bg-black text-white p-3 border border-white/10 hard-shadow-md z-20 animate-scale-in" style={{ left: cursorInfo.screenX + 20, top: cursorInfo.screenY + 20 }}>
               <div className="text-[9px] font-black border-b border-white/20 mb-2 pb-1 opacity-40 tracking-widest uppercase">Precision Metrics</div>
               <div className="flex flex-col gap-1">
                   <div className="flex justify-between gap-6">
                       <span className="text-gray-500 font-bold">REAL X</span>
                       <span className="mono font-bold">{cursorInfo.realX.toFixed(3)}</span>
                   </div>
                   <div className="flex justify-between gap-6">
                       <span className="text-gray-500 font-bold">REAL Y</span>
                       <span className="mono font-bold">{cursorInfo.realY.toFixed(3)}</span>
                   </div>
                   <div className="flex justify-between gap-6 pt-1 border-t border-white/10 mt-1">
                       <span className="text-[#ff4d00] font-black uppercase">Z-Height</span>
                       <span className="text-[#ff4d00] font-black mono text-sm">{cursorInfo.z.toFixed(5)}</span>
                   </div>
               </div>
           </div>
       )}
    </div>
  );
};

export default Surface2DCanvas;