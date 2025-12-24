import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Check, Save, RotateCw, Image as ImageIcon, Plus, Trash2, Maximize2, Palette, Grid3X3 } from 'lucide-react';
import { ConverterConfig, ConversionPreset, GridData } from '../types';
import { processImageToGrid } from '../utils/processUtils';
import { THEME } from '../constants';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { getColor } from '../utils/colorUtils';

interface PointCloudConverterProps {
    isOpen: boolean;
    onClose: () => void;
    imageSrc: string | null;
    onConfirm: (data: GridData) => void;
}

const PointCloudConverter: React.FC<PointCloudConverterProps> = ({ isOpen, onClose, imageSrc, onConfirm }) => {
    // --- State ---
    const [config, setConfig] = useState<ConverterConfig>({
        widthMM: 100,
        heightMM: 100,
        zScale: 10,
        stepX: 1,
        stepY: 1,
        rotation: 0,
        references: []
    });

    const [presets, setPresets] = useLocalStorage<ConversionPreset[]>("converter_presets", []);
    const [selectedPresetId, setSelectedPresetId] = useState<string>("");
    const [presetName, setPresetName] = useState("");

    const [previewData, setPreviewData] = useState<GridData | null>(null);
    const [previewMode, setPreviewMode] = useState<'gray' | 'heatmap'>('gray');
    const [isProcessing, setIsProcessing] = useState(false);
    const [showLargePreview, setShowLargePreview] = useState(false);

    // Canvas Interaction
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const imgRef = useRef<HTMLImageElement | null>(null);
    
    // We use this to force a re-render or effect trigger when image loads
    const [imgLoaded, setImgLoaded] = useState(false);
    
    const [transform, setTransform] = useState({ k: 1, x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const [isDrawing, setIsDrawing] = useState(false);
    const [dragStart, setDragStart] = useState<{x: number, y: number} | null>(null);
    const [newRoi, setNewRoi] = useState<{x: number, y: number, w: number, h: number} | null>(null);

    // Zoom Input State
    const [zoomInputValue, setZoomInputValue] = useState("100");
    const [isEditingZoom, setIsEditingZoom] = useState(false);

    // Sync input with transform
    useEffect(() => {
        if(!isEditingZoom) {
            setZoomInputValue(Math.round(transform.k * 100).toString());
        }
    }, [transform.k, isEditingZoom]);

    const handleManualZoom = () => {
        let v = parseFloat(zoomInputValue);
        if(isNaN(v) || v < 1) v = 100;
        setTransform(t => ({...t, k: v / 100}));
        setIsEditingZoom(false);
    }

    // --- Helper: Fit Image to Container ---
    const fitImageToContainer = useCallback(() => {
        if (!containerRef.current || !imgRef.current) return;
        const cw = containerRef.current.clientWidth;
        const ch = containerRef.current.clientHeight;
        const img = imgRef.current;
        
        // Safety check: Don't fit if container or image has no size yet
        if (cw === 0 || ch === 0 || img.width === 0 || img.height === 0) return;

        // Calculate Scale to fit with padding
        const padding = 40;
        const scale = Math.min((cw - padding) / img.width, (ch - padding) / img.height);
        
        // Center image
        const x = (cw - img.width * scale) / 2;
        const y = (ch - img.height * scale) / 2;
        
        setTransform({ k: scale, x, y });
    }, []);

    // --- Cleanup & Reset on Close ---
    useEffect(() => {
        if (!isOpen) {
            setPreviewData(null);
            setTransform({ k: 1, x: 0, y: 0 });
            setNewRoi(null);
            setDragStart(null);
            setIsProcessing(false);
            setShowLargePreview(false);
            setImgLoaded(false);
            imgRef.current = null;
        }
    }, [isOpen]);

    // --- Drawing ---
    const drawCanvas = useCallback(() => {
        const cvs = canvasRef.current;
        if (!cvs || !imgRef.current || !imgLoaded) return;
        const ctx = cvs.getContext('2d');
        if (!ctx) return;

        const cw = cvs.width;
        const ch = cvs.height;
        ctx.clearRect(0, 0, cw, ch);
        ctx.save();
        ctx.translate(transform.x, transform.y);
        ctx.scale(transform.k, transform.k);

        // Draw Image
        ctx.drawImage(imgRef.current, 0, 0);

        // Draw References
        config.references.forEach((ref, idx) => {
            ctx.strokeStyle = THEME.accent;
            ctx.lineWidth = 2 / transform.k;
            ctx.strokeRect(ref.x, ref.y, ref.w, ref.h);
            ctx.fillStyle = 'rgba(255, 0, 85, 0.2)';
            ctx.fillRect(ref.x, ref.y, ref.w, ref.h);
            
            // Label
            const fontSize = Math.max(12, 14 / transform.k);
            ctx.font = `bold ${fontSize}px monospace`;
            ctx.fillStyle = 'white';
            ctx.shadowColor = 'black';
            ctx.shadowBlur = 2;
            ctx.fillText(`#${idx+1} (${ref.offsetZ})`, ref.x, ref.y - 5/transform.k);
            ctx.shadowBlur = 0;
        });

        // Draw New ROI
        if (newRoi) {
            ctx.strokeStyle = THEME.primary;
            ctx.lineWidth = 2 / transform.k;
            ctx.strokeRect(newRoi.x, newRoi.y, newRoi.w, newRoi.h);
            ctx.fillStyle = 'rgba(255, 77, 0, 0.3)';
            ctx.fillRect(newRoi.x, newRoi.y, newRoi.w, newRoi.h);
        }

        ctx.restore();
    }, [config.references, newRoi, transform, imgLoaded]);

    // --- Resize Observer & Layout Management ---
    useEffect(() => {
        if (!containerRef.current || !canvasRef.current) return;
        
        let resizeTimer: number;

        const resizeObserver = new ResizeObserver(entries => {
            // Debounce/Throttle resize to prevent flicker
            cancelAnimationFrame(resizeTimer);
            resizeTimer = requestAnimationFrame(() => {
                for (const entry of entries) {
                    const { width, height } = entry.contentRect;
                    if (canvasRef.current && width > 0 && height > 0) {
                        // Only update if dimensions actually changed
                        if (canvasRef.current.width !== width || canvasRef.current.height !== height) {
                            canvasRef.current.width = width;
                            canvasRef.current.height = height;
                            
                            // Immediate redraw to prevent blank frame
                            drawCanvas();
                        }
                        
                        // Initial Fit: If image is loaded but we haven't fitted it (default k=1), try fit
                        // This catches the case where image loads before modal layout is ready
                        if (imgLoaded && transform.k === 1) {
                            fitImageToContainer();
                        }
                    }
                }
            });
        });

        resizeObserver.observe(containerRef.current);
        return () => {
            resizeObserver.disconnect();
            cancelAnimationFrame(resizeTimer);
        };
    }, [drawCanvas, fitImageToContainer, transform.k, imgLoaded]);

    // --- Load Image ---
    useEffect(() => {
        if (imageSrc) {
            const img = new Image();
            img.onload = () => {
                imgRef.current = img;
                setImgLoaded(true);
                fitImageToContainer();
            };
            img.src = imageSrc;
        }
    }, [imageSrc, fitImageToContainer]);

    // --- React to Transform/State Changes ---
    useEffect(() => {
        drawCanvas();
    }, [transform, newRoi, config.references, drawCanvas]);


    // --- Handlers ---
    const handleMouseDown = (e: React.MouseEvent) => {
        if (!canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        
        const scaleX = canvasRef.current.width / rect.width;
        const scaleY = canvasRef.current.height / rect.height;
        
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        if (e.button === 2 || e.button === 1 || e.shiftKey) { 
            setIsPanning(true);
            setDragStart({ x, y });
        } else if (e.button === 0) { 
            setIsDrawing(true);
            const imgX = (x - transform.x) / transform.k;
            const imgY = (y - transform.y) / transform.k;
            setDragStart({ x: imgX, y: imgY });
            setNewRoi({ x: imgX, y: imgY, w: 0, h: 0 });
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        
        const scaleX = canvasRef.current.width / rect.width;
        const scaleY = canvasRef.current.height / rect.height;

        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        if (isPanning && dragStart) {
            const dx = x - dragStart.x;
            const dy = y - dragStart.y;
            setTransform(t => ({ ...t, x: t.x + dx, y: t.y + dy }));
            setDragStart({ x, y });
        } else if (isDrawing && dragStart) {
            const imgX = (x - transform.x) / transform.k;
            const imgY = (y - transform.y) / transform.k;
            setNewRoi({
                x: Math.min(dragStart.x, imgX),
                y: Math.min(dragStart.y, imgY),
                w: Math.abs(imgX - dragStart.x),
                h: Math.abs(imgY - dragStart.y)
            });
        }
    };

    const handleMouseUp = () => {
        if (isDrawing && newRoi && newRoi.w > 5 && newRoi.h > 5) {
            setConfig(c => ({
                ...c,
                references: [...c.references, {
                    id: Date.now().toString(),
                    x: newRoi.x,
                    y: newRoi.y,
                    w: newRoi.w,
                    h: newRoi.h,
                    offsetZ: 0
                }]
            }));
        }
        setIsPanning(false);
        setIsDrawing(false);
        setDragStart(null);
        setNewRoi(null);
    };

    const handleWheel = (e: React.WheelEvent) => {
        const delta = e.deltaY < 0 ? 1.1 : 0.9;
        setTransform(t => ({ ...t, k: t.k * delta }));
    };

    // --- Processing ---
    const handleProcess = () => {
        if (!imgRef.current) return;
        setIsProcessing(true);
        
        const cvs = document.createElement('canvas');
        cvs.width = imgRef.current.width;
        cvs.height = imgRef.current.height;
        const ctx = cvs.getContext('2d');
        if (ctx) {
            ctx.drawImage(imgRef.current, 0, 0);
            const data = ctx.getImageData(0, 0, cvs.width, cvs.height);
            
            setTimeout(() => {
                const result = processImageToGrid(data, config);
                setPreviewData(result);
                setIsProcessing(false);
            }, 100);
        }
    };

    // --- Presets ---
    const handleSavePreset = () => {
        if (!presetName) return;
        setPresets(prev => {
            const idx = prev.findIndex(p => p.name === presetName);
            if (idx >= 0) {
                // Update existing
                const updated = [...prev];
                updated[idx] = { ...updated[idx], config: { ...config } };
                return updated;
            } else {
                // Create new
                const newPreset: ConversionPreset = {
                    id: Date.now().toString(),
                    name: presetName,
                    config: { ...config }
                };
                setSelectedPresetId(newPreset.id);
                return [...prev, newPreset];
            }
        });
    };

    const handleDeletePreset = () => {
        if (!selectedPresetId) return;
        setPresets(prev => prev.filter(p => p.id !== selectedPresetId));
        setSelectedPresetId("");
        setPresetName("");
    };

    const handleLoadPreset = (id: string) => {
        const p = presets.find(pre => pre.id === id);
        if (p) {
            setConfig(p.config);
            setSelectedPresetId(id);
            setPresetName(p.name);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white w-[95vw] h-[90vh] rounded-lg shadow-2xl flex flex-col overflow-hidden border border-gray-800">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50">
                    <div className="flex items-center gap-2">
                        <ImageIcon size={20} className="text-[#ff4d00]" />
                        <h2 className="text-lg font-bold">图片转点云转换器</h2>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full"><X size={20} /></button>
                </div>

                <div className="flex flex-1 overflow-hidden">
                    {/* Left: Image Canvas */}
                    <div className="w-2/3 bg-gray-900 relative overflow-hidden flex flex-col border-r border-gray-800">
                        <div className="absolute top-2 left-2 z-10 bg-black/50 text-white text-xs px-2 py-1 rounded backdrop-blur pointer-events-none">
                            左键绘制区域 (ROI) | 右键拖拽平移 | 滚轮缩放
                        </div>
                        
                        {/* Interactive Zoom Panel */}
                        <div className="absolute bottom-4 left-4 z-20 flex items-center gap-1 bg-black/60 backdrop-blur text-white p-1 rounded border border-white/20 shadow-lg">
                            <button onClick={fitImageToContainer} className="hover:bg-white/20 p-1 rounded" title="适应屏幕"><Maximize2 size={14}/></button>
                            <div className="w-px h-3 bg-white/30 mx-1"></div>
                            <input 
                                className="w-10 bg-transparent text-center text-xs font-mono focus:outline-none border-b border-transparent focus:border-white"
                                value={zoomInputValue}
                                onChange={e => setZoomInputValue(e.target.value)}
                                onFocus={() => setIsEditingZoom(true)}
                                onBlur={handleManualZoom}
                                onKeyDown={e => e.key === 'Enter' && handleManualZoom()}
                            />
                            <span className="text-[10px] pr-1">%</span>
                        </div>

                        <div ref={containerRef} className="flex-1 overflow-hidden relative select-none">
                            <canvas 
                                ref={canvasRef}
                                className="block cursor-crosshair"
                                onMouseDown={handleMouseDown}
                                onMouseMove={handleMouseMove}
                                onMouseUp={handleMouseUp}
                                onMouseLeave={handleMouseUp}
                                onWheel={handleWheel}
                                onContextMenu={(e) => e.preventDefault()}
                            />
                        </div>
                        
                        {/* Reference List */}
                        <div className="h-40 bg-white border-t border-gray-300 p-2 overflow-y-auto">
                            <h3 className="text-xs font-bold mb-2 flex items-center gap-2"><Plus size={12}/> 基准平面 (用于调平)</h3>
                            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                                {config.references.length === 0 && <div className="text-gray-400 text-xs italic col-span-full">未定义基准面，数据默认平整。</div>}
                                {config.references.map((ref, i) => (
                                    <div key={ref.id} className="flex items-center gap-2 text-xs border p-1 rounded bg-gray-50">
                                        <div className="font-bold w-6 text-center bg-gray-200 rounded">#{i+1}</div>
                                        <div className="flex-1 flex flex-col">
                                            <span className="text-[9px] text-gray-500">Z轴偏移</span>
                                            <input 
                                                type="number" step="0.001" 
                                                value={ref.offsetZ} 
                                                onChange={(e) => {
                                                    const val = parseFloat(e.target.value);
                                                    setConfig(c => ({...c, references: c.references.map(r => r.id === ref.id ? {...r, offsetZ: val} : r)}))
                                                }}
                                                className="w-full border px-1"
                                            />
                                        </div>
                                        <button onClick={() => setConfig(c => ({...c, references: c.references.filter(r => r.id !== ref.id)}))} className="text-red-500 hover:bg-red-100 p-1.5 rounded">
                                            <Trash2 size={12}/>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Right: Controls & Preview */}
                    <div className="w-1/3 bg-white flex flex-col min-w-[320px]">
                        {/* Config Panel */}
                        <div className="p-4 border-b border-gray-200 space-y-4 overflow-y-auto flex-1">
                            
                            {/* Preset Manager */}
                            <div className="p-3 bg-gray-50 border rounded">
                                <label className="text-xs font-bold block mb-1">配置预设</label>
                                <div className="flex gap-2">
                                    <select 
                                        value={selectedPresetId}
                                        onChange={(e) => handleLoadPreset(e.target.value)}
                                        className="flex-1 text-xs border p-1.5"
                                    >
                                        <option value="">-- 选择预设 --</option>
                                        {presets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                    </select>
                                    <button 
                                        onClick={handleDeletePreset} 
                                        disabled={!selectedPresetId}
                                        className={`p-1.5 rounded border ${!selectedPresetId ? 'text-gray-300 border-gray-200' : 'text-red-500 border-red-200 hover:bg-red-50'}`}
                                        title="删除配置"
                                    >
                                        <Trash2 size={14}/>
                                    </button>
                                </div>
                                <div className="flex gap-2 mt-2">
                                    <input 
                                        type="text" 
                                        placeholder="预设名称" 
                                        value={presetName}
                                        onChange={e => setPresetName(e.target.value)}
                                        className="flex-1 text-xs border p-1.5"
                                    />
                                    <button onClick={handleSavePreset} className="bg-gray-800 text-white text-xs px-3 py-1 rounded font-bold flex items-center gap-1">
                                        <Save size={12}/> 保存
                                    </button>
                                </div>
                            </div>

                            {/* Dimensions */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-bold block text-gray-500">原始宽度 (mm)</label>
                                    <input type="number" value={config.widthMM} onChange={e => setConfig({...config, widthMM: parseFloat(e.target.value)})} className="w-full border p-1.5 font-mono text-sm"/>
                                </div>
                                <div>
                                    <label className="text-xs font-bold block text-gray-500">原始高度 (mm)</label>
                                    <input type="number" value={config.heightMM} onChange={e => setConfig({...config, heightMM: parseFloat(e.target.value)})} className="w-full border p-1.5 font-mono text-sm"/>
                                </div>
                            </div>

                            {/* Z Scale */}
                            <div>
                                <label className="text-xs font-bold block text-gray-500">高度缩放 (mm/Max)</label>
                                <div className="flex items-center gap-2">
                                    <input type="number" step="0.1" value={config.zScale} onChange={e => setConfig({...config, zScale: parseFloat(e.target.value)})} className="w-full border p-1.5 font-mono text-sm"/>
                                    <span className="text-[10px] text-gray-400 whitespace-nowrap">最大亮度对应高度</span>
                                </div>
                            </div>

                            {/* Sampling */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-bold block text-gray-500">采样步长 X (px)</label>
                                    <input type="number" min="1" step="1" value={config.stepX} onChange={e => setConfig({...config, stepX: parseInt(e.target.value)})} className="w-full border p-1.5 font-mono text-sm"/>
                                </div>
                                <div>
                                    <label className="text-xs font-bold block text-gray-500">采样步长 Y (px)</label>
                                    <input type="number" min="1" step="1" value={config.stepY} onChange={e => setConfig({...config, stepY: parseInt(e.target.value)})} className="w-full border p-1.5 font-mono text-sm"/>
                                </div>
                            </div>

                            {/* Rotation */}
                            <div>
                                <label className="text-xs font-bold block text-gray-500 mb-1">旋转</label>
                                <div className="flex gap-2">
                                    {[0, 90, 180, -90].map(deg => (
                                        <button 
                                            key={deg}
                                            onClick={() => setConfig({...config, rotation: deg as any})}
                                            className={`flex-1 py-2 text-xs font-bold border rounded ${config.rotation === deg ? 'bg-[#ff4d00] text-white border-[#ff4d00]' : 'hover:bg-gray-100'}`}
                                        >
                                            {deg}°
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <button 
                                onClick={handleProcess}
                                disabled={isProcessing}
                                className="w-full py-3 bg-[#00a3cc] text-white font-bold rounded shadow hover:bg-[#008fb3] transition-colors flex items-center justify-center gap-2"
                            >
                                {isProcessing ? "处理中..." : "生成点云数据"}
                                {!isProcessing && <RotateCw size={16}/>}
                            </button>
                        </div>

                        {/* Preview Area (Fixed Height 250px) */}
                        <div className="h-[280px] bg-gray-100 border-t border-gray-200 relative flex flex-col shrink-0">
                            <div className="p-2 border-b bg-gray-200 text-xs font-bold flex justify-between items-center">
                                <span>预览</span>
                                {previewData && (
                                    <div className="flex items-center gap-2">
                                        <button 
                                            onClick={() => setPreviewMode('gray')} 
                                            className={`p-1 rounded ${previewMode==='gray'?'bg-white shadow':''}`} title="Grayscale"
                                        >
                                            <Grid3X3 size={12}/>
                                        </button>
                                        <button 
                                            onClick={() => setPreviewMode('heatmap')} 
                                            className={`p-1 rounded ${previewMode==='heatmap'?'bg-white shadow':''}`} title="Heatmap"
                                        >
                                            <Palette size={12}/>
                                        </button>
                                        <div className="w-px h-3 bg-gray-400 mx-1"></div>
                                        <span>Z范围: {previewData.minZ.toFixed(2)}~{previewData.maxZ.toFixed(2)}</span>
                                    </div>
                                )}
                            </div>
                            <div className="flex-1 relative flex items-center justify-center overflow-hidden group bg-gray-900">
                                {!previewData ? (
                                    <div className="text-gray-500 text-xs font-bold">暂无数据</div>
                                ) : (
                                    <>
                                        <PreviewCanvas data={previewData} mode={previewMode} />
                                        <button 
                                            onClick={() => setShowLargePreview(true)}
                                            className="absolute top-2 right-2 p-1.5 bg-black/60 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black"
                                            title="放大预览"
                                        >
                                            <Maximize2 size={16}/>
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Footer Action */}
                        <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-2 shrink-0">
                             <button onClick={onClose} className="px-4 py-2 text-gray-600 font-bold text-xs hover:bg-gray-200 rounded">取消</button>
                             <button 
                                onClick={() => previewData && onConfirm(previewData)}
                                disabled={!previewData}
                                className={`px-6 py-2 text-white font-bold text-xs rounded shadow flex items-center gap-2 ${!previewData ? 'bg-gray-300 cursor-not-allowed' : 'bg-[#ff4d00] hover:bg-[#e64600]'}`}
                             >
                                <Check size={16}/> 确认导入
                             </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Large Preview Overlay */}
            {showLargePreview && previewData && (
                <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-8 animate-in fade-in duration-200">
                    <div className="relative w-full h-full max-w-5xl max-h-[80vh] flex flex-col">
                        <button 
                            onClick={() => setShowLargePreview(false)} 
                            className="absolute -top-10 right-0 text-white hover:text-gray-300 flex items-center gap-2"
                        >
                            关闭 <X size={24}/>
                        </button>
                        <div className="flex-1 bg-black border border-gray-700 rounded overflow-hidden flex items-center justify-center">
                            <PreviewCanvas data={previewData} mode={previewMode} />
                        </div>
                        <div className="mt-4 text-center text-white font-mono text-xs">
                             预览模式: {previewMode.toUpperCase()} | 数据尺寸: {previewData.w}x{previewData.h}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// Preview Canvas Component
const PreviewCanvas = React.memo(({ data, mode }: { data: GridData, mode: 'gray' | 'heatmap' }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        const cvs = canvasRef.current;
        if (!cvs) return;
        const ctx = cvs.getContext('2d');
        if (!ctx) return;
        
        // Ensure canvas resolution matches grid size for 1:1 pixel mapping initially
        // We render to an offscreen canvas first
        const width = data.w;
        const height = data.h;
        const imgData = ctx.createImageData(width, height);
        const buf = new Uint32Array(imgData.data.buffer);
        const range = data.maxZ - data.minZ || 1;
        
        for (let i = 0; i < data.data.length; i++) {
            const val = (data.data[i] - data.minZ) / range;
            let r, g, b;

            if (mode === 'heatmap') {
                [r, g, b] = getColor(data.data[i], 'coolwarm', data.minZ, data.maxZ);
            } else {
                const c = Math.floor(val * 255);
                r = g = b = c;
            }
            buf[i] = (255 << 24) | (b << 16) | (g << 8) | r;
        }
        
        const temp = document.createElement('canvas');
        temp.width = width;
        temp.height = height;
        temp.getContext('2d')?.putImageData(imgData, 0, 0);
        
        // Now draw scaled to fit the display canvas
        // Get display size
        const displayW = cvs.clientWidth || 300;
        const displayH = cvs.clientHeight || 200;
        
        // Resize actual canvas buffer to match display to prevent blur if needed, or just standard drawing
        cvs.width = displayW;
        cvs.height = displayH;

        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, displayW, displayH);
        
        const scale = Math.min(displayW / width, displayH / height);
        const dx = (displayW - width * scale) / 2;
        const dy = (displayH - height * scale) / 2;
        
        ctx.drawImage(temp, dx, dy, width * scale, height * scale);
        
    }, [data, mode]);

    return <canvas ref={canvasRef} className="w-full h-full object-contain" />;
});

export default PointCloudConverter;