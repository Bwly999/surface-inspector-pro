import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Activity, Box, Ruler, Upload, Move, Zap, Cpu, ArrowRightLeft, ArrowUpDown, Loader2, Info, Calculator, MapPin, Sliders, Settings, MousePointer2, Image as ImageIcon, HelpCircle, ScanLine, Layers } from 'lucide-react';
import { useLocalStorage } from './hooks/useLocalStorage';
import { GridData, SelectionBox, SelectionLine, TransformState, Marker, ToolType, ViewMode, ChartAxis, ColorSettings, ChartToolType, MeasurementState } from './types';
import { THEME, MAP_OPTIONS } from './constants';
import { generateData, parseCSV, computeGradientMap } from './utils/dataUtils';
import ThreeDViewer from './components/ThreeDViewer';
import ProfileChart from './components/ProfileChart';
import Surface2DCanvas from './components/Surface2DCanvas';
import MarkerList from './components/MarkerList';
import PointCloudConverter from './components/PointCloudConverter';
import HelpGuide from './components/HelpGuide';

export default function SurfaceInspector() {
  const defaultData = useMemo(() => generateData(), []);

  // --- State ---
  const [grid, setGrid] = useState<GridData>({
    w: defaultData.w,
    h: defaultData.h,
    data: defaultData.data,
    minZ: defaultData.minZ,
    maxZ: defaultData.maxZ,
    xs: defaultData.xs,
    ys: defaultData.ys
  });

  const [gradientMap, setGradientMap] = useState<Float32Array | null>(null);
  const [loading, setLoading] = useState(false);

  // Configuration State
  const [activeMap, setActiveMap] = useState('coolwarm');
  const [viewMode, setViewMode] = useState<ViewMode>('height');
  const [tool, setTool] = useState<ToolType>('box');
  const [chartAxis, setChartAxis] = useState<ChartAxis>('horizontal');
  const [chartTool, setChartTool] = useState<ChartToolType>('inspect');
  
  const [transform, setTransform] = useState<TransformState>({ k: 1, x: 0, y: 0 });
  
  // Advanced Settings (Persistent)
  const [colorSettings, setColorSettings] = useLocalStorage<ColorSettings>("surface_color_settings", { 
      mode: 'absolute', 
      min: -0.4, 
      max: 0.2 
  });
  
  const [showColorConfig, setShowColorConfig] = useState(false);
  const [contrast, setContrast] = useState(1.0);

  const [showHoverInfo, setShowHoverInfo] = useState(false);
  const [showMarkerList, setShowMarkerList] = useState(true);
  const [showHelp, setShowHelp] = useState(false);
  
  // Markers (Persistent)
  const [markers, setMarkers] = useLocalStorage<Marker[]>("surface_markers", []);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);

  // Temporary marker from Chart selection (Locked click)
  const [tempMarker, setTempMarker] = useState<{gridX: number, gridY: number, z: number, realX: number, realY: number} | null>(null);
  
  // Hover marker from Chart (Transient hover)
  const [hoverMarker, setHoverMarker] = useState<{gridX: number, gridY: number, z: number} | null>(null);

  // Measurement State (Lifted from ProfileChart)
  const [measState, setMeasState] = useState<MeasurementState>({ step: 'idle', p1: null, p2: null, baseLine: null, points: [] });

  const [boxSel, setBoxSel] = useState<SelectionBox>({ x: 50, y: 50, w: 100, h: 100 });
  const [lineSel, setLineSel] = useState<SelectionLine>({ s: { x: 0, y: 0 }, e: { x: 100, y: 100 } });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imgInputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Converter State
  const [showConverter, setShowConverter] = useState(false);
  const [converterImgSrc, setConverterImgSrc] = useState<string | null>(null);

  // --- Effects ---
  useEffect(() => {
    if (!grid.data) return;
    const timer = setTimeout(() => {
      const grad = computeGradientMap(grid.data, grid.w, grid.h, grid.minZ, grid.maxZ);
      setGradientMap(grad);
    }, 10);
    return () => clearTimeout(timer);
  }, [grid]);

  // Sync Markers Z with Grid Data
  useEffect(() => {
      if (!grid.data || markers.length === 0) return;
      setMarkers(prev => prev.map(m => {
          const gx = Math.max(0, Math.min(grid.w - 1, Math.round(m.gridX)));
          const gy = Math.max(0, Math.min(grid.h - 1, Math.round(m.gridY)));
          const idx = gy * grid.w + gx;
          const newZ = grid.data[idx] || 0;
          
          if (Math.abs(newZ - m.z) > 0.000001) { 
              return { ...m, z: newZ };
          }
          return m;
      }));
  }, [grid]); // grid dependency covers data change

  // --- Handlers ---
  const handleCSVImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setTimeout(() => {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const text = evt.target?.result;
        if (typeof text === 'string') {
          const res = parseCSV(text);
          if (res) {
            setGrid(res);
            setTransform({ k: Math.min(500 / res.w, 500 / res.h), x: 0, y: 0 });
            setTempMarker(null);
            setHoverMarker(null);
            setMeasState({ step: 'idle', p1: null, p2: null, baseLine: null, points: [] });
          }
        }
        setLoading(false);
      };
      reader.readAsText(file);
    }, 100);
  };

  const handleImageImport = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
          if (typeof evt.target?.result === 'string') {
              setConverterImgSrc(evt.target.result);
              setShowConverter(true);
          }
      };
      reader.readAsDataURL(file);
      // Reset input
      e.target.value = '';
  };

  const handleConverterConfirm = (newGrid: GridData) => {
      setGrid(newGrid);
      setTransform({ k: Math.min(500 / newGrid.w, 500 / newGrid.h), x: 0, y: 0 });
      setTempMarker(null);
      setHoverMarker(null);
      setMeasState({ step: 'idle', p1: null, p2: null, baseLine: null, points: [] });
      setShowConverter(false);
  };

  const handleAddMarker = useCallback((point: Omit<Marker, 'id' | 'label'> & { id?: string, label?: string }) => {
    const newMarker: Marker = {
      ...point,
      id: point.id || Date.now().toString(),
      label: point.label || `Marker ${markers.length + 1}`
    };
    setMarkers(prev => [...prev, newMarker]);
    setSelectedMarkerId(newMarker.id);
    setTempMarker(null); // Clear temp if added
  }, [markers, setMarkers]);

  const handleRemoveMarker = useCallback((id: string) => {
    setMarkers(prev => prev.filter(m => m.id !== id));
    if (selectedMarkerId === id) setSelectedMarkerId(null);
  }, [selectedMarkerId, setMarkers]);

  const handleUpdateMarkerLabel = useCallback((id: string, label: string) => {
    setMarkers(prev => prev.map(m => m.id === id ? { ...m, label } : m));
  }, [setMarkers]);

  const handleUpdateMarkerPos = useCallback((id: string, newPos: { gridX: number, gridY: number, realX: number, realY: number, z: number }) => {
     setMarkers(prev => prev.map(m => m.id === id ? { ...m, ...newPos } : m));
  }, [setMarkers]);

  const handleFocusMarker = useCallback((m: Marker) => {
     if (!wrapperRef.current) return;
     const viewportW = wrapperRef.current.clientWidth;
     const viewportH = wrapperRef.current.clientHeight;
     const targetX = viewportW / 2;
     const targetY = viewportH / 2;
     const k = Math.max(transform.k, 2); 
     const newX = targetX - m.gridX * k;
     const newY = targetY - m.gridY * k;
     setTransform({ k, x: newX, y: newY });
     setSelectedMarkerId(m.id);
  }, [transform]);

  const handleChartPointClick = useCallback((pt: { gridX: number, gridY: number, z: number }) => {
      const realX = grid.xs ? (grid.xs as Float32Array)[pt.gridX] : pt.gridX;
      const realY = grid.ys ? (grid.ys as Float32Array)[grid.h - 1 - pt.gridY] : (grid.h - 1 - pt.gridY);
      setTempMarker({
          gridX: pt.gridX,
          gridY: pt.gridY,
          z: pt.z,
          realX,
          realY
      });
  }, [grid]);

  const handleChartHover = useCallback((pt: { gridX: number, gridY: number, z: number } | null) => {
      if (!pt) {
          setHoverMarker(null);
          return;
      }
      setHoverMarker({
          gridX: pt.gridX,
          gridY: pt.gridY,
          z: pt.z
      });
  }, []);

  const handleConfirmTempMarker = useCallback(() => {
      if (!tempMarker) return;
      handleAddMarker({
          gridX: tempMarker.gridX,
          gridY: tempMarker.gridY,
          z: tempMarker.z,
          realX: tempMarker.realX,
          realY: tempMarker.realY,
          type: 'point'
      });
  }, [tempMarker, handleAddMarker]);


  return (
    <div className="flex flex-col h-screen font-mono text-sm select-none relative" style={{ backgroundColor: THEME.bg, color: THEME.text }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Inter:wght@400;700;900&display=swap');
        * { font-family: 'Inter', sans-serif; }
        .mono { font-family: 'Space Mono', monospace; }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-thumb { background: ${THEME.border}; }
        canvas { image-rendering: pixelated; }
        
        @keyframes shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
        @keyframes slideDown { from { transform: translateY(-20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes slideInLeft { from { transform: translateX(-20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes slideInRight { from { transform: translateX(20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes scaleIn { from { transform: scale(0.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }

        .animate-slide-down { animation: slideDown 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .animate-slide-in-left { animation: slideInLeft 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .animate-slide-in-right { animation: slideInRight 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .animate-fade-in { animation: fadeIn 0.4s ease-out forwards; }
        .animate-scale-in { animation: scaleIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
        
        .logo-glow { text-shadow: 0 0 20px rgba(255, 77, 0, 0.3); }
        
        button:active { transform: scale(0.95); }
      `}</style>
      
      {/* Help Modal */}
      <HelpGuide isOpen={showHelp} onClose={() => setShowHelp(false)} />

      {/* Converter Modal */}
      <PointCloudConverter 
        isOpen={showConverter}
        onClose={() => setShowConverter(false)}
        imageSrc={converterImgSrc}
        onConfirm={handleConverterConfirm}
      />

      {/* Loading Overlay */}
      {loading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white p-6 border-2 border-black flex flex-col items-center gap-4 shadow-2xl animate-scale-in">
            <Loader2 className="w-10 h-10 animate-spin text-[#ff4d00]" />
            <div className="text-lg font-bold tracking-widest uppercase mono">正在处理数据...</div>
            <div className="w-48 h-2 bg-gray-200 overflow-hidden relative">
              <div className="absolute inset-0 bg-[#ff4d00] w-1/2 h-full" style={{ animation: 'shimmer 1s infinite linear' }}></div>
            </div>
          </div>
        </div>
      )}

      {/* Header - BRANDING OVERHAUL */}
      <header className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-200 shadow-sm z-20 animate-slide-down">
        <div className="flex items-center gap-4 group cursor-default">
            {/* Logo Icon */}
            <div className="relative w-10 h-10">
                <div className="absolute inset-0 bg-gradient-to-br from-orange-500 to-red-600 rounded-lg transform rotate-3 group-hover:rotate-6 transition-transform opacity-20 duration-300"></div>
                <div className="absolute inset-0 bg-black rounded-lg flex items-center justify-center text-white transform -rotate-3 group-hover:-rotate-0 transition-transform duration-300 shadow-lg">
                   <ScanLine size={24} className="text-[#ff4d00] group-hover:scale-110 transition-transform duration-300"/>
                </div>
                <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white animate-pulse"></div>
            </div>
            
            {/* Text Branding */}
            <div className="flex flex-col justify-center">
                <h1 className="text-xl font-black tracking-tighter leading-none text-gray-900 logo-glow flex items-center gap-2">
                  点云 <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#ff4d00] to-red-600">表面微观分析系统</span>
                </h1>
                <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] font-bold text-white bg-black px-1.5 py-0.5 rounded mono shadow-sm">Pro v3.0</span>
                    <span className="text-[10px] font-medium text-gray-400 tracking-wide uppercase">工业级视觉分析工具</span>
                    <div className="w-px h-3 bg-gray-300"></div>
                    <span className="text-[10px] font-bold text-gray-500 mono">2025-12-25</span>
                </div>
            </div>
        </div>

        <div className="flex items-center gap-3">
           <button 
             onClick={() => setShowHelp(true)}
             className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-md transition-all duration-200 mr-2 active:scale-95"
           >
             <HelpCircle size={16} /> 帮助
           </button>

           <div className="h-8 w-px bg-gray-200"></div>

           <button 
             onClick={() => setShowMarkerList(!showMarkerList)}
             className={`flex items-center gap-2 px-4 py-2 text-xs font-bold border rounded-md transition-all duration-200 shadow-sm active:scale-95 ${showMarkerList ? 'bg-gray-800 text-white border-gray-800 shadow-md transform scale-105' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
           >
             <MapPin size={14} /> 标记列表 ({markers.length})
           </button>

          <label className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-md cursor-pointer bg-white hover:bg-gray-50 hover:border-gray-400 transition-all duration-200 shadow-sm group active:scale-95">
            <Upload size={14} className="group-hover:-translate-y-0.5 transition-transform duration-200 text-[#ff4d00]"/>
            <span className="font-bold text-xs text-gray-700">导入 CSV</span>
            <input type="file" ref={fileInputRef} accept=".csv" className="hidden" onChange={handleCSVImport} />
          </label>
          <label className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-md cursor-pointer bg-white hover:bg-gray-50 hover:border-gray-400 transition-all duration-200 shadow-sm group active:scale-95">
            <ImageIcon size={14} className="group-hover:-translate-y-0.5 transition-transform duration-200 text-[#00a3cc]"/>
            <span className="font-bold text-xs text-gray-700">导入图片</span>
            <input type="file" ref={imgInputRef} accept="image/png,image/jpeg" className="hidden" onChange={handleImageImport} />
          </label>
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex flex-1 overflow-hidden mono">
        {/* Left Panel: 2D View */}
        <div className="w-1/2 flex flex-col border-r-2 animate-slide-in-left" style={{ borderColor: THEME.border }}>
          {/* Toolbar */}
          <div className="flex flex-wrap gap-4 p-3 border-b-2 bg-white" style={{ borderColor: THEME.border }}>
            <div className="flex border-2 rounded-sm overflow-hidden" style={{ borderColor: THEME.border }}>
              {[{ id: 'box', icon: Box, label: '区域选择' }, { id: 'line', icon: Ruler, label: '划线测量' }, { id: 'pan', icon: Move, label: '视图平移' }]
                .map((t) => (
                  <button 
                    key={t.id} 
                    onClick={() => setTool(t.id as ToolType)} 
                    className={`flex items-center gap-2 px-3 py-2 text-xs font-bold transition-all duration-200 ${tool === t.id ? 'text-white' : 'hover:bg-gray-100'}`} 
                    style={{ background: tool === t.id ? THEME.primary : 'transparent' }}
                  >
                    <t.icon size={14} className={tool === t.id ? 'scale-110' : ''}/> {t.label}
                  </button>
                ))}
            </div>
            
            <div className="flex items-center gap-1 relative">
                <select 
                    value={activeMap} 
                    onChange={e => setActiveMap(e.target.value)} 
                    className="px-2 py-2 border-2 text-xs font-bold bg-white focus:outline-none uppercase border-r-0 hover:bg-gray-50 transition-colors" 
                    style={{ borderColor: THEME.border }}
                >
                    {MAP_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>色谱: {opt.label}</option>
                    ))}
                </select>
                <button 
                    onClick={() => setShowColorConfig(!showColorConfig)}
                    className={`p-2 border-2 transition-all duration-200 active:scale-95 ${showColorConfig ? 'bg-gray-200 shadow-inner' : 'bg-white hover:bg-gray-100'}`}
                    style={{ borderColor: THEME.border }}
                    title="Color Map Configuration"
                >
                    <Settings size={14} className={showColorConfig ? 'rotate-90 transition-transform duration-300' : 'transition-transform duration-300'} />
                </button>

                {/* Color Configuration Popover */}
                {showColorConfig && (
                    <div className="absolute top-full left-0 mt-2 bg-white border-2 border-black p-4 shadow-xl z-50 w-64 animate-scale-in origin-top-left">
                        <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-200">
                             <span className="font-bold text-xs flex items-center gap-2"><Settings size={12}/> 色谱范围设置</span>
                             <button onClick={() => setShowColorConfig(false)} className="text-red-500 font-bold hover:scale-110 transition-transform">X</button>
                        </div>
                        
                        <div className="space-y-3">
                             <div>
                                 <label className="text-[10px] font-bold text-gray-500 mb-1 block">范围模式</label>
                                 <div className="flex border border-gray-300 rounded overflow-hidden">
                                     <button 
                                        onClick={() => setColorSettings(s => ({...s, mode: 'relative'}))}
                                        className={`flex-1 py-1 text-[10px] font-bold transition-colors ${colorSettings.mode === 'relative' ? 'bg-blue-500 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}
                                     >
                                        相对
                                     </button>
                                     <button 
                                        onClick={() => setColorSettings(s => ({...s, mode: 'absolute'}))}
                                        className={`flex-1 py-1 text-[10px] font-bold transition-colors ${colorSettings.mode === 'absolute' ? 'bg-blue-500 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}
                                     >
                                        绝对
                                     </button>
                                 </div>
                             </div>

                             {colorSettings.mode === 'absolute' && (
                                 <div className="grid grid-cols-2 gap-2 animate-fade-in">
                                     <div>
                                         <label className="text-[10px] font-bold text-gray-500 mb-1 block">最小 Z</label>
                                         <input 
                                             type="number" step="0.1"
                                             value={colorSettings.min}
                                             onChange={e => setColorSettings(s => ({...s, min: parseFloat(e.target.value)}))}
                                             className="w-full border border-gray-300 p-1 text-xs focus:border-blue-500 outline-none transition-colors"
                                         />
                                     </div>
                                     <div>
                                         <label className="text-[10px] font-bold text-gray-500 mb-1 block">最大 Z</label>
                                         <input 
                                             type="number" step="0.1"
                                             value={colorSettings.max}
                                             onChange={e => setColorSettings(s => ({...s, max: parseFloat(e.target.value)}))}
                                             className="w-full border border-gray-300 p-1 text-xs focus:border-blue-500 outline-none transition-colors"
                                         />
                                     </div>
                                 </div>
                             )}
                             <div className="text-[10px] text-gray-400 italic pt-1">
                                {colorSettings.mode === 'relative' 
                                  ? "颜色范围适应当前数据的最小/最大值。" 
                                  : "颜色固定在指定的 Z 值范围内。"}
                             </div>
                        </div>
                    </div>
                )}
            </div>

            <div className="w-px bg-gray-300 mx-2" />
            <div className="flex border-2 rounded-sm overflow-hidden" style={{ borderColor: THEME.border }}>
              <button onClick={() => setViewMode('height')} className={`px-3 py-2 text-xs font-bold transition-all duration-200 ${viewMode === 'height' ? 'text-white' : 'hover:bg-gray-100'}`} style={{ background: viewMode === 'height' ? THEME.secondary : 'transparent' }}>高度图</button>
              <button onClick={() => setViewMode('gradient')} className={`flex items-center gap-1 px-3 py-2 text-xs font-bold transition-all duration-200 ${viewMode === 'gradient' ? 'text-white' : 'hover:bg-gray-100'}`} style={{ background: viewMode === 'gradient' ? THEME.secondary : 'transparent' }}><Zap size={12} /> 梯度图</button>
            </div>
          </div>

          {/* 2D Canvas Container */}
          <div ref={wrapperRef} className="flex-1 relative overflow-hidden bg-gray-100">
             {showMarkerList && (
                <MarkerList 
                   markers={markers}
                   selectedMarkerId={selectedMarkerId}
                   onSelect={setSelectedMarkerId}
                   onDelete={handleRemoveMarker}
                   onUpdateLabel={handleUpdateMarkerLabel}
                   onFocus={handleFocusMarker}
                />
             )}
             
             <Surface2DCanvas 
                grid={grid}
                gradientMap={gradientMap}
                activeMap={activeMap}
                viewMode={viewMode}
                tool={tool}
                boxSel={boxSel}
                lineSel={lineSel}
                chartAxis={chartAxis}
                chartTool={chartTool} // New Prop
                markers={markers}
                showMarkers={showMarkerList}
                showHoverInfo={showHoverInfo}
                selectedMarkerId={selectedMarkerId}
                colorSettings={colorSettings}
                tempMarker={tempMarker}
                hoverMarker={hoverMarker}
                measState={measState} 
                onSetMeasState={setMeasState} // New Prop
                onSetBoxSel={setBoxSel}
                onSetLineSel={setLineSel}
                onSetTransform={setTransform}
                onSelectMarker={setSelectedMarkerId}
                onUpdateMarkerPos={handleUpdateMarkerPos}
                onAddMarker={handleAddMarker}
                onToggleCursor={() => setShowHoverInfo(!showHoverInfo)}
                transform={transform}
             />
          </div>
        </div>

        {/* Right Panel: 3D View & Charts - SPLIT 50/50 */}
        <div className="w-1/2 flex flex-col bg-white animate-slide-in-right">
          
          {/* Top Half: 3D View (50%) */}
          <div className="h-1/2 relative border-b-2" style={{ borderColor: THEME.border }}>
            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 px-2 py-1 bg-white/90 backdrop-blur border-2 text-xs font-bold shadow-sm rounded-full animate-fade-in" style={{ borderColor: THEME.border, color: THEME.primary }}>等轴拓扑视图</div>
            <ThreeDViewer 
                grid={grid} 
                boxSel={boxSel} 
                lineSel={lineSel} 
                tool={tool} 
                colorMap={activeMap} 
                viewMode={viewMode} 
                gradientMap={gradientMap} 
                markers={markers}
                showMarkers={showMarkerList}
                selectedMarkerId={selectedMarkerId}
                colorSettings={colorSettings}
                contrast={contrast}
                onContrastChange={setContrast}
                tempMarker={tempMarker}
                hoverMarker={hoverMarker}
            />
          </div>
          
          {/* Bottom Half: Chart (50%) */}
          <div className="h-1/2 p-4 flex flex-col gap-4 bg-gray-50">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold flex items-center gap-2"><Activity size={16} className="text-blue-500 animate-pulse"/> 信号剖面分析</h3>
              <div className="flex items-center gap-3">
                {tool === 'box' && (
                  <div className="flex gap-1 animate-fade-in">
                    <button onClick={() => setChartAxis('horizontal')} title="Horizontal Profile" className={`p-1 border transition-all duration-200 ${chartAxis === 'horizontal' ? 'bg-black text-white scale-105' : 'bg-white hover:bg-gray-100'}`} style={{ borderColor: THEME.border }}><ArrowRightLeft size={14} /></button>
                    <button onClick={() => setChartAxis('vertical')} title="Vertical Profile" className={`p-1 border transition-all duration-200 ${chartAxis === 'vertical' ? 'bg-black text-white scale-105' : 'bg-white hover:bg-gray-100'}`} style={{ borderColor: THEME.border }}><ArrowUpDown size={14} /></button>
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex-1 bg-white border-2 shadow-sm relative overflow-hidden transition-shadow duration-300 hover:shadow-md" style={{ borderColor: THEME.border }}>
              <ProfileChart
                grid={grid}
                boxSel={boxSel}
                lineSel={lineSel}
                tool={tool}
                mode={viewMode}
                gradientMap={gradientMap}
                axis={chartAxis}
                chartTool={chartTool}
                measState={measState} // PASS MEAS STATE
                onSetMeasState={setMeasState} // PASS SETTER
                onSetChartTool={setChartTool}
                onChartClick={handleChartPointClick}
                onChartHover={handleChartHover}
                tempMarker={tempMarker}
                onConfirmTempMarker={handleConfirmTempMarker}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}