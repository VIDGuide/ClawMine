import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createChunkCache,
  setChunk,
  scan,
  direction,
  raycast,
} from '../src/chunks.js';

/**
 * Create a fake chunk with known blocks for testing.
 */
function makeChunk(cx, cz, blocks = {}) {
  const chunk = {
    x: cx, z: cz,
    getBlock(lx, ly, lz) {
      const key = `${lx},${ly},${lz}`;
      if (blocks[key]) return blocks[key];
      return { name: 'air', stateId: 0, properties: {} };
    },
  };
  return chunk;
}

function posKey(x, y, z) {
  const lx = ((x % 16) + 16) % 16;
  const lz = ((z % 16) + 16) % 16;
  return `${lx},${y},${lz}`;
}

describe('perception', () => {
  describe('scan', () => {
    it('returns empty scan when no chunks loaded', () => {
      const cache = createChunkCache();
      const result = scan(cache, 0, 64, 0);
      assert.equal(result.totalNonAir, 0);
      assert.equal(result.notable.length, 0);
    });

    it('detects a single block', () => {
      let cache = createChunkCache();
      const chunk = makeChunk(0, 0, { [posKey(5, 64, 5)]: { name: 'stone', stateId: 1 } });
      cache = setChunk(cache, 0, 0, chunk);

      const result = scan(cache, 5, 64, 5, 2, 1, 2);
      assert.equal(result.totalNonAir, 1);
      assert.equal(result.layers['64'].length, 1);
      assert.equal(result.layers['64'][0].name, 'stone');
    });

    it('tags notable blocks (ores, chests, etc.)', () => {
      let cache = createChunkCache();
      const chunk = makeChunk(0, 0, {
        [posKey(5, 64, 5)]: { name: 'diamond_ore', stateId: 1 },
        [posKey(6, 64, 5)]: { name: 'chest', stateId: 2 },
        [posKey(5, 64, 6)]: { name: 'stone', stateId: 3 },
      });
      cache = setChunk(cache, 0, 0, chunk);

      const result = scan(cache, 5, 64, 5, 2, 1, 2);
      assert.equal(result.notable.length, 2);
      const notableNames = result.notable.map(n => n.name).sort();
      assert.deepEqual(notableNames, ['chest', 'diamond_ore']);
    });

    it('detects walls at boundary', () => {
      let cache = createChunkCache();
      // Place a wall of stone at east boundary (x=7)
      const blocks = {};
      for (let y = 63; y <= 65; y++) {
        for (let z = 3; z <= 7; z++) {
          blocks[posKey(7, y, z)] = { name: 'stone', stateId: 1 };
        }
      }
      const chunk = makeChunk(0, 0, blocks);
      cache = setChunk(cache, 0, 0, chunk);

      const result = scan(cache, 5, 64, 5, 2, 1, 2);
      assert.ok(result.walls.east.length > 0);
      assert.equal(result.walls.west.length, 0);
    });
  });

  describe('direction', () => {
    it('returns blocks in facing direction (south)', () => {
      const cache = createChunkCache();
      // Yaw=0 = south (+Z)
      const result = direction(cache, { x: 0, y: 64, z: 0 }, 0, 0, 5);
      assert.equal(result.facing.z, 1); // pointing south
      assert.equal(result.blocks.length, 5);
      assert.equal(result.blocks[0].z, 1); // first block is at z+1
      assert.equal(result.blocks[4].z, 5); // fifth block at z+5
    });

    it('returns blocks in facing direction (east)', () => {
      const cache = createChunkCache();
      // Yaw=-PI/2 = east (+X)
      const result = direction(cache, { x: 0, y: 64, z: 0 }, -Math.PI / 2, 0, 3);
      assert.ok(result.facing.x > 0); // pointing east
      assert.equal(result.blocks.length, 3);
    });

    it('stops at first solid block', () => {
      let cache = createChunkCache();
      const chunk = makeChunk(0, 0, {
        [posKey(0, 64, 3)]: { name: 'stone', stateId: 1 },
      });
      cache = setChunk(cache, 0, 0, chunk);

      // Facing south from (0, 64, 0)
      const result = direction(cache, { x: 0, y: 64, z: 0 }, 0, 0, 10);
      // Should stop at block at z=3
      assert.equal(result.blocks.length, 3);
      assert.equal(result.blocks[result.blocks.length - 1].name, 'stone');
      assert.equal(result.firstObstacle.dist, 3);
      assert.equal(result.clear, false);
    });
  });

  describe('raycast', () => {
    it('returns clear for path through air', () => {
      const cache = createChunkCache();
      const result = raycast(cache, 0, 64, 0, 0, 64, 10);
      assert.equal(result.clear, true);
    });

    it('detects obstacles', () => {
      let cache = createChunkCache();
      const chunk = makeChunk(0, 0, {
        [posKey(0, 64, 5)]: { name: 'stone', stateId: 1 },
      });
      cache = setChunk(cache, 0, 0, chunk);

      const result = raycast(cache, 0, 64, 0, 0, 64, 10);
      assert.equal(result.clear, false);
      assert.equal(result.obstacle.z, 5);
      assert.equal(result.obstacle.name, 'stone');
    });

    it('returns clear for zero-distance path', () => {
      const cache = createChunkCache();
      const result = raycast(cache, 0, 64, 0, 0, 64, 0);
      assert.equal(result.clear, true);
      assert.equal(result.distance, 0);
    });
  });
});
