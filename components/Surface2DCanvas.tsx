import React, { useRef, useEffect, useState } from 'react';
import { GridData, SelectionBox, SelectionLine, TransformState, ToolType, ViewMode, Marker, ColorSettings, MeasurementState, ChartToolType } from '../types';
import { getColor } from '../utils/colorUtils';
import { pointToLineDistance, projectPointOntoLine } from '../utils/mathUtils';
import { THEME } from '../constants';
import { Info } from 'lucide-react';

interface Surface2DCanvasProps {
  grid: GridData;
  gradientMap: Float32Array | null;
  activeMap: string;
  viewMode: ViewMode;
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
  grid, gradientMap, activeMap, viewMode, tool, boxSel, lineSel, chartAxis, chartTool, markers, showMarkers, showHoverInfo, selectedMarkerId, colorSettings, tempMarker, hoverMarker, measState,
  onSetMeasState, onSetBoxSel, onSetLineSel, onSetTransform, onSelectMarker, onUpdateMarkerPos, onAddMarker, onToggleCursor, transform
}: Surface2DCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
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

  // Render Canvas
  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs || !grid.data) return;
    
    const ctx = cvs.getContext('2d');
    if (!ctx) return;

    const imgData = ctx.createImageData(grid.w, grid.h);
    const buf = new Uint32Array(imgData.data.buffer);

    const isGradient = viewMode === 'gradient';
    const sourceData = isGradient && gradientMap ? gradientMap : grid.data;
    if (!sourceData) return;

    const min = colorSettings.mode === 'absolute' ? colorSettings.min : (isGradient ? 0 : grid.minZ);
    const max = colorSettings.mode === 'absolute' ? colorSettings.max : (isGradient ? 1 : grid.maxZ);

    for (let i = 0; i < sourceData.length; i++) {
      const rawVal = sourceData[i];
      const [r, g, b] = getColor(rawVal, activeMap, min, max);
      buf[i] = (255 << 24) | (b << 16) | (g << 8) | r;
    }

    const tempCvs = document.createElement('canvas');
    tempCvs.width = grid.w;
    tempCvs.height = grid.h;
    tempCvs.getContext('2d')?.putImageData(imgData, 0, 0);

    const render = () => {
        const cw = cvs.width;
        const ch = cvs.height;
        ctx.clearRect(0, 0, cw, ch);
        ctx.save();
        ctx.translate(transform.x, transform.y);
        ctx.scale(transform.k, transform.k);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(tempCvs, 0, 0);

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
        
        if (measState.baseLine) {
            drawX(measState.baseLine.p1.gridX, measState.baseLine.p1.gridY, THEME.accent);
            if(measState.step !== 'p1') drawX(measState.baseLine.p2.gridX, measState.baseLine.p2.gridY, THEME.accent);
        }
        
        measState.points.forEach(p => {
            drawX(p.gridX, p.gridY, THEME.measure);
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

  }, [grid, gradientMap, activeMap, viewMode, transform, boxSel, lineSel, tool, chartAxis, markers, showMarkers, selectedMarkerId, dragStart, colorSettings, tempMarker, hoverMarker, measState]);

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

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomIntensity = 0.1;
    const cvs = canvasRef.current;
    if (!cvs) return;
    const rect = cvs.getBoundingClientRect();
    const scaleX = cvs.width / rect.width;
    const scaleY = cvs.height / rect.height;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;
    const dataX = (mouseX - transform.x) / transform.k;
    const dataY = (mouseY - transform.y) / transform.k;
    const delta = e.deltaY < 0 ? 1 + zoomIntensity : 1 / (1 + zoomIntensity);
    let newK = transform.k * delta;
    newK = Math.max(0.1, Math.min(newK, 500)); 
    const newX = mouseX - dataX * newK;
    const newY = mouseY - dataY * newK;
    onSetTransform({ k: newK, x: newX, y: newY });
  };

  const handleMapClick = (p: {x: number, y: number}) => {
      const realX = grid.xs && grid.xs[Math.round(p.x)] !== undefined ? grid.xs[Math.round(p.x)] : p.x;
      const realY = grid.ys && grid.ys[Math.round(p.y)] !== undefined ? grid.ys[Math.round(p.y)] : p.y;
      const idx = Math.floor(p.y) * grid.w + Math.floor(p.x);
      const z = grid.data[idx] || 0;

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
                if (prev.step === 'idle') {
                    return { ...prev, step: 'p1', baseLine: { p1: pointObj, p2: pointObj } };
                } else if (prev.step === 'p1') {
                    return { ...prev, step: 'complete', baseLine: { p1: prev.baseLine!.p1, p2: pointObj } }; 
                } else if (prev.step === 'complete') {
                    if (!prev.baseLine) return prev;
                    const dist = pointToLineDistance(
                        pointObj.x, pointObj.y, 
                        prev.baseLine.p1.x, prev.baseLine.p1.y,
                        prev.baseLine.p2.x, prev.baseLine.p2.y
                    );
                    return { ...prev, points: [...prev.points, { ...pointObj, dist }] };
                }
           } else if (chartTool === 'measure_z' || chartTool === 'measure_xy') {
                if (prev.step === 'idle') return { ...prev, step: 'p1', p1: pointObj };
                if (prev.step === 'p1') return { ...prev, step: 'complete', p2: pointObj };
                return { step: 'p1', p1: pointObj, p2: null, baseLine: null, points: [] };
           }
           return prev;
      });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const p = screenToData(e.clientX, e.clientY);

    // Ctrl + Click to Add Marker (Priority over everything)
    if (e.ctrlKey && e.button === 0) {
        if (p.x >= 0 && p.x < grid.w && p.y >= 0 && p.y < grid.h) {
          const idx = Math.floor(p.y) * grid.w + Math.floor(p.x);
          const z = grid.data[idx] || 0;
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
    
    // Measuring Mode: Block Line Start, Allow Box Drag (to restart), Allow Click (to pick)
    if (chartTool && chartTool !== 'inspect') {
        setDragStart({ x: p.x, y: p.y, mode: 'measure_pick', screenX: e.clientX, screenY: e.clientY });
        // Do NOT start line/box selection logic here if we are measuring.
        // BUT if user drags, maybe they want to start new Box?
        // If tool === 'box', we can allow it to override measure if dragged.
        if (tool === 'box') {
             // Let logic flow to Box setDragStart below?
             // No, we already set dragStart.
             // We can set mode to 'box' if we detect drag later?
             // Actually, keep it simple: If measuring, we capture mouse for picking. 
             // If user wants to select Box, they drag. handleMouseMove handles drag.
             // But we need to set the correct mode.
             // Let's set mode to 'tool' (box), but store screen coords for click detection.
        } else {
             // For Line (Click-Click), we BLOCK start.
             return; 
        }
    }

    // Line Tool: Click-Click Logic (Only if NOT measuring)
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
        zVal = grid.data[idx] || 0;
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
         const nz = grid.data[idx] || 0;
         
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
    if (dragStart && chartTool && chartTool !== 'inspect') {
        const screenX = dragStart.screenX || e.clientX;
        const screenY = dragStart.screenY || e.clientY;
        const dx = e.clientX - screenX;
        const dy = e.clientY - screenY;
        // Detect Click (small movement)
        if (Math.sqrt(dx*dx + dy*dy) < 5) {
             const p = screenToData(e.clientX, e.clientY);
             // Ensure click is within grid
             if (p.x >= 0 && p.x < grid.w && p.y >= 0 && p.y < grid.h) {
                 handleMapClick(p);
             }
        }
    }
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
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onDoubleClick={handleDoubleClick}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onContextMenu={e => e.preventDefault()}
       />
       
       {/* Interactive Zoom & Position Overlay */}
       <div className="absolute bottom-2 left-2 flex items-center gap-2 bg-white/90 px-2 py-1 border border-gray-400 shadow-sm z-10 text-[10px] font-bold">
           <div className="flex items-center gap-1">
              <span>ZOOM:</span>
              <input 
                 className="w-10 bg-transparent border-b border-gray-400 focus:outline-none focus:border-black text-center"
                 value={zoomInput}
                 onChange={e => setZoomInput(e.target.value)}
                 onFocus={() => setIsEditingZoom(true)}
                 onBlur={handleZoomCommit}
                 onKeyDown={e => e.key === 'Enter' && handleZoomCommit()}
              />
              <span>%</span>
           </div>
           
           <div className="w-px h-3 bg-gray-400 mx-1"></div>

           <button 
             onClick={onToggleCursor}
             className={`p-0.5 rounded ${showHoverInfo ? 'bg-black text-white' : 'hover:bg-gray-200 text-gray-600'}`}
             title="Toggle Cursor Info"
           >
             <Info size={12}/>
           </button>

           <div className="w-px h-3 bg-gray-400 mx-1"></div>
           
           <span>
             POS: {Math.round(cursorInfo?.x || 0)}, {Math.round(cursorInfo?.y || 0)} 
             <span className="text-gray-400 ml-1">({cursorInfo?.realX.toFixed(1) || 0}, {cursorInfo?.realY.toFixed(1) || 0})</span>
           </span>
       </div>
       
       {/* Hover Info Tooltip */}
       {showHoverInfo && cursorInfo && (
           <div className="absolute pointer-events-none bg-black/80 text-white p-2 rounded text-xs z-20" style={{ left: cursorInfo.screenX + 15, top: cursorInfo.screenY + 15 }}>
               <div className="font-bold border-b border-gray-600 mb-1 pb-1">COORDINATES</div>
               <div>X: {cursorInfo.realX.toFixed(2)}</div>
               <div>Y: {cursorInfo.realY.toFixed(2)}</div>
               <div className="text-[#ff4d00]">Z: {cursorInfo.z.toFixed(4)}</div>
           </div>
       )}
    </div>
  );
};

export default Surface2DCanvas;