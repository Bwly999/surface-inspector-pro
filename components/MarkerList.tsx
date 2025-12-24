import React, { useState } from 'react';
import { Marker } from '../types';
import { Trash2, Crosshair, Edit2, Check, X, MapPin } from 'lucide-react';
import { THEME } from '../constants';

interface MarkerListProps {
  markers: Marker[];
  selectedMarkerId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdateLabel: (id: string, label: string) => void;
  onFocus: (marker: Marker) => void;
}

const MarkerList: React.FC<MarkerListProps> = ({ 
  markers, selectedMarkerId, onSelect, onDelete, onUpdateLabel, onFocus 
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tempLabel, setTempLabel] = useState('');

  const startEditing = (m: Marker, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(m.id);
    setTempLabel(m.label || `Marker ${markers.indexOf(m) + 1}`);
  };

  const saveLabel = (id: string, e: React.MouseEvent | React.FormEvent) => {
    e.stopPropagation();
    onUpdateLabel(id, tempLabel);
    setEditingId(null);
  };

  const cancelEditing = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(null);
  };

  if (markers.length === 0) return null;

  return (
    <div className="absolute top-12 left-4 w-64 bg-white/95 backdrop-blur shadow-xl border-2 border-gray-800 flex flex-col max-h-[300px] z-20 animate-slide-in-left origin-top-left">
      <div className="p-2 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase flex items-center gap-2">
          <MapPin size={12} /> Marker List ({markers.length})
        </h3>
      </div>
      <div className="overflow-y-auto flex-1 p-1 gap-1 flex flex-col">
        {markers.map((m, idx) => {
          const isSelected = m.id === selectedMarkerId;
          const isEditing = editingId === m.id;

          return (
            <div 
              key={m.id}
              onClick={() => onSelect(m.id)}
              className={`group flex flex-col p-2 text-xs border rounded transition-all cursor-pointer animate-fade-in ${
                isSelected ? 'border-orange-500 bg-orange-50' : 'border-transparent hover:bg-gray-100 hover:border-gray-200'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                {isEditing ? (
                  <div className="flex items-center gap-1 flex-1 mr-2" onClick={e => e.stopPropagation()}>
                    <input 
                      autoFocus
                      type="text" 
                      value={tempLabel}
                      onChange={e => setTempLabel(e.target.value)}
                      className="w-full px-1 py-0.5 border border-blue-400 outline-none text-xs bg-white"
                      onKeyDown={e => { if (e.key === 'Enter') saveLabel(m.id, e); if(e.key === 'Escape') cancelEditing(e as any); }}
                    />
                    <button onClick={(e) => saveLabel(m.id, e)} className="text-green-600 hover:bg-green-100 p-0.5 rounded"><Check size={12}/></button>
                    <button onClick={cancelEditing} className="text-red-500 hover:bg-red-100 p-0.5 rounded"><X size={12}/></button>
                  </div>
                ) : (
                  <div className="font-bold flex-1 truncate pr-2 flex items-center gap-2">
                     <span className="w-2 h-2 rounded-full inline-block transition-colors duration-300" style={{ backgroundColor: isSelected ? THEME.primary : '#999' }}></span>
                     {m.label || `Marker ${idx + 1}`}
                  </div>
                )}
                
                <div className={`flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 ${isSelected || isEditing ? 'opacity-100' : ''}`}>
                   {!isEditing && (
                     <button onClick={(e) => startEditing(m, e)} className="p-1 hover:bg-gray-200 rounded text-gray-600 hover:scale-110 transition-transform" title="Rename">
                        <Edit2 size={10} />
                     </button>
                   )}
                   <button onClick={(e) => { e.stopPropagation(); onFocus(m); }} className="p-1 hover:bg-blue-100 rounded text-blue-600 hover:scale-110 transition-transform" title="Center View">
                      <Crosshair size={10} />
                   </button>
                   <button onClick={(e) => { e.stopPropagation(); onDelete(m.id); }} className="p-1 hover:bg-red-100 rounded text-red-600 hover:scale-110 transition-transform" title="Delete">
                      <Trash2 size={10} />
                   </button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-1 text-[10px] text-gray-500 font-mono">
                <div>X:{m.realX.toFixed(1)}</div>
                <div>Y:{m.realY.toFixed(1)}</div>
                <div className="text-right text-orange-600">Z:{m.z.toFixed(3)}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MarkerList;