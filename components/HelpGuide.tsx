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

const HelpGuide: React.FC<HelpGuideProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'basics' | '2d' | '3d' | 'analysis'>('basics');

  if (!isOpen) return null;

  const TabButton = ({ id, label, icon: Icon }: any) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`flex items-center gap-2 px-4 py-3 text-sm font-bold border-l-4 transition-all w-full text-left ${
        activeTab === id 
          ? 'border-[#ff4d00] bg-gray-50 text-black' 
          : 'border-transparent text-gray-500 hover:bg-gray-50'
      }`}
    >
      <Icon size={16} />
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-4xl h-[80vh] rounded-xl shadow-2xl flex overflow-hidden border border-gray-200">
        
        {/* Sidebar */}
        <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
          <div className="p-6 border-b border-gray-100">
            <h2 className="text-xl font-black tracking-tighter text-gray-800">
              使用 <span className="text-[#ff4d00]">说明书</span>
            </h2>
            <p className="text-[10px] text-gray-400 mt-1 font-mono uppercase">System Documentation</p>
          </div>
          <div className="flex-1 py-4">
            <TabButton id="basics" label="快速入门" icon={Zap} />
            <TabButton id="2d" label="2D 交互操作" icon={MousePointer2} />
            <TabButton id="3d" label="3D 可视化" icon={Box} />
            <TabButton id="analysis" label="数据分析工具" icon={Activity} />
          </div>
          <div className="p-4 bg-gray-50 text-[10px] text-gray-400 text-center">
            v3.0.0 - 专业版
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 flex flex-col bg-gray-50/50">
          <div className="flex justify-between items-center p-4 border-b border-gray-200 bg-white">
            <h3 className="text-lg font-bold text-gray-700 uppercase flex items-center gap-2">
              {activeTab === 'basics' && '快速上手指南'}
              {activeTab === '2d' && '2D 画布控制'}
              {activeTab === '3d' && '3D 视图控制'}
              {activeTab === 'analysis' && '高级分析功能'}
            </h3>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition-colors">
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-8 space-y-8">
            
            {/* --- BASICS TAB --- */}
            {activeTab === 'basics' && (
              <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                <div className="bg-blue-50 border border-blue-100 p-4 rounded-lg flex gap-4 items-start">
                  <div className="p-2 bg-blue-100 rounded text-blue-600"><Upload size={24}/></div>
                  <div>
                    <h4 className="font-bold text-blue-800 mb-1">1. 导入数据</h4>
                    <p className="text-sm text-blue-600 leading-relaxed">
                      首先点击右上角的按钮导入数据。支持 <strong>CSV 文件</strong> (X, Y, Z 格式的点云数据) 或 <strong>图片</strong>。
                      <br/>
                      <span className="text-xs opacity-80">* 图片转换器允许您定义物理尺寸并设置参考平面进行自动调平。</span>
                    </p>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-6">
                  <div className="bg-white p-5 rounded-lg border shadow-sm">
                    <h4 className="font-bold mb-3 flex items-center gap-2"><Box size={16} className="text-[#ff4d00]"/> 区域选择工具 (默认)</h4>
                    <p className="text-xs text-gray-500 mb-2">在 2D 地图上按住鼠标左键拖动，框选一个矩形感兴趣区域 (ROI)。</p>
                    <div className="text-[10px] bg-gray-100 p-2 rounded border border-gray-200">
                      <strong>效果：</strong> 右上角的 3D 视图和右下角的剖面分析图将立即更新，仅显示您框选区域的数据。
                    </div>
                  </div>
                  <div className="bg-white p-5 rounded-lg border shadow-sm">
                    <h4 className="font-bold mb-3 flex items-center gap-2"><Ruler size={16} className="text-[#00a3cc]"/> 划线测量工具</h4>
                    <p className="text-xs text-gray-500 mb-2">切换到“测量”模式。在 2D 地图上点击并拖动，绘制一条横截面线。</p>
                    <div className="text-[10px] bg-gray-100 p-2 rounded border border-gray-200">
                      <strong>效果：</strong> 右下角的图表将显示沿该路径的地形剖面（高程变化图）。
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* --- 2D INTERACTION TAB --- */}
            {activeTab === '2d' && (
              <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <KeyControl 
                        icon={<Mouse size={20}/>} 
                        title="缩放与平移" 
                        desc="滚动滚轮以光标为中心进行缩放。按住鼠标右键拖动（或使用平移工具）来移动画布。"
                    />
                    <KeyControl 
                        icon={<Crosshair size={20}/>} 
                        title="添加标记点" 
                        desc={<span>在 2D 地图任意位置按住 <strong className="text-[#ff4d00] bg-orange-50 px-1 rounded">Ctrl + 鼠标左键点击</strong>，即可添加一个永久的测量/注释标记。可在标记列表中重命名。</span>}
                    />
                    <KeyControl 
                        icon={<Maximize2 size={20}/>} 
                        title="精确缩放" 
                        desc="点击左下角状态栏的缩放比例数字，可以手动输入精确的放大倍数（例如 500%）。"
                    />
                    <KeyControl 
                        icon={<Layers size={20}/>} 
                        title="视图模式切换" 
                        desc="使用工具栏在“高度图”（原始 Z 值颜色）和“梯度图”（表面斜率变化率）之间切换。"
                    />
                </div>
                
                <div className="mt-4 p-4 bg-gray-100 rounded border border-gray-200">
                    <h4 className="font-bold text-sm mb-2">底部状态栏图例</h4>
                    <ul className="text-xs text-gray-600 space-y-1 font-mono">
                        <li><strong>ZOOM:</strong> 当前视图放大倍率 (最大 500x)。</li>
                        <li><strong>POS:</strong> 光标所在的像素网格坐标 (Grid X, Y)。</li>
                        <li><strong>(Real):</strong> 映射后的物理实际坐标 (如 mm)。</li>
                        <li><strong>Z:</strong> 光标位置的实时高度值。</li>
                    </ul>
                </div>
              </div>
            )}

            {/* --- 3D VIEW TAB --- */}
            {activeTab === '3d' && (
              <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                <h4 className="font-bold text-lg border-b pb-2">3D 视角导航</h4>
                <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="p-4 border rounded bg-white">
                        <div className="font-bold text-[#ff4d00] mb-1">左键拖动</div>
                        <div className="text-xs text-gray-500">旋转视角</div>
                    </div>
                    <div className="p-4 border rounded bg-white">
                        <div className="font-bold text-[#ff4d00] mb-1">右键拖动</div>
                        <div className="text-xs text-gray-500">平移视角</div>
                    </div>
                    <div className="p-4 border rounded bg-white">
                        <div className="font-bold text-[#ff4d00] mb-1">滚轮滚动</div>
                        <div className="text-xs text-gray-500">缩放视图</div>
                    </div>
                </div>

                <div className="bg-orange-50 border border-orange-100 p-4 rounded flex gap-4">
                    <div className="p-2 bg-white rounded shadow-sm text-orange-600 h-fit"><Keyboard size={20}/></div>
                    <div>
                        <h4 className="font-bold text-orange-800">专家技巧：Z 轴锁定旋转</h4>
                        <p className="text-sm text-orange-700 mt-1">
                            在旋转视图时按住键盘 <code className="bg-white px-1 rounded border border-orange-200 font-bold">ALT</code> 键，可以锁定仰角。
                            这会产生类似“转盘”的效果，非常适合水平检查侧面轮廓缺陷。
                        </p>
                    </div>
                </div>

                <div>
                    <h4 className="font-bold text-sm mb-2">视觉增强设置</h4>
                    <p className="text-xs text-gray-600 mb-2">点击 3D 视图左上角的 <Settings size={12} className="inline"/> 图标。</p>
                    <ul className="list-disc list-inside text-xs text-gray-600 space-y-1">
                        <li><strong>对比度 (Intensity):</strong> 夸大 Z 轴高度的显示比例，让微小的表面起伏变得清晰可见。</li>
                        <li><strong>增强颜色 (Enhance Color):</strong> 控制对比度调整是否同时增强颜色映射的对比度。</li>
                        <li><strong>最大限制 (Max Limit):</strong> 设置对比度滑块的上限，用于极微小特征的分析。</li>
                    </ul>
                </div>
              </div>
            )}

            {/* --- ANALYSIS TAB --- */}
            {activeTab === 'analysis' && (
              <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                 <div className="border rounded-lg overflow-hidden">
                    <div className="bg-gray-100 p-3 font-bold text-sm border-b">剖面图表分析工具</div>
                    <div className="divide-y">
                        <AnalysisRow 
                            icon={<MousePointer2 size={16}/>} 
                            name="检查模式 (Inspect)" 
                            desc="悬停在图表曲线上，2D 和 3D 视图会同步显示对应的“十字准星”位置。点击图表可冻结一个临时标记点。" 
                        />
                        <AnalysisRow 
                            icon={<MoveVertical size={16}/>} 
                            name="Z 高度测量" 
                            desc="在图表上点击两个点，测量它们之间的垂直高度差 (ΔZ)。支持在 2D 地图上移动鼠标并按 'T' 键选取测量点。" 
                        />
                        <AnalysisRow 
                            icon={<MoveHorizontal size={16}/>} 
                            name="XY 距离测量" 
                            desc="在图表上点击两个点，测量它们沿剖面路径的水平距离 (ΔXY)。支持在 2D 地图上移动鼠标并按 'T' 键选取测量点。" 
                        />
                        <AnalysisRow 
                            icon={<Activity size={16}/>} 
                            name="点到线偏差 (平面度)" 
                            desc="先点击两点定义参考基准线，然后点击任意点计算其到基准线的垂直距离。支持在 2D 地图上移动鼠标并按 'T' 键选取。" 
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

const KeyControl = ({ icon, title, desc }: any) => (
    <div className="flex gap-3 p-3 rounded-lg border border-gray-100 bg-white hover:border-gray-300 transition-colors">
        <div className="text-gray-400 mt-1">{icon}</div>
        <div>
            <div className="font-bold text-sm text-gray-800">{title}</div>
            <div className="text-xs text-gray-500 leading-snug mt-1">{desc}</div>
        </div>
    </div>
);

const AnalysisRow = ({ icon, name, desc }: any) => (
    <div className="flex items-center gap-4 p-4 bg-white hover:bg-gray-50 transition-colors">
        <div className="p-2 bg-gray-100 rounded text-gray-700">{icon}</div>
        <div className="flex-1">
            <div className="font-bold text-sm">{name}</div>
            <div className="text-xs text-gray-500 mt-0.5">{desc}</div>
        </div>
    </div>
);

export default HelpGuide;