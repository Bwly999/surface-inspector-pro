import React, { useState, useCallback } from 'react';
import { useLocalStorage } from './useLocalStorage';
import { MeasurementPreset } from '../types';

/**
 * Hook for managing measurement history presets.
 * Handles persistence, import/export, and loading/saving.
 */
export const useMeasurementHistory = (
    onLoad: (preset: MeasurementPreset) => void
) => {
    const [presets, setPresets] = useLocalStorage<MeasurementPreset[]>('profile-presets', []);
    const [showPresetPanel, setShowPresetPanel] = useState(false);
    const [showSaveDialog, setShowSaveDialog] = useState(false);
    const [presetName, setPresetName] = useState('');
    const [editingPresetId, setEditingPresetId] = useState<string | null>(null);

    const handleOpenSaveDialog = useCallback(() => {
        setPresetName(`预设 ${new Date().toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-')}`);
        setEditingPresetId(null);
        setShowSaveDialog(true);
    }, []);

    const handleOpenEditDialog = useCallback((preset: MeasurementPreset, e: React.MouseEvent) => {
        e.stopPropagation();
        setPresetName(preset.name);
        setEditingPresetId(preset.id);
        setShowSaveDialog(true);
    }, []);

    const handleSavePreset = useCallback((currentData: Omit<MeasurementPreset, 'id' | 'name'>) => {
        if (!presetName.trim()) return;

        // Deep copy measState to avoid reference issues
        const dataToSave = JSON.parse(JSON.stringify(currentData));

        if (editingPresetId) {
            // Update existing preset
            setPresets(prev => prev.map(p => {
                if (p.id === editingPresetId) {
                    return {
                        ...p,
                        name: presetName.trim(),
                        ...dataToSave
                    };
                }
                return p;
            }));
        } else {
            // Create new preset
            const newPreset: MeasurementPreset = {
                id: `preset-${Date.now()}`,
                name: presetName.trim(),
                ...dataToSave
            };
            setPresets(prev => [...prev, newPreset]);
        }

        setShowSaveDialog(false);
        setPresetName('');
        setEditingPresetId(null);
    }, [editingPresetId, presetName, setPresets]);

    const handleLoadPreset = useCallback((preset: MeasurementPreset) => {
        onLoad(preset);
        setShowPresetPanel(false);
    }, [onLoad]);

    const handleDeletePreset = useCallback((id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setPresets(prev => prev.filter(p => p.id !== id));
    }, [setPresets]);

    const handleExportPresets = useCallback(() => {
        if (presets.length === 0) return alert('没有可导出的预设');
        const blob = new Blob([JSON.stringify(presets, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `surface-presets-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }, [presets]);

    const handleImportPresets = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
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
    }, [setPresets]);

    return {
        presets,
        showPresetPanel,
        setShowPresetPanel,
        showSaveDialog,
        setShowSaveDialog,
        presetName,
        setPresetName,
        editingPresetId,
        handleOpenSaveDialog,
        handleOpenEditDialog,
        handleSavePreset,
        handleLoadPreset,
        handleDeletePreset,
        handleExportPresets,
        handleImportPresets
    };
};
