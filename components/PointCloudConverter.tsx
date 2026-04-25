import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { X, Check, Save, RotateCw, RotateCcw, Image as ImageIcon, Plus, Trash2, Maximize2, Palette, Grid3X3, FlipVertical, HelpCircle } from 'lucide-react';
import { ConverterConfig, ConversionPreset, GridData } from '../types';
import { processImageToGrid } from '../utils/processUtils';
import { THEME } from '../constants';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { getColor } from '../utils/colorUtils';

interface PointCloudConverterProps {
    isOpen: boolean;
    onClose: () => void;
    imageSrc: string | null;
    imageBuffer: ArrayBuffer | null;
    onConfirm: (data: GridData) => void;
}

const DEFAULT_CONFIG: ConverterConfig = {
    pixelSizeX: 0.01,
    pixelSizeY: 0.01,
    zScalePerGray: 0.001,
    stepX: 1,
    stepY: 1,
    rotation: 0,
    references: []
};

// Tooltip Component
const Tooltip = ({ title, content }: { title: string, content: string }) => (
    <div className="group relative inline-block ml-1 align-middle">
        <HelpCircle size={12} className="text-gray-400 cursor-help hover:text-[#ff4d00] transition-colors" />
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-48 p-2 bg-black text-white text-[10px] rounded hard-shadow-sm z-[100] pointer-events-none">
            <div className="font-black border-b border-white/20 pb-1 mb-1 uppercase tracking-tighter">{title}</div>
            <div className="font-medium text-gray-300 leading-relaxed">{content}</div>
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-black"></div>
        </div>
    </div>
);

const PointCloudConverter: React.FC<PointCloudConverterProps> = ({ isOpen, onClose, imageSrc, imageBuffer, onConfirm }) => {
    // --- State ---
    const [config, setConfig] = useState<ConverterConfig>(DEFAULT_CONFIG);

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
        if (!imageBuffer) return;
        setIsProcessing(true);
        
        setTimeout(() => {
            try {
                const result = processImageToGrid(imageBuffer, config);
                setPreviewData(result);
            } catch (err) {
                console.error("Processing failed:", err);
                alert("图像解析失败，请检查文件格式。");
            } finally {
                setIsProcessing(false);
            }
        }, 100);
    };

    // --- Presets ---
    const handleSavePreset = () => {
        const name = presetName.trim();
        if (!name) return;
        
        setPresets(prev => {
            // 1. Try to find by ID if we have one selected
            const byIdIdx = prev.findIndex(p => p.id === selectedPresetId);
            
            if (byIdIdx >= 0) {
                // Update existing by ID (allows renaming)
                const updated = [...prev];
                updated[byIdIdx] = { 
                    ...updated[byIdIdx], 
                    name: name, 
                    config: { ...config } 
                };
                return updated;
            } else {
                // 2. Try to find by name (to prevent duplicate names)
                const byNameIdx = prev.findIndex(p => p.name === name);
                if (byNameIdx >= 0) {
                    const updated = [...prev];
                    updated[byNameIdx] = { ...updated[byNameIdx], config: { ...config } };
                    setSelectedPresetId(updated[byNameIdx].id);
                    return updated;
                }

                // 3. Create new
                const newPreset: ConversionPreset = {
                    id: Date.now().toString(),
                    name: name,
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
        if (!id) {
            setSelectedPresetId("");
            setPresetName("");
            return;
        }
        const p = presets.find(pre => pre.id === id);
        if (p) {
            setConfig(p.config);
            setSelectedPresetId(id);
            setPresetName(p.name);
        }
    };

    const handleNewPreset = () => {
        setSelectedPresetId("");
        setPresetName(`预设 ${new Date().toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-')}`);
    };

    const handleResetConfig = () => {
        setConfig(DEFAULT_CONFIG);
        setSelectedPresetId("");
        setPresetName("");
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white w-[95vw] h-[90vh] border-2 border-black flex flex-col overflow-hidden hard-shadow-md">
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b-2 border-black bg-white dot-grid">
                    <div className="flex flex-col">
                        <span className="text-[10px] font-black text-[#ff4d00] uppercase tracking-tighter">数据导入器 / Data Importer</span>
                        <div className="flex items-center gap-2">
                            <ImageIcon size={20} className="text-[#ff4d00]" />
                            <h2 className="text-xl font-black text-gray-900 uppercase tracking-tighter">图片转点云转换器 / Image to Cloud</h2>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 border-2 border-black hover:bg-black hover:text-white transition-all btn-press">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex flex-1 overflow-hidden">
                    {/* Left: Image Canvas */}
                    <div className="w-2/3 bg-gray-900 relative overflow-hidden flex flex-col border-r-2 border-black">
                        <div className="absolute top-4 left-4 z-10 bg-black text-white text-[10px] font-black px-3 py-1.5 border-2 border-white/20 uppercase tracking-widest hard-shadow-sm">
                            左键绘制区域 (ROI) | 右键拖拽平移 | 滚轮缩放
                        </div>
                        
                        {/* Interactive Zoom Panel */}
                        <div className="absolute bottom-6 left-6 z-20 flex items-center gap-1 bg-white border-2 border-black p-1 hard-shadow-sm">
                            <button onClick={fitImageToContainer} className="hover:bg-gray-100 p-1.5 transition-colors btn-press" title="适应屏幕"><Maximize2 size={14}/></button>
                            <div className="w-px h-4 bg-gray-300 mx-1"></div>
                            <input 
                                className="w-12 bg-transparent text-center text-xs font-black mono focus:outline-none"
                                value={zoomInputValue}
                                onChange={e => setZoomInputValue(e.target.value)}
                                onFocus={() => setIsEditingZoom(true)}
                                onBlur={handleManualZoom}
                                onKeyDown={e => e.key === 'Enter' && handleManualZoom()}
                            />
                            <span className="text-[10px] font-black pr-2">%</span>
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
                        <div className="h-44 bg-white border-t-2 border-black p-4 overflow-y-auto dot-grid">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-xs font-black flex items-center gap-2 uppercase tracking-tighter">
                                    <Plus size={14} className="text-[#ff4d00]"/> 基准平面设置 / Reference Planes
                                    <Tooltip title="基准平面" content="在图像上框选已知高度的平整区域。系统将根据这些区域拟合出一个零水平面，消除原始图像的倾斜或整体偏移。" />
                                </h3>
                                {config.references.length > 0 && (
                                    <button onClick={() => setConfig(c => ({...c, references: []}))} className="text-[10px] font-black text-red-500 hover:bg-red-50 px-2 py-1 border border-red-500 transition-colors uppercase tracking-widest">
                                        全部清除
                                    </button>
                                )}
                            </div>
                            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                                {config.references.length === 0 && <div className="text-gray-400 text-xs font-bold italic col-span-full py-4 border-2 border-dashed border-gray-200 bg-gray-50/50 text-center">未定义基准面，数据默认平整。</div>}
                                {config.references.map((ref, i) => (
                                    <div key={ref.id} className="flex items-center gap-3 text-xs border-2 border-black p-2 bg-white hard-shadow-sm animate-scale-in">
                                        <div className="font-black w-8 h-8 flex items-center justify-center bg-black text-white text-[10px]">#{i+1}</div>
                                        <div className="flex-1 flex flex-col">
                                            <div className="flex items-center justify-between">
                                                <span className="text-[9px] font-black text-gray-400 uppercase tracking-tighter">高度偏移 (mm)</span>
                                                <Tooltip title="高度偏移 (Z-Offset)" content="该基准区域相对于理论零平面的物理高度。例如垫块厚度为1mm，则设为1。系统拟合时会减去此值。" />
                                            </div>
                                            <input 
                                                type="number" step="0.001" 
                                                value={ref.offsetZ} 
                                                onChange={(e) => {
                                                    const val = parseFloat(e.target.value);
                                                    setConfig(c => ({...c, references: c.references.map(r => r.id === ref.id ? {...r, offsetZ: val} : r)}))
                                                }}
                                                className="w-full border-b border-black font-black text-[11px] outline-none py-0.5"
                                            />
                                        </div>
                                        <button onClick={() => setConfig(c => ({...c, references: c.references.filter(r => r.id !== ref.id)}))} className="text-gray-400 hover:text-red-500 transition-colors p-1">
                                            <Trash2 size={14}/>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Right: Controls & Preview */}
                    <div className="w-1/3 bg-white flex flex-col min-w-[340px] dot-grid">
                        {/* Config Panel */}
                        <div className="p-6 border-b-2 border-black space-y-6 overflow-y-auto flex-1">
                            
                            {/* Preset Manager */}
                            <div className="p-4 bg-white border-2 border-black hard-shadow-sm">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-tighter block mb-2">参数预设 / Presets</label>
                                <div className="flex gap-2">
                                    <select 
                                        value={selectedPresetId}
                                        onChange={(e) => handleLoadPreset(e.target.value)}
                                        className="flex-1 text-xs font-bold border-2 border-black p-2 outline-none focus:bg-orange-50 transition-colors"
                                    >
                                        <option value="">-- 选择预设 --</option>
                                        {presets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                    </select>
                                    <button 
                                        onClick={handleNewPreset}
                                        className="p-2 border-2 border-black bg-white text-black hover:bg-gray-100 transition-all btn-press"
                                        title="新建预设"
                                    >
                                        <Plus size={14}/>
                                    </button>
                                    <button 
                                        onClick={handleDeletePreset} 
                                        disabled={!selectedPresetId}
                                        className={`p-2 border-2 border-black transition-all btn-press ${!selectedPresetId ? 'bg-gray-100 text-gray-300' : 'bg-white text-red-500 hover:bg-red-50'}`}
                                        title="删除配置"
                                    >
                                        <Trash2 size={14}/>
                                    </button>
                                </div>
                                <div className="flex gap-2 mt-3">
                                    <input 
                                        type="text" 
                                        placeholder="预设名称..." 
                                        value={presetName}
                                        onChange={e => setPresetName(e.target.value)}
                                        className="flex-1 text-xs font-bold border-2 border-black p-2 outline-none focus:bg-orange-50 transition-colors"
                                    />
                                    <button onClick={handleSavePreset} className="bg-black text-white text-[10px] px-4 py-2 font-black flex items-center gap-2 transition-all btn-press hard-shadow-sm uppercase">
                                        <Save size={12}/> {selectedPresetId ? "更新" : "保存"}
                                    </button>
                                </div>
                            </div>

                            {/* Dimensions */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-tighter mb-1 block">
                                        像素宽度 (mm/px)
                                        <Tooltip title="像素宽度" content="图像单个像素在 X 方向对应的实际物理尺寸（毫米）。影响点云在 X 轴的物理跨度。" />
                                    </label>
                                    <input type="number" step="0.0001" value={config.pixelSizeX} onChange={e => setConfig({...config, pixelSizeX: parseFloat(e.target.value)})} className="w-full border-2 border-black p-2 font-black mono text-xs focus:bg-orange-50 outline-none"/>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-tighter mb-1 block">
                                        像素高度 (mm/px)
                                        <Tooltip title="像素高度" content="图像单个像素在 Y 方向对应的实际物理尺寸（毫米）。影响点云在 Y 轴的物理跨度。" />
                                    </label>
                                    <input type="number" step="0.0001" value={config.pixelSizeY} onChange={e => setConfig({...config, pixelSizeY: parseFloat(e.target.value)})} className="w-full border-2 border-black p-2 font-black mono text-xs focus:bg-orange-50 outline-none"/>
                                </div>
                            </div>

                            {/* Z Scale */}
                            <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-tighter mb-1 block">
                                    Z轴比例 (mm/Gray)
                                    <Tooltip title="Z轴比例" content="单个灰度单位对应的物理高度。例如设为 0.001，则灰度值为 1000 的点物理高度为 1mm。直接决定地形起伏幅度。" />
                                </label>
                                <div className="flex items-center gap-3">
                                    <input type="number" step="0.00001" value={config.zScalePerGray} onChange={e => setConfig({...config, zScalePerGray: parseFloat(e.target.value)})} className="flex-1 border-2 border-black p-2 font-black mono text-xs focus:bg-orange-50 outline-none"/>
                                    <span className="text-[9px] text-gray-400 font-bold uppercase w-24 leading-tight italic">单灰度物理高度</span>
                                </div>
                            </div>

                            {/* Sampling */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-tighter mb-1 block">
                                        X采样步长 (px)
                                        <Tooltip title="X采样步长" content="横向每隔多少像素取一个点。数值越大，生成的点云越稀疏，处理速度越快。" />
                                    </label>
                                    <input type="number" min="1" step="1" value={config.stepX} onChange={e => setConfig({...config, stepX: parseInt(e.target.value)})} className="w-full border-2 border-black p-2 font-black mono text-xs focus:bg-orange-50 outline-none"/>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-tighter mb-1 block">
                                        Y采样步长 (px)
                                        <Tooltip title="Y采样步长" content="纵向每隔多少像素取一个点。数值越大，点云越稀疏。建议与X步长保持一致以避免拉伸。" />
                                    </label>
                                    <input type="number" min="1" step="1" value={config.stepY} onChange={e => setConfig({...config, stepY: parseInt(e.target.value)})} className="w-full border-2 border-black p-2 font-black mono text-xs focus:bg-orange-50 outline-none"/>
                                </div>
                            </div>

                            {/* Rotation */}
                            <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-tighter mb-2 block">
                                    图像旋转 / Orientation
                                    <Tooltip title="图像旋转" content="对输入图像进行 90° 倍数的旋转处理，以匹配实际物体的物理方位。" />
                                </label>
                                <div className="grid grid-cols-2 gap-2">
                                    {[
                                        { deg: 0, label: '0°', hint: '默认', icon: <ImageIcon size={14} /> },
                                        { deg: 90, label: '90°', hint: '顺时针', icon: <RotateCw size={14} /> },
                                        { deg: 180, label: '180°', hint: '翻转', icon: <FlipVertical size={14}/> },
                                        { deg: -90, label: '-90°', hint: '逆时针', icon: <RotateCcw size={14} /> }
                                    ].map(item => (
                                        <button 
                                            key={item.deg}
                                            onClick={() => setConfig({...config, rotation: item.deg as any})}
                                            className={`py-2 px-3 flex items-center justify-between border-2 transition-all btn-press ${config.rotation === item.deg ? 'bg-black text-white border-black hard-shadow-sm' : 'bg-white text-gray-900 border-black hover:bg-gray-50'}`}
                                        >
                                            <div className="flex items-center gap-2 font-black text-[11px] uppercase tracking-tighter">
                                                {item.icon} {item.label}
                                            </div>
                                            <div className={`text-[9px] font-bold uppercase tracking-widest ${config.rotation === item.deg ? 'text-[#ff4d00]' : 'text-gray-400'}`}>
                                                {item.hint}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="flex gap-2">
                                <button 
                                    onClick={handleResetConfig}
                                    className="flex-1 py-3 border-2 border-black font-black text-[10px] uppercase tracking-widest hover:bg-gray-100 transition-all btn-press"
                                >
                                    恢复默认
                                </button>
                                <button 
                                    onClick={handleProcess}
                                    disabled={isProcessing}
                                    className="flex-[2] py-4 bg-[#ff4d00] text-white font-black uppercase tracking-widest border-2 border-black hard-shadow-sm hover:bg-black transition-all btn-press flex items-center justify-center gap-3 disabled:opacity-50"
                                >
                                    {isProcessing ? "处理中..." : "生成预览数据"}
                                    {!isProcessing && <RotateCw size={18}/>}
                                </button>
                            </div>
                        </div>

                        {/* Preview Area (Fixed Height 250px) */}
                        <div className="h-[260px] bg-black border-t-2 border-black relative flex flex-col shrink-0">
                            <div className="p-2 border-b-2 border-black bg-black text-white text-[10px] font-black flex justify-between items-center tracking-widest uppercase">
                                <span>Preview / 数据预览</span>
                                {previewData && (
                                    <div className="flex items-center gap-3">
                                        <div className="flex border border-white/20 rounded-sm overflow-hidden">
                                            <button 
                                                onClick={() => setPreviewMode('gray')} 
                                                className={`p-1 px-2 transition-colors ${previewMode==='gray'?'bg-[#ff4d00] text-white':'hover:bg-white/10 text-gray-400'}`}
                                            >
                                                灰度
                                            </button>
                                            <button 
                                                onClick={() => setPreviewMode('heatmap')} 
                                                className={`p-1 px-2 transition-colors ${previewMode==='heatmap'?'bg-[#ff4d00] text-white':'hover:bg-white/10 text-gray-400'}`}
                                            >
                                                热力
                                            </button>
                                        </div>
                                        <span className="text-[#ff4d00] mono">Z: {previewData.minZ.toFixed(2)}~{previewData.maxZ.toFixed(2)}</span>
                                    </div>
                                )}
                            </div>
                            <div className="flex-1 relative flex items-center justify-center overflow-hidden group bg-[#111]">
                                {!previewData ? (
                                    <div className="text-gray-600 text-[10px] font-black uppercase tracking-widest animate-pulse">等待生成数据...</div>
                                ) : (
                                    <>
                                        <PreviewCanvas data={previewData} mode={previewMode} />
                                        <button 
                                            onClick={() => setShowLargePreview(true)}
                                            className="absolute top-4 right-4 p-2 bg-black text-white border border-white/20 hard-shadow-sm opacity-0 group-hover:opacity-100 transition-all hover:bg-[#ff4d00]"
                                            title="放大预览"
                                        >
                                            <Maximize2 size={16}/>
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Footer Action */}
                        <div className="p-5 border-t-2 border-black bg-white flex justify-end gap-3 shrink-0">
                             <button onClick={onClose} className="px-6 py-2 text-gray-400 font-black text-[10px] hover:text-black uppercase tracking-widest transition-colors">取消</button>
                             <button 
                                onClick={() => previewData && onConfirm(previewData)}
                                disabled={!previewData}
                                className={`flex items-center gap-3 px-8 py-3 text-white font-black text-xs border-2 border-black transition-all btn-press hard-shadow-sm uppercase tracking-widest ${!previewData ? 'bg-gray-200 border-gray-300 cursor-not-allowed text-gray-400' : 'bg-black hover:bg-[#ff4d00]'}`}
                             >
                                <Check size={20}/>
                                <span>确认导入数据</span>
                             </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Large Preview Overlay */}
            {showLargePreview && previewData && (
                <div className="fixed inset-0 z-[60] bg-black/95 flex items-center justify-center p-12 animate-fade-in">
                    <div className="relative w-full h-full max-w-6xl max-h-[85vh] flex flex-col">
                        <div className="flex items-center justify-between mb-4">
                            <div className="text-white font-black text-xs mono tracking-widest uppercase">
                                全屏预览 | {previewMode === 'gray' ? '灰度模式' : '热力模式'} | 分辨率: {previewData.w}x{previewData.h}
                            </div>
                            <button 
                                onClick={() => setShowLargePreview(false)} 
                                className="text-white hover:text-[#ff4d00] transition-colors flex items-center gap-2 font-black text-xs uppercase tracking-widest"
                            >
                                关闭 <X size={24}/>
                            </button>
                        </div>
                        <div className="flex-1 bg-black border-2 border-white/20 hard-shadow-md overflow-hidden flex items-center justify-center">
                            <PreviewCanvas data={previewData} mode={previewMode} />
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
    
    // Calculate 2th/98th range for heatmap (consistent with App.tsx relative mode)
    const displayRange = useMemo(() => {
        if (!data.data || data.data.length === 0) return { min: 0, max: 1 };
        const sorted = new Float32Array(data.data).sort();
        const minIdx = Math.floor(sorted.length * 0.02);
        const maxIdx = Math.floor(sorted.length * 0.98);
        return {
            min: sorted[minIdx] ?? data.minZ,
            max: sorted[maxIdx] ?? data.maxZ
        };
    }, [data.data, data.minZ, data.maxZ]);

    useEffect(() => {
        const cvs = canvasRef.current;
        if (!cvs) return;
        const ctx = cvs.getContext('2d');
        if (!ctx) return;
        
        const width = data.w;
        const height = data.h;
        const imgData = ctx.createImageData(width, height);
        const buf = new Uint32Array(imgData.data.buffer);
        
        // Gray range always uses full min/max for visibility
        const grayRange = data.maxZ - data.minZ || 1;
        // Heatmap range uses 2th/98th
        const heatMin = displayRange.min;
        const heatMax = displayRange.max;

        for (let i = 0; i < data.data.length; i++) {
            const z = data.data[i];
            let r, g, b;

            if (mode === 'heatmap') {
                [r, g, b] = getColor(z, 'coolwarm', heatMin, heatMax);
            } else {
                const val = (z - data.minZ) / grayRange;
                const c = Math.floor(Math.max(0, Math.min(1, val)) * 255);
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