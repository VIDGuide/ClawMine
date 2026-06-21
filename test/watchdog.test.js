/**
 * Watchdog tests — verify cleanup logic for timed-out commands.
 * Tests the watchdog pattern directly without using the full bot.js.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Simulate the watchdog pattern used in bot.js setters
function createWatchdog(onTimeout, ms) {
  let active = null;
  return {
    set(v) {
      if (active?._watchdog) clearTimeout(active._watchdog);
      if (v) {
        v._watchdog = setTimeout(() => {
          if (!active || active.id !== v.id) return;
          active = null;
          onTimeout(v.id);
        }, ms);
      }
      active = v;
    },
    get() { return active; },
    clear() {
      if (active?._watchdog) clearTimeout(active._watchdog);
      active = null;
    },
  };
}

describe('command watchdog', () => {
  it('watchdog fires after timeout and clears active state', async () => {
    const fired = [];
    const wd = createWatchdog((id) => fired.push(id), 50); // 50ms for test
    wd.set({ id: 'mine-1', timer: null });
    assert.ok(wd.get(), 'active should be set');
    await new Promise(r => setTimeout(r, 100));
    assert.equal(wd.get(), null, 'active should be cleared after timeout');
    assert.deepEqual(fired, ['mine-1'], 'timeout callback should have fired');
  });

  it('watchdog cleared on explicit completion (set null)', async () => {
    const fired = [];
    const wd = createWatchdog((id) => fired.push(id), 50);
    wd.set({ id: 'mine-2', timer: null });
    wd.set(null); // command completed normally
    await new Promise(r => setTimeout(r, 100));
    assert.equal(fired.length, 0, 'no timeout should fire after normal completion');
  });

  it('watchdog replaced when new command set before timeout', async () => {
    const fired = [];
    const wd = createWatchdog((id) => fired.push(id), 80);
    wd.set({ id: 'mine-3', timer: null });
    await new Promise(r => setTimeout(r, 40));
    wd.set({ id: 'mine-4', timer: null }); // new command, resets watchdog
    await new Promise(r => setTimeout(r, 60));
    // mine-3 watchdog was cleared; mine-4's watchdog hasn't fired yet
    assert.equal(fired.filter(id => id === 'mine-3').length, 0, 'old watchdog should be cleared');
  });
});
