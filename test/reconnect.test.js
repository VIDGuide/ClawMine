import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Test backoff sequence logic (pure, no I/O)
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000, 30000];

function getDelay(attempt) {
  return RECONNECT_DELAYS[Math.min(attempt, RECONNECT_DELAYS.length - 1)];
}

describe('reconnect backoff', () => {
  it('first attempt uses 1000ms', () => {
    assert.equal(getDelay(0), 1000);
  });

  it('second attempt uses 2000ms', () => {
    assert.equal(getDelay(1), 2000);
  });

  it('delays increase exponentially', () => {
    const delays = [0, 1, 2, 3, 4, 5].map(getDelay);
    assert.deepEqual(delays, [1000, 2000, 4000, 8000, 16000, 30000]);
  });

  it('caps at 30000ms', () => {
    assert.equal(getDelay(10), 30000);
    assert.equal(getDelay(100), 30000);
  });
});
