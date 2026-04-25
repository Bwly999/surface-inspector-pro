import React, { useState } from 'react';
import { 
  X, MousePointer2, Move, Box, Ruler, Zap, Activity, 
  Keyboard, Layers, Mouse, Upload, Maximize2, Crosshair,
  Settings, MoveVertical, MoveHorizontal, History
} from 'lucide-react';

interface HelpGuideProps {
  isOpen: boolean;
  onClose: () => void;
}

const KeyControl = ({ icon, title, desc }: any) => (
    <div className="flex gap-4 p-6 border border-[#eae4dc] bg-white rounded-xl transition-all duration-300 hover:bg-[#f3ece5]/30">
        <div className="text-[#7a7571] mt-1">{icon}</div>
        <div>
            <div className="font-bold text-sm text-[#2d2d2d] tracking-tight">{title}</div>
            <div className="text-[12px] font-medium text-[#7a7571] leading-relaxed mt-2">{desc}</div>
        </div>
    </div>
);

const AnalysisRow = ({ icon, name, desc }: any) => (
    <div className="flex items-center gap-6 p-6 bg-white hover:bg-[#faf8f5] transition-colors duration-200">
        <div className="p-3 bg-[#f3ece5] text-[#d97757] rounded-full">{icon}</div>
        <div className="flex-1">
            <div className="font-bold text-sm text-[#2d2d2d] tracking-tight">{name}</div>
            <div className="text-[12px] font-medium text-[#7a7571] mt-1">{desc}</div>
        </div>
    </div>
);

const HelpGuide: React.FC<HelpGuideProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'basics' | '2d' | '3d' | 'analysis'>('basics');

  if (!isOpen) return null;

  const TabButton = ({ id, label, icon: Icon }: any) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`flex items-center gap-3 px-5 py-3 text-xs font-bold rounded-full transition-all duration-300 ${
        activeTab === id 
          ? 'bg-[#d97757] text-white shadow-lg shadow-[#d97757]/20' 
          : 'text-[#7a7571] hover:bg-[#f3ece5] hover:text-[#2d2d2d]'
      }`}
    >
      <Icon size={14} />
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[100] bg-[#2d2d2d]/10 backdrop-blur-[4px] flex items-center justify-center p-4 animate-in fade-in duration-500">
      <div className="bg-[#faf8f5] w-full max-w-5xl h-[85vh] rounded-3xl flex overflow-hidden shadow-2xl shadow-[#2d2d2d]/5 border border-[#eae4dc]">
        
        {/* Sidebar */}
        <div className="w-64 bg-[#f3ece5]/40 border-r border-[#eae4dc] flex flex-col">
          <div className="p-10 border-b border-[#eae4dc] bg-[#faf8f5]/50">
            <h2 className="text-2xl font-serif text-[#2d2d2d]">
              使用 <span className="text-[#d97757]">说明书</span>
            </h2>
            <div className="flex items-center gap-2 mt-3">
                <span className="text-[10px] font-bold text-[#d97757] border border-[#d97757]/30 px-2 py-0.5 rounded-full mono">DOCS</span>
                <span className="text-[9px] text-[#7a7571] font-bold uppercase tracking-widest">User Manual</span>
            </div>
          </div>
          <div className="flex-1 p-6 flex flex-col gap-2">
            <TabButton id="basics" label="快速入门" icon={Zap} />
            <TabButton id="2d" label="2D 交互操作" icon={MousePointer2} />
            <TabButton id="3d" label="3D 可视化" icon={Box} />
            <TabButton id="analysis" label="数据分析工具" icon={Activity} />
          </div>
          <div className="p-8 text-[10px] font-bold text-[#eae4dc] text-center mono uppercase tracking-widest">
            PRO EDITION v3.3
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 flex flex-col bg-[#faf8f5]">
          <div className="flex justify-between items-center p-10 border-b border-[#eae4dc]/50 bg-[#faf8f5]/80 backdrop-blur-md sticky top-0 z-10">
            <div className="flex flex-col">
                <span className="text-[10px] font-bold text-[#d97757] uppercase tracking-widest mb-1">Technical Manual</span>
                <h3 className="text-3xl font-serif text-[#2d2d2d]">
                    {activeTab === 'basics' && '快速上手指南'}
                    {activeTab === '2d' && '2D 画布控制'}
                    {activeTab === '3d' && '3D 视图控制'}
                    {activeTab === 'analysis' && '高级分析功能'}
                </h3>
            </div>
            <button 
              onClick={onClose} 
              className="p-3 rounded-full hover:bg-[#f3ece5] text-[#7a7571] transition-all duration-300"
            >
              <X size={24} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-12 space-y-14 scroll-smooth">
            
            {/* --- BASICS TAB --- */}
            {activeTab === 'basics' && (
              <div className="space-y-12 animate-in fade-in slide-in-from-bottom-8 duration-700">
                <div className="bg-[#f3ece5]/30 rounded-2xl p-10 border border-[#eae4dc] flex gap-10 items-start">
                  <div className="p-5 bg-white text-[#d97757] rounded-xl shadow-sm border border-[#eae4dc]"><Upload size={32}/></div>
                  <div>
                    <h4 className="font-bold text-xl text-[#2d2d2d] mb-3">1. 导入数据 / Import Data</h4>
                    <p className="text-base text-[#7a7571] leading-relaxed font-medium max-w-2xl">
                      点击右上角的按钮导入数据。支持 <strong className="text-[#2d2d2d] font-bold underline decoration-[#d97757]/30 decoration-2 underline-offset-4">CSV 文件</strong> 或 <strong className="text-[#2d2d2d] font-bold underline decoration-[#d97757]/30 decoration-2 underline-offset-4">图片</strong>。
                      <br/>
                      <span className="text-sm text-[#7a7571]/70 font-medium mt-4 block italic leading-relaxed">* 图片转换器允许您定义物理尺寸并设置参考平面进行自动调平。</span>
                    </p>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-10">
                  <div className="bg-white p-10 rounded-2xl border border-[#eae4dc] shadow-sm hover:bg-[#f3ece5]/20 transition-all duration-300">
                    <h4 className="font-bold text-lg text-[#2d2d2d] mb-5 flex items-center gap-3"><Box size={22} className="text-[#d97757]"/> 区域选择工具</h4>
                    <p className="text-sm font-medium text-[#7a7571] mb-8 leading-relaxed">在 2D 地图上按住鼠标左键拖动，框选一个矩形感兴趣区域 (ROI)。</p>
                    <div className="text-[13px] font-medium bg-[#f3ece5]/40 p-6 rounded-xl border-l-4 border-[#d97757] text-[#2d2d2d] leading-relaxed">
                      <strong>效果：</strong> 3D 视图和剖面分析图将立即更新，仅显示您框选区域的数据。
                    </div>
                  </div>
                  <div className="bg-white p-10 rounded-2xl border border-[#eae4dc] shadow-sm hover:bg-[#f3ece5]/20 transition-all duration-300">
                    <h4 className="font-bold text-lg text-[#2d2d2d] mb-5 flex items-center gap-3"><Ruler size={22} className="text-[#d97757]"/> 划线测量工具</h4>
                    <p className="text-sm font-medium text-[#7a7571] mb-8 leading-relaxed">切换到“测量”模式。在 2D 地图上点击并拖动，绘制一条横截面线。</p>
                    <div className="text-[13px] font-medium bg-[#f3ece5]/40 p-6 rounded-xl border-l-4 border-[#d97757] text-[#2d2d2d] leading-relaxed">
                      <strong>效果：</strong> 图表将显示沿该路径的地形剖面（高程变化图）。
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* --- 2D INTERACTION TAB --- */}
            {activeTab === '2d' && (
              <div className="space-y-10 animate-in fade-in slide-in-from-bottom-8 duration-700">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <KeyControl 
                        icon={<Mouse size={24}/>} 
                        title="缩放与平移" 
                        desc="滚动滚轮以光标为中心进行缩放。按住鼠标右键拖动（或使用平移工具）来移动画布。"
                    />
                    <KeyControl 
                        icon={<Layers size={24}/>} 
                        title="动态视图映射" 
                        desc="支持高度图、方向性梯度图及曲率图切换。自动过滤噪点干扰。"
                    />
                    <KeyControl 
                        icon={<Maximize2 size={24}/>} 
                        title="精确缩放" 
                        desc="点击左下角状态栏的缩放比例数字，可以手动输入精确的放大倍数。"
                    />
                    <KeyControl 
                        icon={<Crosshair size={24}/>} 
                        title="添加标记点" 
                        desc={<span>在 2D 地图上按住 <strong className="text-[#d97757] bg-[#d97757]/10 px-2 py-1 rounded-full text-[11px] font-bold">CTRL + 点击</strong>，即可添加测量标记。</span>}
                    />
                </div>
                
                <div className="bg-white border border-[#eae4dc] p-10 rounded-2xl shadow-sm">
                    <h4 className="font-bold text-xs mb-8 uppercase tracking-widest text-[#d97757]">底部状态栏图例 / Status Bar Legend</h4>
                    <div className="grid grid-cols-2 gap-12">
                        <ul className="text-[12px] font-medium space-y-4 mono text-[#2d2d2d]">
                            <li className="flex justify-between border-b border-[#eae4dc] pb-3"><span className="text-[#7a7571]">ZOOM:</span> <span>视图放大倍率</span></li>
                            <li className="flex justify-between border-b border-[#eae4dc] pb-3"><span className="text-[#7a7571]">POS:</span> <span>网格坐标 (X, Y)</span></li>
                        </ul>
                        <ul className="text-[12px] font-medium space-y-4 mono text-[#2d2d2d]">
                            <li className="flex justify-between border-b border-[#eae4dc] pb-3"><span className="text-[#7a7571]">(Real):</span> <span>物理实际坐标</span></li>
                            <li className="flex justify-between border-b border-[#eae4dc] pb-3"><span className="text-[#7a7571]">Z:</span> <span>实时高度值</span></li>
                        </ul>
                    </div>
                </div>
              </div>
            )}

            {/* --- 3D VIEW TAB --- */}
            {activeTab === '3d' && (
              <div className="space-y-12 animate-in fade-in slide-in-from-bottom-8 duration-700">
                <h4 className="font-bold text-xl text-[#2d2d2d] tracking-tight border-b border-[#eae4dc] pb-5 font-serif">3D 视角导航 / Navigation</h4>
                <div className="grid grid-cols-3 gap-8">
                    <div className="p-10 rounded-2xl border border-[#eae4dc] bg-white shadow-sm flex flex-col items-center hover:bg-[#f3ece5]/10 transition-colors">
                        <div className="font-bold text-sm text-[#d97757] mb-4 uppercase tracking-widest">左键</div>
                        <div className="text-[11px] font-bold text-[#7a7571]">旋转视角</div>
                    </div>
                    <div className="p-10 rounded-2xl border border-[#eae4dc] bg-white shadow-sm flex flex-col items-center hover:bg-[#f3ece5]/10 transition-colors">
                        <div className="font-bold text-sm text-[#d97757] mb-4 uppercase tracking-widest">右键</div>
                        <div className="text-[11px] font-bold text-[#7a7571]">平移视角</div>
                    </div>
                    <div className="p-10 rounded-2xl border border-[#eae4dc] bg-white shadow-sm flex flex-col items-center hover:bg-[#f3ece5]/10 transition-colors">
                        <div className="font-bold text-sm text-[#d97757] mb-4 uppercase tracking-widest">滚轮</div>
                        <div className="text-[11px] font-bold text-[#7a7571]">缩放视图</div>
                    </div>
                </div>

                <div className="bg-[#f3ece5]/20 rounded-2xl p-10 border border-[#eae4dc] flex gap-10 items-start shadow-sm">
                    <div className="p-5 bg-white text-[#d97757] rounded-xl shadow-sm border border-[#eae4dc]"><Keyboard size={32}/></div>
                    <div>
                        <h4 className="font-bold text-xl text-[#2d2d2d] tracking-tight">Z 轴锁定旋转 / Z-Axis Lock</h4>
                        <p className="text-base font-medium text-[#7a7571] mt-3 leading-relaxed max-w-2xl">
                            旋转时按住 <code className="bg-white px-3 py-1 rounded-full border border-[#eae4dc] mono text-xs text-[#d97757] font-bold">ALT</code> 键，可以锁定仰角。
                            产生类似“转盘”的效果，适合检查侧面轮廓缺陷。
                        </p>
                    </div>
                </div>

                <div className="bg-white border border-[#eae4dc] p-10 rounded-2xl shadow-sm">
                    <h4 className="font-bold text-base text-[#2d2d2d] mb-8 flex items-center gap-3">视觉增强与配色</h4>
                    <p className="text-sm font-medium text-[#7a7571] mb-8">点击视图左上角的 <Settings size={18} className="inline text-[#eae4dc] mx-1"/> 图标进行配置。</p>
                    <ul className="grid grid-cols-2 gap-x-14 gap-y-5 text-[14px] font-medium text-[#7a7571]">
                        <li className="flex gap-4 items-start"><span className="text-[#d97757] mt-2 w-2 h-2 rounded-full bg-[#d97757] flex-shrink-0"></span> <span><strong>对比度:</strong> 夸大 Z 轴高度显示比例</span></li>
                        <li className="flex gap-4 items-start"><span className="text-[#d97757] mt-2 w-2 h-2 rounded-full bg-[#d97757] flex-shrink-0"></span> <span><strong>预设色谱:</strong> 提供多种专业伪彩方案</span></li>
                        <li className="flex gap-4 items-start"><span className="text-[#d97757] mt-2 w-2 h-2 rounded-full bg-[#d97757] flex-shrink-0"></span> <span><strong>增强模式:</strong> 优化实时渲染的光影效果</span></li>
                        <li className="flex gap-4 items-start"><span className="text-[#d97757] mt-2 w-2 h-2 rounded-full bg-[#d97757] flex-shrink-0"></span> <span><strong>解耦设置:</strong> 颜色范围与 2D 视图独立</span></li>
                    </ul>
                </div>
              </div>
            )}

            {/* --- ANALYSIS TAB --- */}
            {activeTab === 'analysis' && (
              <div className="space-y-10 animate-in fade-in slide-in-from-bottom-8 duration-700">
                 <div className="border border-[#eae4dc] rounded-2xl overflow-hidden bg-white shadow-2xl shadow-[#2d2d2d]/5">
                    <div className="bg-[#f3ece5]/30 p-8 font-bold text-sm text-[#2d2d2d] uppercase tracking-widest border-b border-[#eae4dc] flex items-center gap-5">
                        <Activity size={24} className="text-[#d97757]" /> 剖面图表分析工具
                    </div>
                    <div className="divide-y divide-[#eae4dc]/50">
                        <AnalysisRow 
                            icon={<MousePointer2 size={20}/>} 
                            name="检查模式 (Inspect)" 
                            desc="悬停在图表曲线上，视图同步。点击可冻结临时标记点。" 
                        />
                        <AnalysisRow 
                            icon={<MoveVertical size={20}/>} 
                            name="Z 高度测量" 
                            desc="测量垂直高度差 (ΔZ)。" 
                        />
                        <AnalysisRow 
                            icon={<MoveHorizontal size={20}/>} 
                            name="XY 距离测量" 
                            desc="测量水平距离 (ΔXY)。" 
                        />
                        <AnalysisRow 
                            icon={<Activity size={20}/>} 
                            name="多组点到线测量 (P2L)" 
                            desc="支持创建多个测量组，计算点到线的垂直偏差。" 
                        />
                        <AnalysisRow 
                            icon={<History size={20}/>} 
                            name="测量预设与快照" 
                            desc="保存当前测量配置为预设，支持一键切换。" 
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