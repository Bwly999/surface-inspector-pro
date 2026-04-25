import { DisplayRange } from '../types';

export const estimatePercentileRange = (
  data: Float32Array,
  lowerPercentile = 0.02,
  upperPercentile = 0.98,
  sampleSize = 16_384,
): DisplayRange => {
  if (data.length === 0) {
    return { min: 0, max: 0 };
  }

  const boundedLower = Math.min(Math.max(lowerPercentile, 0), 1);
  const boundedUpper = Math.min(Math.max(upperPercentile, boundedLower), 1);
  const effectiveSampleSize = Math.min(Math.max(sampleSize, 1), data.length);
  const sample = new Float32Array(effectiveSampleSize);

  if (effectiveSampleSize === data.length) {
    sample.set(data);
  } else {
    const step = (data.length - 1) / Math.max(effectiveSampleSize - 1, 1);
    for (let i = 0; i < effectiveSampleSize; i++) {
      sample[i] = data[Math.round(i * step)] ?? 0;
    }
  }

  sample.sort();

  const minIndex = Math.min(sample.length - 1, Math.floor((sample.length - 1) * boundedLower));
  const maxIndex = Math.min(sample.length - 1, Math.floor((sample.length - 1) * boundedUpper));

  return {
    min: sample[minIndex] ?? 0,
    max: sample[maxIndex] ?? 0,
  };
};

export const toSignedDisplayRange = (range: DisplayRange, fallback = 0.1): DisplayRange => {
  const absMax = Math.max(Math.abs(range.min), Math.abs(range.max));
  const limit = absMax || fallback;

  return {
    min: -limit,
    max: limit,
  };
};
