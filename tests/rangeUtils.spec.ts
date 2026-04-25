import assert from 'node:assert/strict';

import { estimatePercentileRange, toSignedDisplayRange } from '../utils/rangeUtils.js';

const data = new Float32Array(10_000);

for (let i = 0; i < data.length; i++) {
  data[i] = i < 9_800 ? 1 : 500;
}

const sampledRange = estimatePercentileRange(data, 0.02, 0.98, 2048);
assert.equal(sampledRange.min, 1);
assert.equal(sampledRange.max, 1);

const signedRange = toSignedDisplayRange({ min: -0.4, max: 0.25 }, 0.1);
assert.equal(signedRange.min, -0.4);
assert.equal(signedRange.max, 0.4);

console.log('rangeUtils.spec: ok');
