import React, { useMemo, useRef, useEffect, useState } from 'react';
import * as echarts from 'echarts';
import { GridData, SelectionBox, SelectionLine, ToolType, ChartAxis, MeasurementState, ChartToolType, ActiveLayer, MeasurementPreset } from '../types';
import { THEME } from '../constants';
import { pointToLineDistance, projectPointOntoLine } from '../utils/mathUtils';
import { RotateCcw, Plus, MousePointer2, MoveHorizontal, MoveVertical, Slash, Info, Eye, EyeOff, Trash2, ChevronDown, ChevronRight, Layers, Save, History, Download, Upload, X, Edit2, RefreshCw, Eraser } from 'lucide-react';
import { useLocalStorage } from '../hooks/useLocalStorage';

const P2L_COLORS = [
    '#ff4d4f', // Red
    '#1890ff', // Blue
    '#52c41a', // Green
    '#faad14', // Gold
    '#722ed1', // Purple
    '#13c2c2', // Cyan
    '#eb2f96', // Pink
    '#fa541c', // Orange
];

/**
 * Adapts a saved measurement state to current profile data by snapping points to closest grid coordinates.
 */
const adaptStateToCurrentData = (savedState: MeasurementState, currentData: any[]): MeasurementState => {
    const adaptPoint = (pt: any) => {
        if (!pt) return null;
        let minD = Infinity;
        let bestMatch = null;
        for (const dataPt of currentData) {
            const d = Math.abs(dataPt.gridX - pt.gridX) + Math.abs(dataPt.gridY - pt.gridY);
            if (d < minD) {
                minD = d;
                bestMatch = dataPt;
            }
        }
        if (bestMatch && minD <= 5) {
            return { 
                ...pt, 
                x: bestMatch.x, 
                y: bestMatch.y, 
                gridX: bestMatch.gridX, 
                gridY: bestMatch.gridY, 
                realX: bestMatch.realX, 
                realY: bestMatch.realY 
            };
        }
        return pt;
    };

    const adaptedGroups = savedState.p2lGroups.map(group => {
        const adaptedBaseLine = group.baseLine ? {
            p1: adaptPoint(group.baseLine.p1) || group.baseLine.p1,
            p2: adaptPoint(group.baseLine.p2) || group.baseLine.p2
        } : null;

        const adaptedPoints = group.points.map(pt => {
            const adapted = adaptPoint(pt) || pt;
            if (adaptedBaseLine) {
                adapted.dist = pointToLineDistance(
                    adapted.x, adapted.y,
                    adaptedBaseLine.p1.x, adaptedBaseLine.p1.y,
                    adaptedBaseLine.p2.x, adaptedBaseLine.p2.y
                );
            }
            return adapted;
        });

        return {
            ...group,
            baseLine: adaptedBaseLine,
            points: adaptedPoints
        };
    });

    return {
        ...savedState,
        p1: adaptPoint(savedState.p1),
        p2: adaptPoint(savedState.p2),
        p2lGroups: adaptedGroups
    };
};

interface ProfileChartProps {
    grid: GridData;
    activeLayer: ActiveLayer;
    boxSel: SelectionBox;
    lineSel: SelectionLine;
    tool: ToolType;
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
    grid, activeLayer, boxSel, lineSel, tool, axis, chartTool, onSetChartTool, onChartClick, onChartHover, tempMarker, onConfirmTempMarker,
    measState, onSetMeasState
}) => {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartInstanceRef = useRef<echarts.ECharts | null>(null);
    const [showTip, setShowTip] = useState(false);
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
    const [showP2LPanel, setShowP2LPanel] = useState(false);
    const [hoveredP2LId, setHoveredP2LId] = useState<string | null>(null);

    // Preset State & Handlers
    const [presets, setPresets] = useLocalStorage<MeasurementPreset[]>('profile-presets', []);
    const [showPresetPanel, setShowPresetPanel] = useState(false);
    const [showSaveDialog, setShowSaveDialog] = useState(false);
    const [presetName, setPresetName] = useState('');
    const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
    const skipResetRef = useRef(false);

    const handleOpenSaveDialog = () => {
        setPresetName(`预设 ${new Date().toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-')}`);
        setEditingPresetId(null);
        setShowSaveDialog(true);
    };

    const handleOpenEditDialog = (preset: MeasurementPreset, e: React.MouseEvent) => {
        e.stopPropagation();
        setPresetName(preset.name);
        setEditingPresetId(preset.id);
        setShowSaveDialog(true);
    };

    const handleSavePreset = () => {
        if (!presetName.trim()) return;

        if (editingPresetId) {
            // Update existing preset
            setPresets(prev => prev.map(p => {
                if (p.id === editingPresetId) {
                    return {
                        ...p,
                        name: presetName.trim(),
                        measState: JSON.parse(JSON.stringify(measState)),
                        mode: chartTool
                    };
                }
                return p;
            }));
        } else {
            // Create new preset
            const newPreset: MeasurementPreset = {
                id: `preset-${Date.now()}`,
                name: presetName.trim(),
                measState: JSON.parse(JSON.stringify(measState)), // Deep copy
                mode: chartTool
            };
            setPresets(prev => [...prev, newPreset]);
        }

        setShowSaveDialog(false);
        setPresetName('');
        setEditingPresetId(null);
    };

    const handleLoadPreset = (preset: MeasurementPreset) => {
        const adaptedState = adaptStateToCurrentData(preset.measState, rawData);
        
        // Use skipResetRef to prevent the useEffect from clearing the loaded state
        skipResetRef.current = true;
        
        // 1. Switch tool mode
        onSetChartTool(preset.mode);
        
        // 2. Load the adapted state
        onSetMeasState(adaptedState);
        setShowPresetPanel(false);
    };

    const handleDeletePreset = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setPresets(prev => prev.filter(p => p.id !== id));
    };

    const handleExportPresets = () => {
        if (presets.length === 0) return alert('没有可导出的预设');
        const blob = new Blob([JSON.stringify(presets, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `surface-presets-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleImportPresets = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const imported = JSON.parse(evt.target?.result as string);
                if (Array.isArray(imported)) {
                    setPresets(prev => [...prev, ...imported]);
                }
            } catch (err) {
                alert('导入失败：文件格式不正确');
            }
        };
        reader.readAsText(file);
    };

    // Reset measurement when data/selection/tool changes
    useEffect(() => {
        if (skipResetRef.current) {
            skipResetRef.current = false;
            return;
        }
        onSetMeasState({ step: 'idle', p1: null, p2: null, p2lGroups: [], activeGroupId: null });
        onChartHover(null); // Clear hover on tool change
    }, [grid, boxSel, lineSel, tool, axis, chartTool, onChartHover, onSetMeasState]);

    // 1. Extract Data Profile (Including Grid Coordinates)
    const rawData = useMemo(() => {
        const pts: { x: number, y: number, gridX: number, gridY: number, realX: number, realY: number }[] = []; 
        const source = activeLayer.data;
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
    }, [grid, boxSel, lineSel, tool, activeLayer, axis]);

    // Use Refs to avoid stale closures in ECharts event listeners
    const measStateRef = useRef(measState);
    const chartToolRef = useRef(chartTool);
    useEffect(() => { measStateRef.current = measState; }, [measState]);
    useEffect(() => { chartToolRef.current = chartTool; }, [chartTool]);

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

                    const currentTool = chartToolRef.current;

                    if (currentTool === 'inspect') {
                         onChartClick({ gridX: snappedPoint.gridX, gridY: snappedPoint.gridY, z: snappedPoint.y });
                    } 
                    else if (currentTool === 'measure_p2l') {
                        // Point-to-Line (Multi-group distance)
                        onSetMeasState(prev => {
                            let groups = [...prev.p2lGroups];
                            let activeId = prev.activeGroupId;
                            
                            // 1. If no active group or current active is not suitable, create one and set P1 immediately
                            let groupIdx = activeId ? groups.findIndex(g => g.id === activeId) : -1;
                            
                            if (groupIdx === -1) {
                                const newId = `group-${Date.now()}`;
                                const newGroup = {
                                    id: newId,
                                    name: `基准线 ${groups.length + 1}`,
                                    color: P2L_COLORS[groups.length % P2L_COLORS.length],
                                    visible: true,
                                    baseLine: { p1: snappedPoint, p2: snappedPoint }, // Set P1 immediately
                                    points: []
                                };
                                return { 
                                    ...prev, 
                                    step: 'p1', 
                                    p2lGroups: [...groups, newGroup],
                                    activeGroupId: newId
                                };
                            }

                            const group = groups[groupIdx];

                            // 2. Handle baseline drawing or point measurement
                            if (!group.baseLine) {
                                // Case: Group exists but baseline not started (e.g. after "New Baseline" click)
                                const updatedGroup = { ...group, baseLine: { p1: snappedPoint, p2: snappedPoint } };
                                groups[groupIdx] = updatedGroup;
                                return { ...prev, step: 'p1', p2lGroups: groups };
                            } else if (group.baseLine.p1.x === group.baseLine.p2.x && group.baseLine.p1.y === group.baseLine.p2.y) {
                                // Case: Baseline has P1, now setting P2
                                const updatedGroup = { ...group, baseLine: { p1: group.baseLine.p1, p2: snappedPoint } };
                                groups[groupIdx] = updatedGroup;
                                return { ...prev, step: 'complete', p2lGroups: groups };
                            } else {
                                // Case: Baseline is complete, add measure points
                                const dist = pointToLineDistance(
                                    snappedPoint.x, snappedPoint.y, 
                                    group.baseLine.p1.x, group.baseLine.p1.y,
                                    group.baseLine.p2.x, group.baseLine.p2.y
                                );
                                const newPoint = { 
                                    id: `pt-${Date.now()}`,
                                    x: snappedPoint.x, 
                                    y: snappedPoint.y, 
                                    dist, 
                                    gridX: snappedPoint.gridX, 
                                    gridY: snappedPoint.gridY 
                                };
                                const updatedGroup = { ...group, points: [...group.points, newPoint] };
                                groups[groupIdx] = updatedGroup;
                                return { ...prev, p2lGroups: groups };
                            }
                        });
                    }
                    else if (currentTool === 'measure_z' || currentTool === 'measure_xy') {
                        // Two-Point Measurements
                        onSetMeasState(prev => {
                            if (prev.step === 'idle') return { ...prev, step: 'p1', p1: snappedPoint };
                            if (prev.step === 'p1') return { ...prev, step: 'complete', p2: snappedPoint };
                            // If complete, restart
                            return { step: 'p1', p1: snappedPoint, p2: null, p2lGroups: [], activeGroupId: null };
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
                    const clickY = pointInGrid[1];
                    const snappedPoint = findClosestPoint(clickX);
                    if (snappedPoint) {
                        onChartHover({ gridX: snappedPoint.gridX, gridY: snappedPoint.gridY, z: snappedPoint.y });
                    }

                    // P2L Hover Detection (High Precision Pixel-based)
                    const currentTool = chartToolRef.current;
                    const currentMeasState = measStateRef.current;

                    if (currentTool === 'measure_p2l') {
                        let nearestId: string | null = null;
                        let minPixelDist = Infinity;
                        const pixelThreshold = 15; // Hit area in pixels

                        for (const group of currentMeasState.p2lGroups) {
                            if (!group.visible) continue;
                            for (const pt of group.points) {
                                // Convert data point to screen pixels
                                const ptPixel = chartInstanceRef.current.convertToPixel({ seriesIndex: 0 }, [pt.x, pt.y]);
                                if (!ptPixel) continue;

                                const dx = params.offsetX - ptPixel[0];
                                const dy = params.offsetY - ptPixel[1];
                                const dist = Math.sqrt(dx * dx + dy * dy);

                                if (dist < pixelThreshold && dist < minPixelDist) {
                                    minPixelDist = dist;
                                    nearestId = pt.id;
                                }
                            }
                        }
                        setHoveredP2LId(nearestId);
                    } else {
                        setHoveredP2LId(null);
                    }
                } else {
                    onChartHover(null);
                    setHoveredP2LId(null);
                }
            });
            
            // Mouse Leave
            zr.on('globalout', () => {
                onChartHover(null);
                setHoveredP2LId(null);
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

        // 2. Measurement: Point-to-Line (Multi-Group)
        if (chartTool === 'measure_p2l') {
             const activeP2LItems: any[] = [];
             const hoveredP2LItems: any[] = [];

             measState.p2lGroups.forEach(group => {
                 if (!group.visible) return;

                 if (group.baseLine) {
                     markPointData.push({ coord: [group.baseLine.p1.x, group.baseLine.p1.y], itemStyle: { color: group.color }, label: { show: false } });
                     if (group.baseLine.p1 !== group.baseLine.p2) {
                        markPointData.push({ coord: [group.baseLine.p2.x, group.baseLine.p2.y], itemStyle: { color: group.color }, label: { show: false } });
                        // Draw Baseline
                        markLineData.push([{ 
                            coord: [group.baseLine.p1.x, group.baseLine.p1.y], 
                            lineStyle: { color: group.color, type: 'dashed', width: group.id === measState.activeGroupId ? 2 : 1, opacity: 0.8 } 
                        }, { 
                            coord: [group.baseLine.p2.x, group.baseLine.p2.y] 
                        }]);
                     }
                 }

                 // Draw Distance Lines for this group
                 group.points.forEach(pt => {
                      const isHovered = pt.id === hoveredP2LId;
                      markPointData.push({ 
                          coord: [pt.x, pt.y], 
                          itemStyle: { 
                              color: group.color, 
                              borderColor: isHovered ? '#fff' : 'transparent',
                              borderWidth: isHovered ? 2 : 0,
                              shadowBlur: isHovered ? 10 : 0,
                              shadowColor: group.color
                          }, 
                          label: { show: false },
                          symbolSize: isHovered ? 12 : 10,
                          z: isHovered ? 100 : 10
                      });
                      
                      if (group.baseLine && group.baseLine.p1 !== group.baseLine.p2) {
                          const { p1, p2 } = group.baseLine;
                          const vP1 = { x: p1.x * scaleX, y: p1.y * scaleY };
                          const vP2 = { x: p2.x * scaleX, y: p2.y * scaleY };
                          const vPt = { x: pt.x * scaleX, y: pt.y * scaleY };
                          const vProj = projectPointOntoLine(vPt.x, vPt.y, vP1.x, vP1.y, vP2.x, vP2.y);
                          const projData = { x: vProj.x / scaleX, y: vProj.y / scaleY };
                          
                          const item = [
                            { 
                                coord: [pt.x, pt.y], 
                                lineStyle: { 
                                    color: group.color, 
                                    opacity: isHovered ? 1 : 0.9, 
                                    width: isHovered ? 2.5 : 1.5,
                                    shadowBlur: isHovered ? 5 : 0,
                                    shadowColor: group.color
                                }, 
                                label: { 
                                    show: true, 
                                    position: 'end', 
                                    formatter: `${pt.dist.toFixed(4)}`, 
                                    color: '#fff', 
                                    backgroundColor: isHovered ? '#000' : group.color, // Hovered one gets black background for max contrast
                                    borderColor: isHovered ? group.color : 'transparent',
                                    borderWidth: isHovered ? 1 : 0,
                                    padding: isHovered ? [4, 8] : [3, 6], 
                                    borderRadius: 4,
                                    fontSize: isHovered ? 13 : 11,
                                    fontWeight: 'bold',
                                    distance: isHovered ? 15 : 10,
                                    shadowBlur: isHovered ? 10 : 4,
                                    shadowColor: isHovered ? group.color : 'rgba(0,0,0,0.3)',
                                    z: isHovered ? 1000 : 100
                                } 
                            },
                            { coord: [projData.x, projData.y] }
                          ];

                          if (isHovered) hoveredP2LItems.push(item);
                          else activeP2LItems.push(item);
                      }
                 });
             });
             // Push normal items first, then hovered items so they draw on top
             markLineData.push(...activeP2LItems);
             markLineData.push(...hoveredP2LItems);
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
        ro.observe(chartContainerRef.current!);
        return () => { ro.disconnect(); chart.dispose(); chartInstanceRef.current = null; };

    }, [rawData, measState, chartTool, grid, tempMarker, onSetMeasState, onChartHover, onChartClick, hoveredP2LId]);

    // Auto-show panel when tool is selected for the first time
    useEffect(() => {
        if (chartTool === 'measure_p2l' && measState.p2lGroups.length > 0) {
            setShowP2LPanel(true);
        }
    }, [chartTool]);

    const toggleGroupExpand = (id: string) => {
        setExpandedGroups(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const handleCreateNewP2L = () => {
        onSetMeasState(prev => {
            const newId = `group-${Date.now()}`;
            const newGroup = {
                id: newId,
                name: `基准线 ${prev.p2lGroups.length + 1}`,
                color: P2L_COLORS[prev.p2lGroups.length % P2L_COLORS.length],
                visible: true,
                baseLine: null,
                points: []
            };
            return {
                ...prev,
                step: 'p1',
                p2lGroups: [...prev.p2lGroups, newGroup],
                activeGroupId: newId
            };
        });
    };

    const handleDeleteP2LGroup = (id: string) => {
        onSetMeasState(prev => {
            const groups = prev.p2lGroups.filter(g => g.id !== id);
            return {
                ...prev,
                p2lGroups: groups,
                activeGroupId: prev.activeGroupId === id ? (groups.length > 0 ? groups[groups.length - 1].id : null) : prev.activeGroupId
            };
        });
    };

    const toggleP2LGroupVisibility = (id: string) => {
        onSetMeasState(prev => ({
            ...prev,
            p2lGroups: prev.p2lGroups.map(g => g.id === id ? { ...g, visible: !g.visible } : g)
        }));
    };

    const handleDeleteP2LPoint = (groupId: string, pointId: string) => {
        onSetMeasState(prev => ({
            ...prev,
            p2lGroups: prev.p2lGroups.map(g => g.id === groupId ? { ...g, points: g.points.filter(p => p.id !== pointId) } : g)
        }));
    };

    return (
        <div className="w-full h-full flex flex-col relative group">
            
            {/* P2L Multi-Group Panel */}
            {chartTool === 'measure_p2l' && showP2LPanel && (
                <div className="absolute right-2 top-12 bottom-2 w-56 bg-white/70 backdrop-blur-md border border-white/50 rounded shadow-2xl z-40 flex flex-col overflow-hidden animate-slide-in-right">
                    <div className="p-2 border-b border-black/5 flex items-center justify-between bg-black/5">
                        <span className="text-[10px] font-bold text-gray-700 uppercase tracking-wider">P2L 测量组</span>
                        <div className="flex items-center gap-1">
                            <button 
                                onClick={handleCreateNewP2L}
                                className="p-1 text-blue-600 hover:bg-white/50 rounded transition-colors"
                                title="新建基准线"
                            >
                                <Plus size={14} />
                            </button>
                            <button 
                                onClick={() => setShowP2LPanel(false)}
                                className="p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 rounded transition-colors"
                            >
                                <Plus size={14} className="rotate-45" />
                            </button>
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-1 custom-scrollbar">
                        {measState.p2lGroups.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-gray-400 p-4 text-center">
                                <Slash size={24} className="mb-2 opacity-20" />
                                <p className="text-[10px]">点击图表开始绘制<br/>第一条基准线</p>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-1">
                                {measState.p2lGroups.map(group => (
                                    <div 
                                        key={group.id} 
                                        className={`rounded border transition-all ${
                                            measState.activeGroupId === group.id 
                                                ? 'border-blue-400 ring-1 ring-blue-100 bg-white' 
                                                : 'border-gray-100 bg-gray-50/30'
                                        }`}
                                    >
                                        <div className="flex items-center p-1.5 gap-2">
                                            <button 
                                                onClick={() => onSetMeasState(prev => ({ ...prev, activeGroupId: group.id }))}
                                                className="flex-1 flex items-center gap-2 text-left"
                                            >
                                                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: group.color }}></div>
                                                <span className={`text-[11px] truncate ${measState.activeGroupId === group.id ? 'font-bold text-black' : 'text-gray-600'}`}>
                                                    {group.name}
                                                </span>
                                            </button>
                                            
                                            <button 
                                                onClick={() => toggleP2LGroupVisibility(group.id)}
                                                className={`p-1 rounded hover:bg-gray-100 ${group.visible ? 'text-blue-500' : 'text-gray-300'}`}
                                            >
                                                {group.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                                            </button>
                                            
                                            <button 
                                                onClick={() => handleDeleteP2LGroup(group.id)}
                                                className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-500"
                                            >
                                                <Trash2 size={12} />
                                            </button>

                                            <button 
                                                onClick={() => toggleGroupExpand(group.id)}
                                                className="p-1 rounded hover:bg-gray-100 text-gray-400"
                                            >
                                                {expandedGroups[group.id] ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                            </button>
                                        </div>

                                        {expandedGroups[group.id] && (
                                            <div className="px-1.5 pb-1.5 pt-0 border-t border-gray-50">
                                                <div className="text-[9px] text-gray-400 mb-1 flex justify-between">
                                                    <span>点列表 ({group.points.length})</span>
                                                    <span>距离(um)</span>
                                                </div>
                                                {group.points.length === 0 ? (
                                                    <div className="text-[9px] text-gray-300 italic py-1 text-center">无测量点</div>
                                                ) : (
                                                    <div className="flex flex-col gap-0.5">
                                                        {group.points.map(pt => (
                                                            <div key={pt.id} className="flex items-center justify-between text-[10px] group/item py-0.5 px-1 hover:bg-gray-100 rounded">
                                                                <span className="text-gray-500">#{pt.id.slice(-3)}</span>
                                                                <div className="flex items-center gap-2">
                                                                    <span className="font-mono font-medium">{pt.dist.toFixed(4)}</span>
                                                                    <button 
                                                                        onClick={() => handleDeleteP2LPoint(group.id, pt.id)}
                                                                        className="opacity-0 group-hover/item:opacity-100 text-gray-400 hover:text-red-500"
                                                                    >
                                                                        <Trash2 size={10} />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
            {/* --- Chart Toolbar (Top Bar) --- */}
            <div className="flex items-center gap-1 p-1 bg-gray-50/80 border-b border-gray-100 shrink-0 z-20">
                 <button onClick={() => onSetChartTool('inspect')} className={`p-1.5 rounded transition-colors ${chartTool === 'inspect' ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-200'}`} title="点位检视 (Inspect Point)">
                    <MousePointer2 size={14} />
                 </button>
                 <div className="w-px h-4 bg-gray-300 mx-1"></div>
                 <button onClick={() => onSetChartTool('measure_z')} className={`p-1.5 rounded transition-colors ${chartTool === 'measure_z' ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-200'}`} title="测量Z轴高度 (Measure Z Height)">
                    <MoveVertical size={14} />
                 </button>
                 <button onClick={() => onSetChartTool('measure_xy')} className={`p-1.5 rounded transition-colors ${chartTool === 'measure_xy' ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-200'}`} title="测量XY轴距离 (Measure XY Distance)">
                    <MoveHorizontal size={14} />
                 </button>
                 <button onClick={() => onSetChartTool('measure_p2l')} className={`p-1.5 rounded transition-colors ${chartTool === 'measure_p2l' ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-200'}`} title="点到线测量 (Measure Point to Line)">
                    <Slash size={14} />
                 </button>
                 
                 {/* Reset Actions */}
                 {chartTool === 'measure_p2l' && measState.activeGroupId && (
                      <button 
                        onClick={() => {
                            onSetMeasState(prev => ({
                                ...prev,
                                step: 'idle',
                                p2lGroups: prev.p2lGroups.map(g => 
                                    g.id === prev.activeGroupId ? { ...g, baseLine: null, points: [] } : g
                                )
                            }));
                        }}
                        className="ml-1 text-orange-500 hover:text-orange-700 hover:rotate-180 transition-transform duration-300" title="清空当前测量组 (Reset Current Group)"
                      >
                         <Eraser size={14} />
                      </button>
                 )}

                 {(chartTool !== 'inspect' && (measState.step !== 'idle' || measState.p1 || measState.p2 || (chartTool === 'measure_p2l' && measState.p2lGroups.length > 0))) && (
                     <button 
                        onClick={() => onSetMeasState({ step: 'idle', p1: null, p2: null, p2lGroups: [], activeGroupId: null })}
                        className="ml-1 text-gray-400 hover:text-red-500 hover:rotate-180 transition-transform duration-300" title="清空所有测量 (Reset ALL)"
                     >
                        <RefreshCw size={14} />
                     </button>
                 )}

                 {chartTool === 'measure_p2l' && (
                     <button 
                        onClick={() => setShowP2LPanel(!showP2LPanel)} 
                        className={`p-1.5 rounded transition-colors ${showP2LPanel ? 'bg-blue-100 text-blue-600' : 'text-gray-400 hover:bg-gray-200'}`}
                        title="测量面板 (Toggle Measurement Panel)"
                     >
                        <Layers size={14} />
                     </button>
                 )}

                 <div className="w-px h-4 bg-gray-300 mx-1"></div>
                 {/* Preset Actions */}
                 <div className="relative">
                    <button 
                        onClick={handleOpenSaveDialog}
                        className={`p-1.5 rounded transition-colors ${showSaveDialog ? 'bg-orange-100 text-orange-600' : 'text-gray-600 hover:bg-gray-200'}`}
                        title="保存测量预设 (Save Preset)"
                    >
                        <Save size={14} />
                    </button>

                    {/* Custom Save Dialog (Attached to Button) */}
                    {showSaveDialog && (
                        <div className="absolute left-0 top-full mt-1 w-72 bg-white border border-gray-200 rounded-lg shadow-2xl z-[60] animate-slide-down flex flex-col overflow-hidden">
                            <div className="bg-black text-white px-2.5 py-1.5 flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                    <Save size={12} className="text-orange-500" />
                                    <span className="text-[10px] font-bold uppercase tracking-wider">
                                        {editingPresetId ? '编辑测量预设' : '保存测量预设'}
                                    </span>
                                </div>
                                <button onClick={() => setShowSaveDialog(false)} className="text-gray-400 hover:text-white">
                                    <X size={12} />
                                </button>
                            </div>
                            <div className="p-3 flex flex-col gap-2.5">
                                <div className="flex flex-col gap-1">
                                    <label className="text-[9px] text-gray-400 uppercase font-bold">预设名称</label>
                                    <input 
                                        autoFocus
                                        type="text" 
                                        value={presetName}
                                        onChange={(e) => setPresetName(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleSavePreset()}
                                        placeholder="输入预设名称..."
                                        className="w-full bg-gray-50 border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-200 transition-all"
                                    />
                                </div>
                                <div className="flex items-center justify-end gap-2 pt-1.5 border-t border-gray-100">
                                    <button 
                                        onClick={() => setShowSaveDialog(false)}
                                        className="px-2 py-1 text-[9px] font-bold text-gray-400 hover:text-gray-600 uppercase tracking-tighter"
                                    >
                                        取消
                                    </button>
                                    <button 
                                        onClick={handleSavePreset}
                                        disabled={!presetName.trim()}
                                        className="px-3 py-1.5 bg-orange-500 text-white text-[9px] font-bold rounded shadow-md hover:bg-orange-600 disabled:opacity-50 disabled:grayscale uppercase tracking-wider active:scale-95 transition-all"
                                    >
                                        {editingPresetId ? '确认更新' : '确认保存'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                 </div>

                 <button 
                    onClick={() => setShowPresetPanel(!showPresetPanel)}

                    className={`p-1.5 rounded transition-colors ${showPresetPanel ? 'bg-orange-100 text-orange-600' : 'text-gray-600 hover:bg-gray-200'}`}
                    title="预设历史记录 (Preset History)"
                 >
                    <History size={14} />
                 </button>
                 
                 <div className="flex-1"></div>

                 {/* Instruction Overlay & Help */}
                 {chartTool !== 'inspect' && (
                    <div className="flex items-center gap-2 animate-fade-in mr-2">
                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded border shadow-sm ${
                            measState.step === 'idle' ? 'text-blue-600 border-blue-200 bg-blue-50' : 'text-green-600 border-green-200 bg-green-50'
                        }`}>
                            {measState.step === 'idle' 
                                ? "点击选择起点" 
                                : (chartTool === 'measure_p2l' 
                                    ? (measState.p2lGroups.find(g => g.id === measState.activeGroupId)?.baseLine?.p1 === measState.p2lGroups.find(g => g.id === measState.activeGroupId)?.baseLine?.p2
                                        ? "点击选择基准线终点"
                                        : "点击添加测量点")
                                    : "点击选择终点")
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
                {/* Preset Panel overlay */}
                {showPresetPanel && (
                    <div className="absolute left-2 top-2 bottom-2 w-64 bg-white/90 backdrop-blur-md border border-white/50 rounded-lg shadow-2xl z-50 flex flex-col overflow-hidden animate-slide-in-left">
                        <div className="p-3 border-b border-black/5 flex items-center justify-between bg-orange-50/50">
                            <div className="flex items-center gap-2">
                                <History size={16} className="text-orange-500" />
                                <span className="text-xs font-bold text-gray-700">测量点位预设</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <label className="p-1 text-gray-400 hover:bg-white rounded cursor-pointer" title="导入预设 (JSON)">
                                    <Upload size={14} />
                                    <input type="file" accept=".json" onChange={handleImportPresets} className="hidden" />
                                </label>
                                <button onClick={handleExportPresets} className="p-1 text-gray-400 hover:bg-white rounded" title="导出预设 (JSON)">
                                    <Download size={14} />
                                </button>
                                <button onClick={() => setShowPresetPanel(false)} className="p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 rounded">
                                    <X size={14} />
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
                            {presets.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-gray-400 text-center p-4">
                                    <History size={32} className="mb-2 opacity-10" />
                                    <p className="text-[10px]">暂无保存的预设</p>
                                    <p className="text-[9px] mt-1 opacity-60">点击工具栏图标保存当前测量点</p>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-2">
                                    {presets.map(p => (
                                        <div 
                                            key={p.id}
                                            onClick={() => handleLoadPreset(p)}
                                            className="group flex flex-col p-2 bg-white/50 border border-gray-100 rounded hover:border-orange-300 hover:bg-white hover:shadow-md cursor-pointer transition-all"
                                        >
                                            <div className="flex items-center justify-between">
                                                <span className="text-[11px] font-bold text-gray-700 truncate flex-1">{p.name}</span>
                                                <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button 
                                                        onClick={(e) => handleOpenEditDialog(p, e)}
                                                        className="p-1 text-gray-400 hover:text-blue-500"
                                                        title="修改名称并更新状态"
                                                    >
                                                        <Edit2 size={12} />
                                                    </button>
                                                    <button 
                                                        onClick={(e) => handleDeletePreset(p.id, e)}
                                                        className="p-1 text-gray-400 hover:text-red-500"
                                                        title="删除"
                                                    >
                                                        <Trash2 size={12} />
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="mt-1 flex items-center gap-2 text-[9px] text-gray-400">
                                                <span>P2L组: {p.measState.p2lGroups.length}</span>
                                                <span>•</span>
                                                <span>2点测量: {p.measState.p1 && p.measState.p2 ? '已设置' : '未设置'}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
                
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