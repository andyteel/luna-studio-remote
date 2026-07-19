import assert from 'node:assert/strict';
import test from 'node:test';

import { parseMcuMeterFeedback } from '../server/mcu/mcu-service.js';

test('decodes packed strip and live level from MCU channel pressure', () => {
  assert.deepEqual(parseMcuMeterFeedback([0xd0, 0x71]), {
    stripIndex: 7,
    raw: 1,
    normalized: 1 / 12,
    clip: false,
    encoding: 'packed-strip-level',
  });
});

test('routes zero-level messages to the encoded strip', () => {
  assert.deepEqual(parseMcuMeterFeedback([0xd0, 0x50]), {
    stripIndex: 5,
    raw: 0,
    normalized: 0,
    clip: false,
    encoding: 'packed-strip-level',
  });
});

test('preserves the encoded strip for peak-hold diagnostics', () => {
  assert.deepEqual(parseMcuMeterFeedback([0xd0, 0x3f]), {
    stripIndex: 3,
    raw: 15,
    normalized: null,
    clip: true,
    encoding: 'packed-strip-level',
  });
});

test('rejects incomplete meter messages', () => {
  assert.equal(parseMcuMeterFeedback([0xd0]), null);
});
