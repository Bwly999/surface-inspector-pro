/// <reference lib="webworker" />

import { DataWorkerRequest, DataWorkerResponse, DerivedLayerKind, DirectionalMaps, DisplayRange, GridData } from '../types';
import { computeCurvatureMaps, computeGradientMaps, getGridSpacing, parseCSV } from './dataUtils';
import { getPreviewDisplayRange, processImageToGrid } from './processUtils';
import { estimatePercentileRange, toSignedDisplayRange } from './rangeUtils';

type DatasetCacheEntry = {
  grid: GridData;
  layers: Partial<Record<DerivedLayerKind, { maps: DirectionalMaps; ranges: Record<'x' | 'y', DisplayRange> }>>;
};

const datasets = new Map<string, DatasetCacheEntry>();

const workerScope = self as DedicatedWorkerGlobalScope;

const respond = (message: DataWorkerResponse) => {
  workerScope.postMessage(message);
};

const getLayerPayload = (grid: GridData, kind: DerivedLayerKind) => {
  const { dx, dy } = getGridSpacing(grid);
  const maps =
    kind === 'gradient'
      ? computeGradientMaps(grid.data, grid.w, grid.h, dx, dy)
      : computeCurvatureMaps(grid.data, grid.w, grid.h, dx, dy);

  return {
    maps,
    ranges: {
      x: toSignedDisplayRange(estimatePercentileRange(maps.x)),
      y: toSignedDisplayRange(estimatePercentileRange(maps.y)),
    },
  };
};

workerScope.onmessage = (event: MessageEvent<DataWorkerRequest>) => {
  const request = event.data;

  try {
    if (request.type === 'parse-csv') {
      const grid = parseCSV(request.text);

      if (!grid) {
        throw new Error('CSV 中没有可用数据');
      }

      datasets.set(request.datasetId, { grid, layers: {} });

      respond({
        type: 'parse-success',
        requestId: request.requestId,
        payload: {
          datasetId: request.datasetId,
          grid,
          range: estimatePercentileRange(grid.data),
        },
      });
      return;
    }

    if (request.type === 'register-grid') {
      datasets.set(request.datasetId, {
        grid: request.grid,
        layers: {},
      });

      respond({
        type: 'register-success',
        requestId: request.requestId,
        payload: {
          datasetId: request.datasetId,
        },
      });
      return;
    }

    if (request.type === 'process-image') {
      const grid = processImageToGrid(request.buffer, request.config);

      respond({
        type: 'process-image-success',
        requestId: request.requestId,
        payload: {
          grid,
          range: getPreviewDisplayRange(grid.data, { min: grid.minZ, max: grid.maxZ }),
        },
      });
      return;
    }

    const cachedDataset = datasets.get(request.datasetId);
    if (!cachedDataset) {
      throw new Error('未找到可计算的数据集');
    }

    const cachedLayer = cachedDataset.layers[request.kind];
    const layerPayload = cachedLayer ?? getLayerPayload(cachedDataset.grid, request.kind);

    if (!cachedLayer) {
      cachedDataset.layers[request.kind] = layerPayload;
    }

    respond({
      type: 'layer-success',
      requestId: request.requestId,
      payload: {
        kind: request.kind,
        maps: layerPayload.maps,
        ranges: layerPayload.ranges,
      },
    });
  } catch (error) {
    respond({
      type: 'error',
      requestId: request.requestId,
      payload: {
        message: error instanceof Error ? error.message : '数据处理失败',
      },
    });
  }
};
