import React, { useMemo, useRef, useEffect, useState } from 'react';
import * as echarts from 'echarts';
import { GridData, SelectionBox, SelectionLine, ToolType, ViewMode, ChartAxis, MeasurementState, ChartToolType } from '../types';
import { THEME } from '../constants';
import { pointToLineDistance, projectPointOntoLine } from '../utils/mathUtils';
import { RotateCcw, Plus, MousePointer2, MoveHorizontal, MoveVertical, Slash, Info } from 'lucide-react';

interface ProfileChartProps {
    grid: GridData;
    boxSel: SelectionBox;
    lineSel: SelectionLine;
    tool: ToolType;
    mode: ViewMode;
    gradientMap: Float32Array | null;
    axis: ChartAxis;
    chartTool: ChartToolType;
    onSetChartTool: (t: ChartToolType) => void;
    onChartClick: (point: { gridX: number, gridY: number, z: number }) => void;
    onChartHover: (point: { gridX: number, gridY: number, z: number } | null) => void;
    tempMarker: { gridX: number, gridY: number, z: number } | null;
    onConfirmTempMarker: () => void;
    
    // Controlled Measurement State
    measState: MeasurementState;
    onSetMeasState: (s: MeasurementState | ((prev: MeasurementState) => MeasurementState)) => void;
}

const ProfileChart: React.FC<ProfileChartProps> = ({ 
    grid, boxSel, lineSel, tool, mode, gradientMap, axis, chartTool, onSetChartTool, onChartClick, onChartHover, tempMarker, onConfirmTempMarker,
    measState, onSetMeasState
}) => {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartInstanceRef = useRef<echarts.ECharts | null>(null);
    const [showTip, setShowTip] = useState(false);

    // Reset measurement when data/selection/tool changes
    useEffect(() => {
        onSetMeasState({ step: 'idle', p1: null, p2: null, baseLine: null, points: [] });
        onChartHover(null); // Clear hover on tool change
    }, [grid, boxSel, lineSel, tool, axis, chartTool, onChartHover, onSetMeasState]);

    // 1. Extract Data Profile (Including Grid Coordinates)
    const rawData = useMemo(() => {
        const pts: { x: number, y: number, gridX: number, gridY: number, realX: number, realY: number }[] = []; 
        const source = mode === 'gradient' && gradientMap ? gradientMap : grid.data;
        if (!source) return [];

        const getReal = (gx: number, gy: number) => {
            const rx = grid.xs && grid.xs[gx] !== undefined ? grid.xs[gx] : gx;
            const ry = grid.ys && grid.ys[gy] !== undefined ? grid.ys[gy] : gy;
            return { rx, ry };
        };

        if (tool === 'line') {
            const p1 = lineSel.s;
            const p2 = lineSel.e;
            const distTotal = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
            
            // Get Start Point Physical Coords for distance reference
            const startIx = Math.max(0, Math.min(grid.w - 1, Math.round(p1.x)));
            const startIy = Math.max(0, Math.min(grid.h - 1, Math.round(p1.y)));
            const startReal = getReal(startIx, startIy);

            if (distTotal === 0) {
                 pts.push({ x: 0, y: source[startIy * grid.w + startIx], gridX: startIx, gridY: startIy, realX: startReal.rx, realY: startReal.ry });
            } else {
                const steps = Math.ceil(distTotal); 
                for (let i = 0; i <= steps; i++) {
                    const t = i / steps;
                    const ix = Math.floor(p1.x + (p2.x - p1.x) * t);
                    const iy = Math.floor(p1.y + (p2.y - p1.y) * t);
                    
                    if (ix >= 0 && ix < grid.w && iy >= 0 && iy < grid.h) {
                        const { rx, ry } = getReal(ix, iy);
                        // Physical distance from start
                        const d = Math.sqrt((rx - startReal.rx) ** 2 + (ry - startReal.ry) ** 2);
                        pts.push({ x: d, y: source[iy * grid.w + ix], gridX: ix, gridY: iy, realX: rx, realY: ry });
                    }
                }
            }
        } else {
            // Box Tool
            const cx = Math.floor(boxSel.x + boxSel.w / 2);
            const cy = Math.floor(boxSel.y + boxSel.h / 2);
            
            if (axis === 'vertical') { // Fixed X, Vary Y
                const sy = Math.floor(boxSel.y);
                const ey = Math.floor(boxSel.y + boxSel.h);
                const validSy = Math.max(0, sy);
                const validEy = Math.min(grid.h, ey);
                
                if (cx >= 0 && cx < grid.w) {
                    for (let y = validSy; y < validEy; y++) {
                         const { rx, ry } = getReal(cx, y);
                         pts.push({ x: ry, y: source[y * grid.w + cx], gridX: cx, gridY: y, realX: rx, realY: ry });
                    }
                }
            } else { // Horizontal: Fixed Y, Vary X
                const sx = Math.floor(boxSel.x);
                const ex = Math.floor(boxSel.x + boxSel.w);
                const validSx = Math.max(0, sx);
                const validEx = Math.min(grid.w, ex);
                
                if (cy >= 0 && cy < grid.h) {
                    for (let x = validSx; x < validEx; x++) {
                        const { rx, ry } = getReal(x, cy);
                        pts.push({ x: rx, y: source[cy * grid.w + x], gridX: x, gridY: cy, realX: rx, realY: ry });
                    }
                }
            }
        }
        return pts;
    }, [grid, boxSel, lineSel, tool, mode, gradientMap, axis]);

    // 2. Chart Render Logic
    useEffect(() => {
        if (!chartContainerRef.current) return;
        
        // Init Chart
        if (!chartInstanceRef.current) {
            chartInstanceRef.current = echarts.init(chartContainerRef.current);
            const zr = chartInstanceRef.current.getZr();

            const findClosestPoint = (clickX: number) => {
                 let minDist = Infinity;
                 let closest = null;
                 for(const p of rawData) {
                     const d = Math.abs(p.x - clickX);
                     if (d < minDist) { minDist = d; closest = p; }
                 }
                 return closest;
            };

            // Click Handler
            zr.on('click', (params) => {
                if (!chartInstanceRef.current) return;
                const pointInGrid = chartInstanceRef.current.convertFromPixel({ seriesIndex: 0 }, [params.offsetX, params.offsetY]);
                if (pointInGrid) {
                    const clickX = pointInGrid[0];
                    const snappedPoint = findClosestPoint(clickX);
                    if (!snappedPoint) return;

                    if (chartTool === 'inspect') {
                         onChartClick({ gridX: snappedPoint.gridX, gridY: snappedPoint.gridY, z: snappedPoint.y });
                    } 
                    else if (chartTool === 'measure_p2l') {
                        // Point-to-Line (Multi-point distance)
                        onSetMeasState(prev => {
                            if (prev.step === 'idle') {
                                return { ...prev, step: 'p1', baseLine: { p1: snappedPoint, p2: snappedPoint } };
                            } else if (prev.step === 'p1') {
                                return { ...prev, step: 'complete', baseLine: { p1: prev.baseLine!.p1, p2: snappedPoint } }; 
                            } else if (prev.step === 'complete') {
                                // Add more measure points
                                if (!prev.baseLine) return prev;
                                const dist = pointToLineDistance(
                                    snappedPoint.x, snappedPoint.y, 
                                    prev.baseLine.p1.x, prev.baseLine.p1.y,
                                    prev.baseLine.p2.x, prev.baseLine.p2.y
                                );
                                return { ...prev, points: [...prev.points, { x: snappedPoint.x, y: snappedPoint.y, dist, gridX: snappedPoint.gridX, gridY: snappedPoint.gridY }] };
                            }
                            return prev;
                        });
                    }
                    else if (chartTool === 'measure_z' || chartTool === 'measure_xy') {
                        // Two-Point Measurements
                        onSetMeasState(prev => {
                            if (prev.step === 'idle') return { ...prev, step: 'p1', p1: snappedPoint };
                            if (prev.step === 'p1') return { ...prev, step: 'complete', p2: snappedPoint };
                            // If complete, restart
                            return { step: 'p1', p1: snappedPoint, p2: null, baseLine: null, points: [] };
                        });
                    }
                }
            });

            // Hover Handler (Sync in ALL modes)
            zr.on('mousemove', (params) => {
                if (!chartInstanceRef.current) return;
                
                const pointInGrid = chartInstanceRef.current.convertFromPixel({ seriesIndex: 0 }, [params.offsetX, params.offsetY]);
                if (pointInGrid) {
                    const clickX = pointInGrid[0];
                    const snappedPoint = findClosestPoint(clickX);
                    if (snappedPoint) {
                        onChartHover({ gridX: snappedPoint.gridX, gridY: snappedPoint.gridY, z: snappedPoint.y });
                    }
                } else {
                    onChartHover(null);
                }
            });
            
            // Mouse Leave
            zr.on('globalout', () => {
                onChartHover(null);
            });
        }
        
        const chart = chartInstanceRef.current;
        const seriesData = rawData.map(p => ({
            value: [p.x, p.y],
            realX: p.realX,
            realY: p.realY
        }));
        
        let xMin = Infinity, xMax = -Infinity;
        let yMin = Infinity, yMax = -Infinity;
        
        if (rawData.length === 0) { xMin = 0; xMax = 10; yMin = 0; yMax = 1; }
        else {
            for(const p of rawData) {
                if (p.x < xMin) xMin = p.x;
                if (p.x > xMax) xMax = p.x;
                if (isFinite(p.y)) {
                    if (p.y < yMin) yMin = p.y;
                    if (p.y > yMax) yMax = p.y;
                }
            }
        }
        if (!isFinite(yMin)) yMin = 0;
        if (!isFinite(yMax)) yMax = 1;
        
        const yRange = yMax - yMin;
        const yPad = yRange === 0 ? 0.1 : yRange * 0.1;
        const axisMin = yMin - yPad;
        const axisMax = yMax + yPad;

        const domWidth = chartContainerRef.current.clientWidth;
        const domHeight = chartContainerRef.current.clientHeight;
        const gridLeft = 60, gridRight = 30, gridTop = 20, gridBottom = 30;
        const chartW = domWidth - gridLeft - gridRight;
        const chartH = domHeight - gridTop - gridBottom;
        const xRange = xMax - xMin || 1;
        const axisYRange = axisMax - axisMin || 1;
        const scaleX = chartW / xRange;
        const scaleY = chartH / axisYRange;

        // --- Build Visual Elements ---
        const markPointData: any[] = [];
        const markLineData: any[] = [];

        // 1. Inspect Mode (Temp Marker Ring)
        if (tempMarker && chartTool === 'inspect') {
             const ptIndex = rawData.findIndex(p => p.gridX === tempMarker.gridX && p.gridY === tempMarker.gridY);
             if (ptIndex !== -1) {
                 markPointData.push({
                     coord: [rawData[ptIndex].x, rawData[ptIndex].y],
                     itemStyle: { color: 'transparent', borderColor: THEME.primary, borderWidth: 2 },
                     symbolSize: 15,
                     label: { show: false },
                     effect: { show: true, period: 4, scaleSize: 1.5, brushType: 'stroke' }
                 });
             }
        }

        // 2. Measurement: Point-to-Line (Multi)
        if (chartTool === 'measure_p2l') {
             if (measState.baseLine) {
                 markPointData.push({ coord: [measState.baseLine.p1.x, measState.baseLine.p1.y], itemStyle: { color: THEME.accent }, label: { show: false } });
                 if (measState.step !== 'p1') {
                    markPointData.push({ coord: [measState.baseLine.p2.x, measState.baseLine.p2.y], itemStyle: { color: THEME.accent }, label: { show: false } });
                    // Draw Baseline
                    markLineData.push([{ coord: [measState.baseLine.p1.x, measState.baseLine.p1.y], lineStyle: { color: THEME.accent, type: 'dashed' } }, { coord: [measState.baseLine.p2.x, measState.baseLine.p2.y] }]);
                 }
             }
             // Draw Distance Lines
             measState.points.forEach(pt => {
                  markPointData.push({ coord: [pt.x, pt.y], itemStyle: { color: THEME.measure }, label: { show: false } });
                  if (measState.baseLine) {
                      const { p1, p2 } = measState.baseLine;
                      const vP1 = { x: p1.x * scaleX, y: p1.y * scaleY };
                      const vP2 = { x: p2.x * scaleX, y: p2.y * scaleY };
                      const vPt = { x: pt.x * scaleX, y: pt.y * scaleY };
                      const vProj = projectPointOntoLine(vPt.x, vPt.y, vP1.x, vP1.y, vP2.x, vP2.y);
                      const projData = { x: vProj.x / scaleX, y: vProj.y / scaleY };
                      markLineData.push([
                        { coord: [pt.x, pt.y], lineStyle: { color: THEME.measure }, label: { show: true, position: 'end', formatter: `H: ${pt.dist.toFixed(4)}`, color: '#fff', backgroundColor: THEME.measure, padding: [2,4], borderRadius: 3 } },
                        { coord: [projData.x, projData.y] }
                      ]);
                  }
             });
        }

        // 3. Measurement: Z-Height (2 Points)
        if (chartTool === 'measure_z') {
            if (measState.p1) markPointData.push({ coord: [measState.p1.x, measState.p1.y], itemStyle: { color: THEME.measure }, label: {show:false} });
            if (measState.p2) markPointData.push({ coord: [measState.p2.x, measState.p2.y], itemStyle: { color: THEME.measure }, label: {show:false} });
            
            if (measState.p1 && measState.p2) {
                const p1 = measState.p1;
                const p2 = measState.p2;
                const dz = Math.abs(p2.y - p1.y);
                // Draw Horizontal extenders
                markLineData.push([{ coord: [p1.x, p1.y], lineStyle: { type: 'dotted', color: '#999' } }, { coord: [p2.x, p1.y] }]);
                markLineData.push([{ coord: [p2.x, p2.y], lineStyle: { type: 'dotted', color: '#999' } }, { coord: [p1.x, p2.y] }]);
                // Draw Vertical Dimension Line
                markLineData.push([
                    { coord: [p2.x, p1.y], lineStyle: { color: THEME.measure, width: 2 }, label: { show: true, position: 'middle', formatter: `ΔZ: ${dz.toFixed(4)}`, color: '#fff', backgroundColor: THEME.measure, padding: [2,4], borderRadius: 3 } },
                    { coord: [p2.x, p2.y] }
                ]);
            }
        }

        // 4. Measurement: XY-Distance (2 Points)
        if (chartTool === 'measure_xy') {
            if (measState.p1) markPointData.push({ coord: [measState.p1.x, measState.p1.y], itemStyle: { color: THEME.secondary }, label: {show:false} });
            if (measState.p2) markPointData.push({ coord: [measState.p2.x, measState.p2.y], itemStyle: { color: THEME.secondary }, label: {show:false} });
            
            if (measState.p1 && measState.p2) {
                const p1 = measState.p1;
                const p2 = measState.p2;
                const dxy = Math.abs(p2.x - p1.x); // Physical Distance
                
                // Draw Horizontal Dimension Line
                markLineData.push([
                    { coord: [p1.x, p1.y], lineStyle: { color: THEME.secondary, width: 2 }, label: { show: true, position: 'middle', formatter: `ΔXY: ${dxy.toFixed(2)}`, color: '#fff', backgroundColor: THEME.secondary, padding: [2,4], borderRadius: 3 } },
                    { coord: [p2.x, p1.y] } // Flat line at P1 height
                ]);
                // Connector to P2
                markLineData.push([{ coord: [p2.x, p1.y], lineStyle: { type: 'dotted', color: '#999' } }, { coord: [p2.x, p2.y] }]);
            }
        }

        const option: echarts.EChartsOption = {
            animation: false,
            grid: { top: gridTop, right: gridRight, bottom: gridBottom, left: gridLeft, containLabel: false },
            tooltip: { 
                trigger: 'axis', 
                axisPointer: { type: 'cross' }, 
                formatter: (params: any) => {
                    if (!params[0]) return '';
                    const p = params[0].data;
                    return `坐标: (${p.realX.toFixed(2)}, ${p.realY.toFixed(2)})<br/>图表位置: ${p.value[0].toFixed(2)}<br/>Z高度: ${p.value[1].toFixed(4)}`;
                }
            },
            xAxis: { type: 'value', min: xMin, max: xMax, axisLabel: { formatter: (val: number) => val.toFixed(1) }, splitLine: { show: false } },
            yAxis: { type: 'value', min: axisMin, max: axisMax, axisLabel: { formatter: (val: number) => val.toFixed(2) }, splitLine: { show: true, lineStyle: { color: '#eee' } } },
            series: [{
                name: 'Profile', type: 'line', data: seriesData, showSymbol: false,
                lineStyle: { color: THEME.primary, width: 2 },
                areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: THEME.primary + '33' }, { offset: 1, color: THEME.primary + '00' }]) },
                markPoint: { symbol: 'circle', symbolSize: 10, data: markPointData, animation: false },
                markLine: { symbol: ['none', 'none'], animation: false, data: markLineData, silent: true }
            }]
        };

        chart.setOption(option, { notMerge: true });
        const ro = new ResizeObserver(() => chart.resize());
        ro.observe(chartContainerRef.current);
        return () => { ro.disconnect(); chart.dispose(); chartInstanceRef.current = null; };

    }, [rawData, measState, chartTool, mode, grid, tempMarker, onSetMeasState, onChartHover, onChartClick]);

    return (
        <div className="w-full h-full flex flex-col relative group">
            
            {/* --- Chart Toolbar (Top Bar) --- */}
            <div className="flex items-center gap-1 p-1 bg-gray-50/80 border-b border-gray-100 shrink-0 z-20">
                 <button onClick={() => onSetChartTool('inspect')} className={`p-1.5 rounded transition-colors ${chartTool === 'inspect' ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-200'}`} title="Inspect Point">
                    <MousePointer2 size={14} />
                 </button>
                 <div className="w-px h-4 bg-gray-300 mx-1"></div>
                 <button onClick={() => onSetChartTool('measure_z')} className={`p-1.5 rounded transition-colors ${chartTool === 'measure_z' ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-200'}`} title="Measure Z Height">
                    <MoveVertical size={14} />
                 </button>
                 <button onClick={() => onSetChartTool('measure_xy')} className={`p-1.5 rounded transition-colors ${chartTool === 'measure_xy' ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-200'}`} title="Measure XY Distance">
                    <MoveHorizontal size={14} />
                 </button>
                 <button onClick={() => onSetChartTool('measure_p2l')} className={`p-1.5 rounded transition-colors ${chartTool === 'measure_p2l' ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-200'}`} title="Measure Point to Line Normal">
                    <Slash size={14} />
                 </button>
                 
                 {/* Reset for Measures */}
                 {chartTool !== 'inspect' && measState.step !== 'idle' && (
                     <button 
                        onClick={() => onSetMeasState({ step: 'idle', p1: null, p2: null, baseLine: null, points: [] })}
                        className="ml-2 text-gray-500 hover:text-black hover:rotate-180 transition-transform duration-300" title="Reset Measurement"
                     >
                        <RotateCcw size={14} />
                     </button>
                 )}
                 
                 <div className="flex-1"></div>

                 {/* Instruction Overlay & Help */}
                 {chartTool !== 'inspect' && (
                    <div className="flex items-center gap-2 animate-fade-in mr-2">
                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded border shadow-sm ${
                            measState.step === 'idle' ? 'text-blue-600 border-blue-200 bg-blue-50' : 'text-green-600 border-green-200 bg-green-50'
                        }`}>
                            {measState.step === 'idle' 
                                ? "点击选择起点" 
                                : (chartTool === 'measure_p2l' && measState.step === 'complete' 
                                    ? "点击添加测量点" 
                                    : (chartTool === 'measure_p2l' ? "点击选择基准线终点" : "点击选择终点")
                                )
                            }
                        </span>
                        <div className="relative">
                            <button 
                                onMouseEnter={() => setShowTip(true)} 
                                onMouseLeave={() => setShowTip(false)}
                                className="text-gray-400 hover:text-blue-500"
                            >
                                <Info size={14} />
                            </button>
                            {showTip && (
                                <div className="absolute top-6 right-0 w-48 bg-black/80 text-white text-[10px] p-2 rounded shadow-lg z-50 pointer-events-none">
                                    在2D图上移动鼠标并按 <strong>'T'</strong> 键可精确拾取测量点。
                                </div>
                            )}
                        </div>
                    </div>
                 )}
            </div>
            
            <div className="flex-1 relative w-full overflow-hidden">
                <div ref={chartContainerRef} className="w-full h-full" />
                
                {/* Add Marker Button (Overlay on Chart) */}
                {chartTool === 'inspect' && tempMarker && (
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 pointer-events-auto animate-scale-in">
                        <button 
                            onClick={onConfirmTempMarker}
                            className="flex items-center gap-2 bg-black text-white px-3 py-2 rounded-full shadow-xl hover:scale-105 transition-transform font-bold text-xs active:scale-95"
                        >
                            <Plus size={16} className="text-[#ff4d00]" /> ADD TO MARKER LIST
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ProfileChart;