import React, { useState } from 'react';
import { 
  X, MousePointer2, Move, Box, Ruler, Zap, Activity, 
  Keyboard, Layers, Mouse, Upload, Maximize2, Crosshair,
  Settings, MoveVertical, MoveHorizontal
} from 'lucide-react';
import { THEME } from '../constants';

interface HelpGuideProps {
  isOpen: boolean;
  onClose: () => void;
}

const KeyControl = ({ icon, title, desc }: any) => (
    <div className="flex gap-4 p-6 border-2 border-black bg-white hard-shadow-sm hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none transition-all">
        <div className="text-gray-400 mt-1">{icon}</div>
        <div>
            <div className="font-black text-sm text-black uppercase tracking-tighter">{title}</div>
            <div className="text-[11px] font-bold text-gray-500 leading-snug mt-2">{desc}</div>
        </div>
    </div>
);

const AnalysisRow = ({ icon, name, desc }: any) => (
    <div className="flex items-center gap-6 p-6 bg-white hover:bg-gray-50 transition-colors">
        <div className="p-3 bg-black text-white border-2 border-black">{icon}</div>
        <div className="flex-1">
            <div className="font-black text-sm text-black uppercase tracking-tighter">{name}</div>
            <div className="text-[11px] font-bold text-gray-500 mt-1">{desc}</div>
        </div>
    </div>
);

const HelpGuide: React.FC<HelpGuideProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'basics' | '2d' | '3d' | 'analysis'>('basics');

  if (!isOpen) return null;

  const TabButton = ({ id, label, icon: Icon }: any) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`flex items-center gap-3 px-4 py-4 text-xs font-black border-l-4 transition-all w-full text-left uppercase tracking-widest ${
        activeTab === id 
          ? 'border-[#ff4d00] bg-black text-white' 
          : 'border-transparent text-gray-400 hover:bg-gray-100'
      }`}
    >
      <Icon size={14} className={activeTab === id ? 'text-[#ff4d00]' : ''} />
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white w-full max-w-5xl h-[85vh] border-2 border-black flex overflow-hidden hard-shadow-md">
        
        {/* Sidebar */}
        <div className="w-64 bg-white border-r-2 border-black flex flex-col">
          <div className="p-8 border-b-2 border-black bg-white dot-grid">
            <h2 className="text-xl font-black tracking-tighter text-gray-900 logo-glow">
              使用 <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#ff4d00] to-red-600">说明书</span>
            </h2>
            <div className="flex items-center gap-2 mt-2">
                <span className="text-[10px] font-black text-white bg-black px-1.5 py-0.5 rounded-sm mono">DOCS</span>
                <span className="text-[9px] text-gray-400 font-bold uppercase tracking-tighter">System Documentation</span>
            </div>
          </div>
          <div className="flex-1 py-4">
            <TabButton id="basics" label="快速入门" icon={Zap} />
            <TabButton id="2d" label="2D 交互操作" icon={MousePointer2} />
            <TabButton id="3d" label="3D 可视化" icon={Box} />
            <TabButton id="analysis" label="数据分析工具" icon={Activity} />
          </div>
          <div className="p-4 bg-gray-50 border-t border-gray-100 text-[10px] font-bold text-gray-400 text-center mono uppercase tracking-widest">
            PRO EDITION v3.0.4
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 flex flex-col bg-white dot-grid">
          <div className="flex justify-between items-center p-6 border-b-2 border-black bg-white/80 backdrop-blur-sm">
            <div className="flex flex-col">
                <span className="text-[10px] font-black text-[#ff4d00] uppercase tracking-tighter">Technical Manual</span>
                <h3 className="text-xl font-black text-gray-900 uppercase tracking-tighter">
                    {activeTab === 'basics' && '快速上手指南 / Getting Started'}
                    {activeTab === '2d' && '2D 画布控制 / 2D Canvas Control'}
                    {activeTab === '3d' && '3D 视图控制 / 3D Visualization'}
                    {activeTab === 'analysis' && '高级分析功能 / Advanced Analysis'}
                </h3>
            </div>
            <button onClick={onClose} className="p-2 border-2 border-black hover:bg-black hover:text-white transition-all btn-press">
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-10 space-y-10 custom-scrollbar">
            
            {/* --- BASICS TAB --- */}
            {activeTab === 'basics' && (
              <div className="space-y-8 animate-scale-in">
                <div className="bg-white border-2 border-black p-6 hard-shadow-sm flex gap-6 items-start">
                  <div className="p-3 bg-black text-[#ff4d00] border-2 border-black"><Upload size={24}/></div>
                  <div>
                    <h4 className="font-black text-lg text-black mb-1">1. 导入数据 / Import Data</h4>
                    <p className="text-sm text-gray-600 leading-relaxed font-medium">
                      首先点击右上角的按钮导入数据。支持 <strong>CSV 文件</strong> (X, Y, Z 格式的点云数据) 或 <strong>图片</strong>。
                      <br/>
                      <span className="text-xs text-gray-400 font-bold">* 图片转换器允许您定义物理尺寸并设置参考平面进行自动调平。</span>
                    </p>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-8">
                  <div className="bg-white p-6 border-2 border-black hard-shadow-sm">
                    <h4 className="font-black text-sm mb-4 flex items-center gap-2 uppercase tracking-tighter"><Box size={18} className="text-[#ff4d00]"/> 区域选择工具 / ROI Selection</h4>
                    <p className="text-xs font-bold text-gray-500 mb-4 leading-relaxed">在 2D 地图上按住鼠标左键拖动，框选一个矩形感兴趣区域 (ROI)。</p>
                    <div className="text-[11px] font-bold bg-gray-50 p-4 border-l-4 border-black text-gray-700 leading-relaxed">
                      <strong>效果：</strong> 右上角的 3D 视图和右下角的剖面分析图将立即更新，仅显示您框选区域的数据。
                    </div>
                  </div>
                  <div className="bg-white p-6 border-2 border-black hard-shadow-sm">
                    <h4 className="font-black text-sm mb-4 flex items-center gap-2 uppercase tracking-tighter"><Ruler size={18} className="text-[#00a3cc]"/> 划线测量工具 / Path Profile</h4>
                    <p className="text-xs font-bold text-gray-500 mb-4 leading-relaxed">切换到“测量”模式。在 2D 地图上点击并拖动，绘制一条横截面线。</p>
                    <div className="text-[11px] font-bold bg-gray-50 p-4 border-l-4 border-black text-gray-700 leading-relaxed">
                      <strong>效果：</strong> 右下角的图表将显示沿该路径的地形剖面（高程变化图）。
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* --- 2D INTERACTION TAB --- */}
            {activeTab === '2d' && (
              <div className="space-y-8 animate-scale-in">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <KeyControl 
                        icon={<Mouse size={24}/>} 
                        title="缩放与平移" 
                        desc="滚动滚轮以光标为中心进行缩放。按住鼠标右键拖动（或使用平移工具）来移动画布。"
                    />
                    <KeyControl 
                        icon={<Crosshair size={24}/>} 
                        title="添加标记点" 
                        desc={<span>在 2D 地图任意位置按住 <strong className="text-white bg-black px-1.5 py-0.5 rounded-sm mono text-[10px]">CTRL + LEFT CLICK</strong>，即可添加一个永久的测量/注释标记。可在标记列表中重命名。</span>}
                    />
                    <KeyControl 
                        icon={<Maximize2 size={24}/>} 
                        title="精确缩放" 
                        desc="点击左下角状态栏的缩放比例数字，可以手动输入精确的放大倍数（例如 500%）。"
                    />
                    <KeyControl 
                        icon={<Layers size={24}/>} 
                        title="视图模式切换" 
                        desc="使用工具栏在“高度图”（原始 Z 值颜色）和“梯度图”（表面斜率变化率）之间切换。"
                    />
                </div>
                
                <div className="bg-black text-white p-6 border-2 border-black hard-shadow-sm">
                    <h4 className="font-black text-xs mb-4 uppercase tracking-widest text-[#ff4d00]">底部状态栏图例 / Status Bar Legend</h4>
                    <div className="grid grid-cols-2 gap-4">
                        <ul className="text-[10px] font-bold space-y-2 mono uppercase">
                            <li><span className="text-gray-400">ZOOM:</span> 当前视图放大倍率</li>
                            <li><span className="text-gray-400">POS:</span> 像素网格坐标 (X, Y)</li>
                        </ul>
                        <ul className="text-[10px] font-bold space-y-2 mono uppercase">
                            <li><span className="text-gray-400">(Real):</span> 物理实际坐标</li>
                            <li><span className="text-gray-400">Z:</span> 光标位置实时高度</li>
                        </ul>
                    </div>
                </div>
              </div>
            )}

            {/* --- 3D VIEW TAB --- */}
            {activeTab === '3d' && (
              <div className="space-y-8 animate-scale-in">
                <h4 className="font-black text-xl uppercase tracking-tighter border-b-2 border-black pb-2">3D 视角导航 / Navigation</h4>
                <div className="grid grid-cols-3 gap-6">
                    <div className="p-6 border-2 border-black bg-white hard-shadow-sm flex flex-col items-center">
                        <div className="font-black text-sm text-[#ff4d00] mb-2 uppercase tracking-widest">Left Click</div>
                        <div className="text-[10px] font-bold text-gray-500">旋转视角 / ROTATE</div>
                    </div>
                    <div className="p-6 border-2 border-black bg-white hard-shadow-sm flex flex-col items-center">
                        <div className="font-black text-sm text-[#ff4d00] mb-2 uppercase tracking-widest">Right Click</div>
                        <div className="text-[10px] font-bold text-gray-500">平移视角 / PAN</div>
                    </div>
                    <div className="p-6 border-2 border-black bg-white hard-shadow-sm flex flex-col items-center">
                        <div className="font-black text-sm text-[#ff4d00] mb-2 uppercase tracking-widest">Scroll</div>
                        <div className="text-[10px] font-bold text-gray-500">缩放视图 / ZOOM</div>
                    </div>
                </div>

                <div className="bg-[#ff4d00] text-white p-6 border-2 border-black hard-shadow-sm flex gap-6">
                    <div className="p-3 bg-black text-white border-2 border-black h-fit"><Keyboard size={24}/></div>
                    <div>
                        <h4 className="font-black text-lg uppercase tracking-widest">Z 轴锁定旋转 / Z-Axis Lock</h4>
                        <p className="text-sm font-bold mt-2 leading-relaxed">
                            在旋转视图时按住键盘 <code className="bg-black px-1.5 py-0.5 rounded-sm mono text-xs">ALT</code> 键，可以锁定仰角。
                            这会产生类似“转盘”的效果，非常适合水平检查侧面轮廓缺陷。
                        </p>
                    </div>
                </div>

                <div className="bg-white border-2 border-black p-6 hard-shadow-sm">
                    <h4 className="font-black text-sm mb-4 flex items-center gap-2 uppercase tracking-tighter">视觉增强设置 / Enhancement</h4>
                    <p className="text-xs font-bold text-gray-500 mb-4">点击 3D 视图左上角的 <Settings size={14} className="inline text-black"/> 图标。</p>
                    <ul className="grid grid-cols-2 gap-4 text-[11px] font-bold text-gray-700">
                        <li className="flex gap-2 items-start"><span className="text-[#ff4d00] mt-1">●</span> <strong>对比度 (Intensity):</strong> 夸大 Z 轴高度显示比例</li>
                        <li className="flex gap-2 items-start"><span className="text-[#ff4d00] mt-1">●</span> <strong>增强颜色:</strong> 同步增强颜色映射对比</li>
                    </ul>
                </div>
              </div>
            )}

            {/* --- ANALYSIS TAB --- */}
            {activeTab === 'analysis' && (
              <div className="space-y-8 animate-scale-in">
                 <div className="border-2 border-black hard-shadow-sm overflow-hidden bg-white">
                    <div className="bg-black text-white p-4 font-black text-xs uppercase tracking-widest border-b-2 border-black flex items-center gap-3">
                        <Activity size={18} className="text-[#ff4d00]" /> 剖面图表分析工具 / Signal Analysis
                    </div>
                    <div className="divide-y-2 divide-gray-100">
                        <AnalysisRow 
                            icon={<MousePointer2 size={18}/>} 
                            name="检查模式 (Inspect)" 
                            desc="悬停在图表曲线上，2D 和 3D 视图会同步显示。点击图表可冻结一个临时标记点。" 
                        />
                        <AnalysisRow 
                            icon={<MoveVertical size={18}/>} 
                            name="Z 高度测量" 
                            desc="测量垂直高度差 (ΔZ)。支持在 2D 地图上按 'T' 键选取。" 
                        />
                        <AnalysisRow 
                            icon={<MoveHorizontal size={18}/>} 
                            name="XY 距离测量" 
                            desc="测量水平距离 (ΔXY)。支持在 2D 地图上按 'T' 键选取。" 
                        />
                        <AnalysisRow 
                            icon={<Activity size={18}/>} 
                            name="点到线偏差 (平面度)" 
                            desc="定义参考基准线，计算点到线的垂直距离。" 
                        />
                    </div>
                 </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
};

export default HelpGuide;