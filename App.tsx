import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Activity, Box, Ruler, Upload, Move, Zap, Cpu, ArrowRightLeft, ArrowUpDown, Loader2, Info, Calculator, MapPin, Sliders, Settings, MousePointer2, Image as ImageIcon, HelpCircle, ScanLine, Layers, Palette, Trash2, Save, History, Plus } from 'lucide-react';
import { useLocalStorage } from './hooks/useLocalStorage';
import { ActiveLayer, ChartAxis, ChartToolType, ColorPreset, ColorSettings, DataWorkerRequest, DataWorkerResponse, DerivedLayerCacheEntry, DerivedLayerKind, DerivedLayerKey, DisplayRange, GridData, Marker, MeasurementState, SelectionBox, SelectionLine, TransformState, ToolType, ViewMode } from './types';
import { THEME, MAP_OPTIONS } from './constants';
import { buildDerivedLayerKey, generateData } from './utils/dataUtils';
import { getGradientCSS } from './utils/colorUtils';
import { estimatePercentileRange } from './utils/rangeUtils';
import ThreeDViewer from './components/ThreeDViewer';
import ProfileChart from './components/ProfileChart';
import Surface2DCanvas from './components/Surface2DCanvas';
import MarkerList from './components/MarkerList';
import PointCloudConverter from './components/PointCloudConverter';
import HelpGuide from './components/HelpGuide';

export default function SurfaceInspector() {
  const defaultData = useMemo(() => generateData(), []);
  const defaultDatasetId = 'generated-default';
  const defaultHeightRange = useMemo(() => estimatePercentileRange(defaultData.data), [defaultData.data]);

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

  const [mapDirection, setMapDirection] = useState<'x' | 'y'>('x');
  const [datasetId, setDatasetId] = useState(defaultDatasetId);
  const [heightRange, setHeightRange] = useState<DisplayRange>(defaultHeightRange);
  const [derivedLayerCache, setDerivedLayerCache] = useState<Partial<Record<DerivedLayerKey, DerivedLayerCacheEntry>>>({});
  const [loadingPhase, setLoadingPhase] = useState<'idle' | 'reading' | 'parsing'>('idle');
  const [pendingLayerKind, setPendingLayerKind] = useState<DerivedLayerKind | null>(null);

  // Configuration State
  const [activeMap, setActiveMap] = useState('coolwarm');
  const [viewMode, setViewMode] = useState<ViewMode>('height');
  const [tool, setTool] = useState<ToolType>('box');
  const [chartAxis, setChartAxis] = useState<ChartAxis>('horizontal');
  const [chartTool, setChartTool] = useState<ChartToolType>('inspect');
  
  const [transform, setTransform] = useState<TransformState>({ k: 1, x: 0, y: 0 });
  
  // Workspace Color Settings (Tab-local, decoupled from localStorage to prevent cross-window interference)
  const [colorSettings, setColorSettings] = useState<ColorSettings>({ 
      mode: 'absolute', 
      min: -0.4, 
      max: 0.2 
  });
  
  // Persistent Presets (Shared across windows)
  const [colorPresets, setColorPresets] = useLocalStorage<ColorPreset[]>("surface_color_presets", []);
  const [newPresetName, setNewPresetName] = useState("");
  const [showPresetPanel, setShowPresetPanel] = useState(false);

  const [showColorConfig, setShowColorConfig] = useState(false);
  const [minStr, setMinStr] = useState(colorSettings.min.toString());
  const [maxStr, setMaxStr] = useState(colorSettings.max.toString());
  const isEditingMin = useRef(false);
  const isEditingMax = useRef(false);

  // Sync string states when colorSettings change from outside (e.g. storage or reset)
  useEffect(() => {
    if (!isEditingMin.current) setMinStr(colorSettings.min.toString());
    if (!isEditingMax.current) setMaxStr(colorSettings.max.toString());
  }, [colorSettings.min, colorSettings.max]);

  const [contrast, setContrast] = useState(1.0);

  const [showHoverInfo, setShowHoverInfo] = useState(true);
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
  const [measState, setMeasState] = useState<MeasurementState>({ step: 'idle', p1: null, p2: null, p2lGroups: [], activeGroupId: null });

  const [boxSel, setBoxSel] = useState<SelectionBox>({ x: 50, y: 50, w: 100, h: 100 });
  const [lineSel, setLineSel] = useState<SelectionLine>({ s: { x: 0, y: 0 }, e: { x: 100, y: 100 } });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imgInputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const datasetIdRef = useRef(datasetId);
  const gridRef = useRef(grid);
  const pendingRequestsRef = useRef(new Map<string, { resolve: (value: any) => void; reject: (reason?: unknown) => void }>());
  const registeredDatasetIdsRef = useRef(new Set<string>());

  // Converter State
  const [showConverter, setShowConverter] = useState(false);
  const [converterImgSrc, setConverterImgSrc] = useState<string | null>(null);
  const [converterImgBuffer, setConverterImgBuffer] = useState<ArrayBuffer | null>(null);

  // --- Effects ---
  useEffect(() => {
    datasetIdRef.current = datasetId;
  }, [datasetId]);

  useEffect(() => {
    gridRef.current = grid;
  }, [grid]);

  useEffect(() => {
    const worker = new Worker(new URL('./utils/dataWorker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<DataWorkerResponse>) => {
      const pending = pendingRequestsRef.current.get(event.data.requestId);
      if (!pending) return;

      pendingRequestsRef.current.delete(event.data.requestId);

      if (event.data.type === 'error') {
        pending.reject(new Error(event.data.payload.message));
        return;
      }

      pending.resolve(event.data.payload);
    };

    worker.onerror = (event) => {
      const error = new Error(event.message || '后台数据处理失败');
      pendingRequestsRef.current.forEach(({ reject }) => reject(error));
      pendingRequestsRef.current.clear();
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
      pendingRequestsRef.current.clear();
    };
  }, []);

  const callWorker = useCallback(<T,>(request: Omit<DataWorkerRequest, 'requestId'>) => {
    if (!workerRef.current) {
      return Promise.reject(new Error('数据处理线程尚未初始化'));
    }

    const requestId = `worker-${++requestIdRef.current}`;

    return new Promise<T>((resolve, reject) => {
      pendingRequestsRef.current.set(requestId, { resolve, reject });
      workerRef.current?.postMessage({ ...request, requestId });
    });
  }, []);

  const applyGridState = useCallback((nextGrid: GridData, nextDatasetId: string, nextHeightRange: DisplayRange) => {
    setDatasetId(nextDatasetId);
    setGrid(nextGrid);
    setHeightRange(nextHeightRange);
    setDerivedLayerCache({});
    setPendingLayerKind(null);
    setTransform({ k: Math.min(500 / nextGrid.w, 500 / nextGrid.h), x: 0, y: 0 });
    setTempMarker(null);
    setHoverMarker(null);
    setSelectedMarkerId(null);
    setMeasState({ step: 'idle', p1: null, p2: null, p2lGroups: [], activeGroupId: null });
  }, []);

  const ensureDatasetRegistered = useCallback(async (targetDatasetId: string, targetGrid: GridData) => {
    if (registeredDatasetIdsRef.current.has(targetDatasetId)) {
      return;
    }

    await callWorker<{ datasetId: string }>({
      type: 'register-grid',
      datasetId: targetDatasetId,
      grid: targetGrid,
    });

    registeredDatasetIdsRef.current.add(targetDatasetId);
  }, [callWorker]);

  useEffect(() => {
    void ensureDatasetRegistered(defaultDatasetId, defaultData);
  }, [defaultData, defaultDatasetId, ensureDatasetRegistered]);

  const requestDerivedLayer = useCallback(async (kind: DerivedLayerKind, targetDatasetId = datasetIdRef.current, targetGrid = gridRef.current) => {
    if (pendingLayerKind === kind) {
      return;
    }

    const key = buildDerivedLayerKey(kind, mapDirection);
    if (derivedLayerCache[key]) {
      return;
    }

    setPendingLayerKind(kind);

    try {
      await ensureDatasetRegistered(targetDatasetId, targetGrid);

      const payload = await callWorker<{
        kind: DerivedLayerKind;
        maps: { x: Float32Array; y: Float32Array };
        ranges: Record<'x' | 'y', DisplayRange>;
      }>({
        type: 'compute-layer',
        datasetId: targetDatasetId,
        kind,
      });

      if (datasetIdRef.current !== targetDatasetId) {
        return;
      }

      setDerivedLayerCache(prev => ({
        ...prev,
        [buildDerivedLayerKey(kind, 'x')]: { data: payload.maps.x, range: payload.ranges.x },
        [buildDerivedLayerKey(kind, 'y')]: { data: payload.maps.y, range: payload.ranges.y },
      }));
    } finally {
      if (datasetIdRef.current === targetDatasetId) {
        setPendingLayerKind(current => (current === kind ? null : current));
      }
    }
  }, [callWorker, derivedLayerCache, ensureDatasetRegistered, mapDirection, pendingLayerKind]);

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

  useEffect(() => {
    if (viewMode === 'gradient' || viewMode === 'curvature') {
      void requestDerivedLayer(viewMode);
    }
  }, [viewMode, datasetId, requestDerivedLayer]);

  // --- Derived State: Active Layer ---
  const activeDerivedKey = viewMode === 'height' ? null : buildDerivedLayerKey(viewMode, mapDirection);
  const activeDerivedEntry = activeDerivedKey ? derivedLayerCache[activeDerivedKey] : null;
  const displayRange = activeDerivedEntry?.range ?? heightRange;

  const activeLayer = useMemo<ActiveLayer>(() => {
      if (activeDerivedEntry) {
          return {
            data: activeDerivedEntry.data,
            min: activeDerivedEntry.range.min,
            max: activeDerivedEntry.range.max,
            type: viewMode,
          };
      }

      const min = colorSettings.mode === 'relative' ? heightRange.min : colorSettings.min;
      const max = colorSettings.mode === 'relative' ? heightRange.max : colorSettings.max;

      return { data: grid.data, min, max, type: 'height' };
  }, [activeDerivedEntry, colorSettings.max, colorSettings.min, colorSettings.mode, grid.data, heightRange.max, heightRange.min, viewMode]);

  // --- Handlers ---
  const processCSVFile = useCallback(async (file: File) => {
    const nextDatasetId = `csv-${Date.now()}`;

    try {
      setLoadingPhase('reading');
      const text = await file.text();

      setLoadingPhase('parsing');

      const payload = await callWorker<{ datasetId: string; grid: GridData; range: DisplayRange }>({
        type: 'parse-csv',
        datasetId: nextDatasetId,
        text,
      });

      registeredDatasetIdsRef.current.add(payload.datasetId);
      applyGridState(payload.grid, payload.datasetId, payload.range);
      setLoadingPhase('idle');

      if (viewMode === 'gradient' || viewMode === 'curvature') {
        void requestDerivedLayer(viewMode, payload.datasetId, payload.grid);
      }
    } catch (error) {
      setLoadingPhase('idle');
      window.alert(error instanceof Error ? error.message : 'CSV 导入失败');
    }
  }, [applyGridState, callWorker, requestDerivedLayer, viewMode]);

  // External Event Listener for CSV Upload
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'UPLOAD_CSV') {
        const file = event.data.payload;
        if (file instanceof File) {
          processCSVFile(file);
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [processCSVFile]);

  const handleCSVImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processCSVFile(file);
    e.target.value = '';
  };
const handleImageImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
        if (typeof evt.target?.result === 'string') {
            setConverterImgSrc(evt.target.result);

            // Also read as ArrayBuffer
            const bufferReader = new FileReader();
            bufferReader.onload = (bEvt) => {
                if (bEvt.target?.result instanceof ArrayBuffer) {
                    setConverterImgBuffer(bEvt.target.result);
                    setShowConverter(true);
                }
            };
            bufferReader.readAsArrayBuffer(file);
        }
    };
    reader.readAsDataURL(file);

    // Reset input
    e.target.value = '';
  };

  const handleConverterConfirm = (newGrid: GridData) => {
      const nextDatasetId = `image-${Date.now()}`;
      applyGridState(newGrid, nextDatasetId, estimatePercentileRange(newGrid.data));
      void ensureDatasetRegistered(nextDatasetId, newGrid).then(() => {
          if (viewMode === 'gradient' || viewMode === 'curvature') {
              void requestDerivedLayer(viewMode, nextDatasetId, newGrid);
          }
      });
      setShowConverter(false);
      setConverterImgSrc(null);
      setConverterImgBuffer(null);
  };

  const handleCloseConverter = () => {
      setShowConverter(false);
      setConverterImgSrc(null);
      setConverterImgBuffer(null);
  };

  // --- Color Preset Handlers ---
  const handleSavePreset = () => {
      if (!newPresetName.trim()) return;
      const newPreset: ColorPreset = {
          id: Date.now().toString(),
          name: newPresetName.trim(),
          map: activeMap,
          settings: { ...colorSettings }
      };
      setColorPresets([...colorPresets, newPreset]);
      setNewPresetName("");
  };

  const handleApplyPreset = (preset: ColorPreset) => {
      setActiveMap(preset.map);
      setColorSettings(preset.settings);
  };

  const handleDeletePreset = (id: string) => {
      setColorPresets(colorPresets.filter(p => p.id !== id));
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
    <div className="flex flex-col h-screen font-sans text-sm select-none relative" style={{ backgroundColor: THEME.bg, color: THEME.text }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;700;800&family=JetBrains+Mono:wght@400;700&display=swap');

        * { font-family: 'Plus Jakarta Sans', sans-serif; }
        .mono { font-family: 'JetBrains Mono', monospace; }

        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 10px; }
        ::-webkit-scrollbar-thumb:hover { background: #9ca3af; }

        canvas { image-rendering: pixelated; }

        .dot-grid {
          background-image: radial-gradient(rgba(0,0,0,0.1) 1px, transparent 1px);
          background-size: 16px 16px;
        }

        .hard-shadow { box-shadow: 2px 2px 0px 0px rgba(0,0,0,0.15); }
        .hard-shadow-sm { box-shadow: 1px 1px 0px 0px rgba(0,0,0,0.1); }
        .hard-shadow-md { box-shadow: 4px 4px 0px 0px rgba(0,0,0,0.12); }
        .hard-shadow-lg { box-shadow: 6px 6px 0px 0px rgba(0,0,0,0.1); }

        @keyframes shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
        @keyframes slideDown { from { transform: translateY(-20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes slideInLeft { from { transform: translateX(-20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes slideInRight { from { transform: translateX(20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes scaleIn { from { transform: scale(0.98); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        @keyframes typing { from { width: 0 } to { width: 100% } }
        @keyframes blink { from, to { border-color: transparent } 50% { border-color: #ff4d00; } }

        .animate-slide-down { animation: slideDown 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .animate-slide-in-left { animation: slideInLeft 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .animate-slide-in-right { animation: slideInRight 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .animate-fade-in { animation: fadeIn 0.3s ease-out forwards; }
        .animate-scale-in { animation: scaleIn 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }

        .typewriter-text { 
            overflow: hidden; 
            white-space: nowrap; 
            border-right: 2px solid #ff4d00; 
            width: 0;
        }
        .group:hover .typewriter-text { 
            animation: typing 1s steps(30, end) forwards, blink .75s step-end infinite; 
        }

        .logo-glow { text-shadow: 0 0 15px rgba(255, 77, 0, 0.2); }

        .btn-press:active { transform: translate(1px, 1px); box-shadow: 0px 0px 0px 0px rgba(0,0,0,1); }

        /* Fix for blurry lucide icons on Windows non-integer scaling (125%, 150%) */
        svg.lucide {
          shape-rendering: geometricPrecision;
          transform: translateZ(0);
          backface-visibility: hidden;
        }
      `}</style>

      {/* Help Modal */}
      <HelpGuide isOpen={showHelp} onClose={() => setShowHelp(false)} />

      {/* Converter Modal */}
      <PointCloudConverter
        isOpen={showConverter}
        onClose={handleCloseConverter}
        imageSrc={converterImgSrc}
        imageBuffer={converterImgBuffer}
        onConfirm={handleConverterConfirm}
      />

      {/* Loading Overlay */}
      {loadingPhase !== 'idle' && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white p-6 border-2 border-black flex flex-col items-center gap-4 hard-shadow-lg animate-scale-in">
            <Loader2 className="w-10 h-10 animate-spin text-[#ff4d00]" />
            <div className="text-lg font-bold tracking-widest uppercase mono">
              {loadingPhase === 'reading' ? '正在读取文件...' : '正在解析 CSV...'}
            </div>
            <div className="w-48 h-2 bg-gray-200 overflow-hidden relative">
              <div className="absolute inset-0 bg-[#ff4d00] w-1/2 h-full" style={{ animation: 'shimmer 1s infinite linear' }}></div>
            </div>
          </div>
        </div>
      )}

      {/* Header - BRANDING OVERHAUL */}
      <header className="flex items-center justify-between px-4 py-2.5 bg-white border-b-2 border-black z-20 animate-slide-down">        <div className="flex items-center gap-4 group cursor-default">
            {/* Logo Icon - Scheme 3: High-Contrast Scan */}
            <div className="relative w-24 h-11">
                <div className="absolute inset-0 bg-[#ff4d00] rounded transform rotate-1 transition-transform duration-300 hard-shadow-sm"></div>
                <div className="absolute inset-0 bg-white border-2 border-black rounded flex items-center justify-center transform -rotate-1 group-hover:rotate-0 transition-transform duration-300 overflow-hidden">
                   <svg width="100%" height="100%" viewBox="0 0 80 40" fill="none" xmlns="http://www.w3.org/2000/svg" className="group-hover:scale-105 transition-transform duration-300 p-1">
                      {/* Grid Background Effect */}
                      <path d="M0 20H80" stroke="#ff4d00" strokeWidth="0.5" opacity="0.1"/>
                      
                      {/* Background Waveform (Black Dashed) */}
                      <path d="M5 30C15 25 25 35 40 20C55 5 65 25 75 20" stroke="black" strokeWidth="2" strokeDasharray="4 2" />
                      
                      {/* Wide Scanning Beam */}
                      <rect x="39" y="0" width="10" height="40" fill="#ff4d00" opacity="0.2">
                        <animate attributeName="x" values="-10;80;-10" dur="3s" repeatCount="indefinite" />
                      </rect>
                      
                      {/* Active Waveform (Orange) */}
                      <path d="M5 30C15 25 25 35 40 20C55 5 65 25 75 20" stroke="#ff4d00" strokeWidth="2.5" />
                   </svg>
                </div>
            </div>
            
            {/* Text Branding */}
            <div className="flex flex-col justify-center">
                <h1 className="text-xl font-extrabold tracking-tighter leading-none text-gray-900 logo-glow flex items-center gap-2">
                  点云 <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#ff4d00] to-red-600">表面微观分析系统</span>
                </h1>
                <div className="flex items-center gap-2 mt-1">
                    <div className="flex items-center bg-black rounded-sm overflow-hidden hard-shadow-sm shrink-0">
                        <span className="text-[10px] font-black text-white px-1.5 py-0.5 mono">Pro v3.3</span>
                        <span className="text-[9px] font-bold text-gray-400 bg-gray-900 px-1.5 py-0.5 mono">2026.04.24</span>
                    </div>

                    {/* Designer Signature - Option 3: Terminal Style */}
                    <div className="ml-1 h-[20px] flex items-center">
                        <div className="hidden group-hover:flex items-center mono text-[10px] text-[#ff4d00] font-bold bg-gray-900 px-2 py-0.5 rounded-sm hard-shadow-sm border border-gray-800">
                            <span className="mr-1.5 text-green-500">~%</span>
                            <div className="typewriter-text font-bold">
                                whoami | 王忠禹(w00842380)
                            </div>
                        </div>
                    </div>

                    <span className="text-[10px] font-bold text-gray-400 tracking-wide uppercase">工业级视觉分析工具</span>
                </div>
            </div>
        </div>

        <div className="flex items-center gap-3">
           <button 
             onClick={() => setShowHelp(true)}
             className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-gray-500 hover:text-black hover:bg-gray-100 rounded transition-all duration-200 mr-2 btn-press"
           >
             <HelpCircle size={16} /> 帮助
           </button>

           <div className="h-8 w-px bg-gray-200"></div>

           <button 
             onClick={() => setShowMarkerList(!showMarkerList)}
             className={`flex items-center gap-2 px-4 py-2 text-xs font-bold border-2 rounded transition-all duration-200 btn-press ${showMarkerList ? 'bg-black text-white border-black hard-shadow-sm' : 'bg-white text-gray-700 border-black hover:bg-gray-50'}`}
           >
             <MapPin size={14} /> 标记列表 ({markers.length})
           </button>

          <label className="flex items-center gap-2 px-4 py-2 border-2 border-black rounded cursor-pointer bg-white hover:bg-gray-50 transition-all duration-200 hard-shadow-sm btn-press group">
            <Upload size={14} className="group-hover:-translate-y-0.5 transition-transform duration-200 text-[#ff4d00]"/>
            <span className="font-bold text-xs text-gray-700">导入 CSV</span>
            <input type="file" ref={fileInputRef} accept=".csv" className="hidden" onChange={handleCSVImport} />
          </label>
          <label className="flex items-center gap-2 px-4 py-2 border-2 border-black rounded cursor-pointer bg-white hover:bg-gray-50 transition-all duration-200 hard-shadow-sm btn-press group">
            <ImageIcon size={14} className="group-hover:-translate-y-0.5 transition-transform duration-200 text-[#00a3cc]"/>
            <span className="font-bold text-xs text-gray-700">导入图片</span>
            <input type="file" ref={imgInputRef} accept="image/png,image/jpeg" className="hidden" onChange={handleImageImport} />
          </label>
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex flex-1 overflow-hidden mono dot-grid">
        {/* Left Panel: 2D View */}
        <div className="w-1/2 flex flex-col border-r-2 border-black animate-slide-in-left bg-white/50 backdrop-blur-sm">
          {/* Toolbar */}
          <div className="flex flex-wrap gap-4 p-3 border-b-2 border-black bg-white">
            <div className="flex border-2 border-black rounded-sm overflow-hidden hard-shadow-sm">
              {[{ id: 'box', icon: Box, label: '区域选择' }, { id: 'line', icon: Ruler, label: '划线测量' }, { id: 'pan', icon: Move, label: '视图平移' }]
                .map((t) => (
                  <button 
                    key={t.id} 
                    onClick={() => setTool(t.id as ToolType)} 
                    className={`flex items-center gap-2 px-3 py-2 text-xs font-bold transition-all duration-200 btn-press ${tool === t.id ? 'text-white' : 'hover:bg-gray-100'}`} 
                    style={{ background: tool === t.id ? THEME.primary : 'transparent' }}
                  >
                    <t.icon size={14} className={tool === t.id ? 'scale-110' : ''}/> {t.label}
                  </button>
                ))}
            </div>
            
            <div className="flex items-center gap-1 relative">
                <button
                    onClick={() => setShowColorConfig(!showColorConfig)}
                    className={`flex items-center gap-2 px-3 py-1.5 border-2 border-black transition-all duration-200 btn-press group ${showColorConfig ? 'bg-gray-200 hard-shadow-sm translate-x-[1px] translate-y-[1px]' : 'bg-white hover:bg-gray-50 hard-shadow-sm'}`}
                    title="Color Scale & Range Settings"
                >
                    <div className="relative">
                        <Palette size={16} className={`text-orange-600 ${showColorConfig ? 'scale-110 rotate-12' : 'group-hover:rotate-12'} transition-transform`} />
                        <div className="absolute -top-1 -right-1 w-2 h-2 bg-orange-500 rounded-full animate-pulse border border-white" />
                    </div>
                    <div className="flex flex-col items-start leading-tight">
                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-tighter">色谱</span>
                        <span className="text-[11px] font-bold truncate max-w-[80px]">
                            {MAP_OPTIONS.find(o => o.value === activeMap)?.label}
                        </span>
                    </div>
                    <div 
                        className="w-10 h-3 border border-black ml-1 rounded-[1px] overflow-hidden"
                        style={{ background: getGradientCSS(activeMap) }}
                    />
                    <Settings size={12} className={`ml-1 text-gray-400 ${showColorConfig ? 'rotate-90 text-orange-600' : ''} transition-all duration-300`} />
                </button>

                {/* Color Configuration Popover */}
                {showColorConfig && (
                  <div className="absolute top-full left-0 mt-2 flex gap-0 animate-scale-in origin-top-left z-50">
                    {/* Main Settings Panel */}
                    <div className="bg-white border-2 border-black p-4 hard-shadow-md w-72">
                        <div className="flex items-center justify-between mb-4 pb-2 border-b-2 border-black">
                             <span className="font-black text-[11px] flex items-center gap-2 uppercase tracking-widest">
                                 <Palette size={14} className="text-orange-600"/> 色谱与范围设置
                             </span>
                             <div className="flex items-center gap-1">
                                <button 
                                    onClick={() => setShowPresetPanel(!showPresetPanel)} 
                                    className={`p-1 border-2 transition-colors btn-press ${showPresetPanel ? 'bg-orange-500 border-black text-white' : 'bg-white border-black hover:bg-gray-100'}`}
                                    title="预设管理"
                                >
                                    <History size={12}/>
                                </button>
                                <button onClick={() => setShowColorConfig(false)} className="bg-black text-white px-2 py-0.5 text-[10px] font-black hover:bg-orange-600 transition-colors uppercase">Close</button>
                             </div>
                        </div>

                        <div className="space-y-4">
                             {/* Map Selection Grid */}
                             <div>
                                 <label className="text-[10px] font-black text-gray-500 mb-2 block uppercase tracking-tighter">选择色谱方案</label>
                                 <div className="grid grid-cols-1 gap-1 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
                                     {MAP_OPTIONS.map(opt => (
                                         <button
                                            key={opt.value}
                                            onClick={() => setActiveMap(opt.value)}
                                            className={`flex items-center gap-2 p-1.5 border-2 transition-all ${activeMap === opt.value ? 'border-orange-500 bg-orange-50' : 'border-transparent hover:bg-gray-100'}`}
                                         >
                                             <div 
                                                className="w-16 h-4 border border-black/10 rounded-sm"
                                                style={{ background: getGradientCSS(opt.value) }}
                                             />
                                             <span className={`text-[10px] font-bold ${activeMap === opt.value ? 'text-orange-700' : 'text-gray-700'}`}>
                                                 {opt.label}
                                             </span>
                                             {activeMap === opt.value && <div className="ml-auto w-2 h-2 bg-orange-500 rounded-full" />}
                                         </button>
                                     ))}
                                 </div>
                             </div>

                             <div className="h-px bg-gray-200" />

                             <div>
                                 <label className="text-[10px] font-black text-gray-500 mb-2 block uppercase tracking-tighter">范围模式</label>
                             <div className="flex border-2 border-black rounded-sm overflow-hidden p-0.5 bg-gray-100">
                                     <button 
                                        onClick={() => setColorSettings(s => ({...s, mode: 'relative'}))}
                                        className={`flex-1 py-1.5 text-[10px] font-black transition-all ${colorSettings.mode === 'relative' ? 'bg-black text-white hard-shadow-sm' : 'text-gray-500 hover:text-black hover:bg-white/50'}`}
                                     >
                                        相对模式
                                     </button>
                                     <button 
                                        onClick={() => setColorSettings(s => ({...s, mode: 'absolute'}))}
                                        className={`flex-1 py-1.5 text-[10px] font-black transition-all ${colorSettings.mode === 'absolute' ? 'bg-black text-white hard-shadow-sm' : 'text-gray-500 hover:text-black hover:bg-white/50'}`}
                                     >
                                        绝对模式
                                     </button>
                                 </div>
                                 <div className="mt-2 px-2 py-1 bg-gray-50 border border-gray-200 rounded-sm flex justify-between items-center">
                                     <span className="text-[9px] font-bold text-gray-400">当前范围 (2%-98%):</span>
                                     <span className="text-[10px] font-black text-black mono">
                                         {displayRange.min.toFixed(3)} ~ {displayRange.max.toFixed(3)}
                                     </span>
                                 </div>
                             </div>

                             {colorSettings.mode === 'absolute' && (
                                 <div className="grid grid-cols-2 gap-3 animate-slide-down">
                                     <div>
                                         <label className="text-[10px] font-black text-gray-400 mb-1 block uppercase">MIN Z</label>
                                         <div className="relative group">
                                            <input 
                                                type="number"
                                                step="0.1"
                                                value={minStr}
                                                onFocus={() => { isEditingMin.current = true; }}
                                                onChange={e => {
                                                    const val = e.target.value;
                                                    setMinStr(val);
                                                    const num = parseFloat(val);
                                                    if (!isNaN(num)) {
                                                        setColorSettings(s => ({...s, min: num}));
                                                    }
                                                }}
                                                onBlur={() => {
                                                    isEditingMin.current = false;
                                                    setMinStr(colorSettings.min.toString());
                                                }}
                                                className="w-full border-2 border-gray-200 p-2 text-xs font-bold focus:border-black focus:bg-orange-50 outline-none transition-all pr-1"
                                            />
                                         </div>
                                     </div>
                                     <div>
                                         <label className="text-[10px] font-black text-gray-400 mb-1 block uppercase">MAX Z</label>
                                         <div className="relative group">
                                            <input 
                                                type="number"
                                                step="0.1"
                                                value={maxStr}
                                                onFocus={() => { isEditingMax.current = true; }}
                                                onChange={e => {
                                                    const val = e.target.value;
                                                    setMaxStr(val);
                                                    const num = parseFloat(val);
                                                    if (!isNaN(num)) {
                                                        setColorSettings(s => ({...s, max: num}));
                                                    }
                                                }}
                                                onBlur={() => {
                                                    isEditingMax.current = false;
                                                    setMaxStr(colorSettings.max.toString());
                                                }}
                                                className="w-full border-2 border-gray-200 p-2 text-xs font-bold focus:border-black focus:bg-orange-50 outline-none transition-all pr-1"
                                            />
                                         </div>
                                     </div>
                                 </div>
                             )}
                             <div className="text-[9px] text-gray-400 font-medium italic border-l-2 border-orange-500 pl-2 py-1 bg-orange-50/30">
                                {colorSettings.mode === 'relative' 
                                  ? "颜色范围将根据当前数据自动调整。" 
                                  : "颜色范围固定在用户定义的 Z 轴阈值。"}
                             </div>

                             <div className="h-px bg-gray-200" />
                             
                             <div className="flex gap-1">
                                 <input 
                                     type="text"
                                     placeholder="保存当前为预设..."
                                     value={newPresetName}
                                     onChange={e => setNewPresetName(e.target.value)}
                                     className="flex-1 border-2 border-gray-200 p-1.5 text-[10px] font-bold focus:border-black outline-none transition-all placeholder:text-gray-300"
                                 />
                                 <button 
                                     onClick={handleSavePreset}
                                     disabled={!newPresetName.trim()}
                                     className="bg-black text-white px-2 py-1.5 rounded-sm hover:bg-orange-600 disabled:bg-gray-300 transition-colors flex items-center gap-1"
                                 >
                                     <Save size={12}/>
                                     <span className="text-[9px] font-black">SAVE</span>
                                 </button>
                             </div>
                        </div>
                    </div>

                    {/* Preset List Panel (Sidecar) */}
                    {showPresetPanel && (
                        <div className="bg-white border-2 border-black border-l-0 p-4 hard-shadow-md w-64 animate-slide-in-left">
                             <div className="flex items-center justify-between mb-4 pb-2 border-b-2 border-black">
                                 <span className="font-black text-[11px] flex items-center gap-2 uppercase tracking-widest">
                                     <History size={14} className="text-blue-600"/> 预设列表
                                 </span>
                                 <button onClick={() => setShowPresetPanel(false)} className="text-gray-400 hover:text-black transition-colors"><Plus size={14} className="rotate-45"/></button>
                             </div>

                             <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1 custom-scrollbar">
                                 {colorPresets.length === 0 && (
                                     <div className="text-[9px] text-gray-400 italic text-center py-8 border border-dashed border-gray-200 bg-gray-50/50">
                                         暂无保存的预设
                                     </div>
                                 )}
                                 {colorPresets.map(preset => (
                                     <div key={preset.id} className="group relative bg-white border-2 border-gray-200 hover:border-black p-2 transition-all">
                                         <div className="flex items-center justify-between mb-2">
                                             <span className="text-[10px] font-black truncate max-w-[120px]">{preset.name}</span>
                                             <button 
                                                 onClick={() => handleDeletePreset(preset.id)}
                                                 className="text-gray-300 hover:text-red-500 transition-colors"
                                             >
                                                 <Trash2 size={12}/>
                                             </button>
                                         </div>
                                         <div 
                                            className="w-full h-2 border border-black/10 rounded-[1px] mb-2"
                                            style={{ background: getGradientCSS(preset.map) }}
                                         />
                                         <div className="flex items-center justify-between text-[9px] font-bold text-gray-500 mb-2">
                                             <span className={`px-1 rounded-sm ${preset.settings.mode === 'relative' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                                                 {preset.settings.mode === 'relative' ? '相对' : '绝对'}
                                             </span>
                                             <span className="mono bg-gray-100 px-1 rounded-sm">
                                                 {preset.settings.min} / {preset.settings.max}
                                             </span>
                                         </div>
                                         <button 
                                             onClick={() => handleApplyPreset(preset)}
                                             className="w-full py-1 bg-gray-100 hover:bg-black hover:text-white text-[9px] font-black transition-all"
                                         >
                                             应用配置
                                         </button>
                                     </div>
                                 ))}
                             </div>
                        </div>
                    )}
                  </div>
                )}
            </div>
            <div className="w-px bg-gray-200 mx-2" />
            <div className="flex border-2 border-black rounded-sm overflow-hidden hard-shadow-sm">
              <button onClick={() => setViewMode('height')} className={`px-3 py-2 text-xs font-bold transition-all duration-200 btn-press ${viewMode === 'height' ? 'bg-black text-white' : 'bg-white hover:bg-gray-100'}`}>高度图</button>
              <button onClick={() => setViewMode('gradient')} className={`flex items-center gap-1 px-3 py-2 text-xs font-bold transition-all duration-200 btn-press ${viewMode === 'gradient' ? 'bg-black text-white' : 'bg-white hover:bg-gray-100'}`}><Zap size={12} /> 梯度图</button>
              <button onClick={() => setViewMode('curvature')} className={`flex items-center gap-1 px-3 py-2 text-xs font-bold transition-all duration-200 btn-press ${viewMode === 'curvature' ? 'bg-black text-white' : 'bg-white hover:bg-gray-100'}`}><Activity size={12} /> 曲率图</button>
            </div>
            {(viewMode === 'gradient' || viewMode === 'curvature') && (
              <div className="flex border-2 border-black rounded-sm overflow-hidden animate-scale-in hard-shadow-sm">
                <button 
                  onClick={() => setMapDirection('x')} 
                  className={`px-3 py-2 text-[10px] font-black transition-all btn-press ${mapDirection === 'x' ? 'bg-[#ff4d00] text-white' : 'bg-white hover:bg-gray-100'}`}
                >X 方向</button>
                <button 
                  onClick={() => setMapDirection('y')} 
                  className={`px-3 py-2 text-[10px] font-black transition-all btn-press ${mapDirection === 'y' ? 'bg-[#ff4d00] text-white' : 'bg-white hover:bg-gray-100'}`}
                >Y 方向</button>
              </div>
            )}
            {pendingLayerKind && (
              <div className="flex items-center gap-2 px-2 py-1 border border-orange-300 bg-orange-50 text-[10px] font-black text-orange-700 animate-fade-in">
                <Loader2 size={12} className="animate-spin" />
                {pendingLayerKind === 'gradient' ? '梯度图后台计算中' : '曲率图后台计算中'}
              </div>
            )}
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
                activeLayer={activeLayer}
                activeMap={activeMap}
                tool={tool}
                boxSel={boxSel}
                lineSel={lineSel}
                chartAxis={chartAxis}
                chartTool={chartTool} 
                markers={markers}
                showMarkers={showMarkerList}
                showHoverInfo={showHoverInfo}
                selectedMarkerId={selectedMarkerId}
                colorSettings={colorSettings}
                tempMarker={tempMarker}
                hoverMarker={hoverMarker}
                measState={measState} 
                onSetMeasState={setMeasState}
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
        <div className="w-1/2 flex flex-col bg-white animate-slide-in-right border-l border-black">
          
          {/* Top Half: 3D View (50%) */}
          <div className="h-1/2 relative border-b-2 border-black bg-white">
            <ThreeDViewer 
                grid={grid}
                activeLayer={activeLayer}
                boxSel={boxSel} 
                lineSel={lineSel} 
                tool={tool} 
                colorMap={activeMap} 
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
          <div className="h-1/2 p-3 flex flex-col gap-2 bg-gray-50/50 backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity size={18} className="text-[#ff4d00]"/>
                <div className="flex flex-col -space-y-1">
                  <div className="text-[13px] font-black uppercase tracking-tight">信号剖面分析</div>
                  <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mono">Signal Analysis</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {tool === 'box' && (
                  <div className="flex border-2 border-black rounded-sm overflow-hidden hard-shadow-sm animate-fade-in bg-white">
                    <button onClick={() => setChartAxis('horizontal')} title="Horizontal Profile" className={`px-2 py-1 transition-all duration-200 btn-press ${chartAxis === 'horizontal' ? 'bg-black text-white' : 'hover:bg-gray-100'}`}><ArrowRightLeft size={14} /></button>
                    <button onClick={() => setChartAxis('vertical')} title="Vertical Profile" className={`px-2 py-1 transition-all duration-200 btn-press ${chartAxis === 'vertical' ? 'bg-black text-white' : 'hover:bg-gray-100'}`}><ArrowUpDown size={14} /></button>
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex-1 bg-white border-2 border-black hard-shadow-sm relative overflow-hidden transition-all duration-300" style={{ borderColor: THEME.border }}>
              <ProfileChart
                grid={grid}
                activeLayer={activeLayer}
                boxSel={boxSel}
                lineSel={lineSel}
                tool={tool}
                axis={chartAxis}
                chartTool={chartTool}
                measState={measState} 
                onSetMeasState={setMeasState} 
                onSetChartTool={setChartTool}
                onSetTool={setTool}
                onSetBoxSel={setBoxSel}
                onSetLineSel={setLineSel}
                onSetChartAxis={setChartAxis}
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
