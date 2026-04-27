import assert from 'node:assert/strict';

import { parseCSV } from '../utils/dataUtils.js';

const decimalCsv = [
  'x,y,z',
  '0.1,1.2,5',
  '1.1,1.2,6',
  '0.1,0.2,7',
  '1.1,0.2,8',
].join('\n');

const decimalGrid = parseCSV(decimalCsv);

assert.ok(decimalGrid);
assert.deepEqual(Array.from(decimalGrid.data), [5, 6, 7, 8]);

const windowsLineEndingCsv = 'x,y,z\r\n0,1,1\r\n1,1,2\r\n0,0,3\r\n1,0,4\r\n';
const windowsLineEndingGrid = parseCSV(windowsLineEndingCsv);

assert.ok(windowsLineEndingGrid);
assert.deepEqual(Array.from(windowsLineEndingGrid.data), [1, 2, 3, 4]);

console.log('dataUtils.spec: ok');
