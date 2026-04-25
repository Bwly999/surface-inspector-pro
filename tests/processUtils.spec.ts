import assert from 'node:assert/strict';

import { getPreviewDisplayRange } from '../utils/processUtils.js';

const data = new Float32Array(10_000);

for (let i = 0; i < data.length; i++) {
  data[i] = i < 9_800 ? 2 : 900;
}

const range = getPreviewDisplayRange(data, { min: -1, max: 10 });

assert.equal(range.min, 2);
assert.equal(range.max, 2);

console.log('processUtils.spec: ok');
