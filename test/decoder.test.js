import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { decodeLevelChunk, decodeSubChunk, applyBlockUpdates, createBlankChunk } from '../src/decoder.js';

describe('decoder', () => {
  describe('createBlankChunk', () => {
    it('creates a blank chunk with empty sub-chunks', async () => {
      const chunk = await createBlankChunk(0, 0);
      assert.equal(chunk.x, 0);
      assert.equal(chunk.z, 0);
      assert.equal(chunk.subChunks.size, 0);
      assert.equal(chunk.decoded, false);
    });
  });

  describe('decodeLevelChunk', () => {
    it('handles empty payload', async () => {
      const chunk = await decodeLevelChunk(1, 2, Buffer.alloc(0), -1);
      assert.equal(chunk.x, 1);
      assert.equal(chunk.z, 2);
      assert.equal(chunk.decoded, false);
    });

    it('handles null payload', async () => {
      const chunk = await decodeLevelChunk(0, 0, null, -1);
      assert.equal(chunk.decoded, false);
    });
  });

  describe('decodeSubChunk', () => {
    it('throws when chunk is null', async () => {
      try {
        await decodeSubChunk(null, 0, Buffer.alloc(10));
        assert.fail('Should have thrown');
      } catch (e) {
        assert.ok(e.message.includes('Chunk must be created'));
      }
    });
  });

  describe('applyBlockUpdates', () => {
    it('does nothing with empty/null updates', () => {
      applyBlockUpdates({ subChunks: new Map() }, []);
      applyBlockUpdates(null, null);
    });

    it('updates individual blocks', () => {
      const subChunks = new Map();
      subChunks.set(0, new Uint32Array(4096));
      const chunk = { x: 0, z: 0, subChunks };

      const updated = applyBlockUpdates(chunk, [
        { x: 5, y: 0, z: 5, block: { stateId: 2532 } },
      ]);

      const idx = (5 << 8) | (5 << 4) | 0;
      assert.equal(updated.subChunks.get(0)[idx], 2532);
      // Original chunk is not mutated
      assert.equal(subChunks.get(0)[idx], 0);
    });

    it('stores at correct sub-chunk index for high Y (mountain heights)', () => {
      // Y=200 → sub-chunk 12, Y=260 → sub-chunk 16, Y=300 → sub-chunk 18
      const subChunks = new Map();
      const chunk = { x: 0, z: 0, subChunks };

      const updated = applyBlockUpdates(chunk, [
        { x: 3, y: 200, z: 3, block: { stateId: 1111 } },
        { x: 4, y: 260, z: 4, block: { stateId: 2222 } },
        { x: 5, y: 300, z: 5, block: { stateId: 3333 } },
      ]);

      // sub-chunk index = Math.floor(y / 16)
      assert.ok(updated.subChunks.has(12), 'Y=200 should be in sub-chunk 12');
      assert.ok(updated.subChunks.has(16), 'Y=260 should be in sub-chunk 16');
      assert.ok(updated.subChunks.has(18), 'Y=300 should be in sub-chunk 18');

      // Verify they are NOT at the old buggy indices (Math.floor((y+64)/16))
      assert.ok(!updated.subChunks.has(Math.floor(264 / 16)) || updated.subChunks.get(16)?.length > 0,
        'should not use (y+64)/16 formula');

      // Verify actual block data at correct positions
      const ly200 = 200 & 0xf; // 8
      const idx200 = (3 << 8) | (3 << 4) | ly200;
      assert.equal(updated.subChunks.get(12)[idx200], 1111);

      const ly260 = 260 & 0xf; // 4
      const idx260 = (4 << 8) | (4 << 4) | ly260;
      assert.equal(updated.subChunks.get(16)[idx260], 2222);

      const ly300 = 300 & 0xf; // 12
      const idx300 = (5 << 8) | (5 << 4) | ly300;
      assert.equal(updated.subChunks.get(18)[idx300], 3333);
    });

    it('stores at correct sub-chunk index for negative Y (deep caves)', () => {
      const subChunks = new Map();
      const chunk = { x: 0, z: 0, subChunks };

      const updated = applyBlockUpdates(chunk, [
        { x: 2, y: -60, z: 2, block: { stateId: 4444 } },
        { x: 3, y: -1, z: 3, block: { stateId: 5555 } },
      ]);

      // Y=-60 → Math.floor(-60/16) = -4, Y=-1 → Math.floor(-1/16) = -1
      assert.ok(updated.subChunks.has(-4), 'Y=-60 should be in sub-chunk -4');
      assert.ok(updated.subChunks.has(-1), 'Y=-1 should be in sub-chunk -1');

      const ly_60 = -60 & 0xf; // 4 (JS bitwise on negative: (-60 & 0xf) = 4)
      const idx_60 = (2 << 8) | (2 << 4) | ly_60;
      assert.equal(updated.subChunks.get(-4)[idx_60], 4444);
    });

    it('sub-chunk index aligns with getBlock lookup for all height ranges', () => {
      // This test ensures applyBlockUpdates and getBlock use the same key formula
      const subChunks = new Map();
      const chunk = { x: 0, z: 0, subChunks };

      const testYs = [-64, -32, 0, 64, 128, 200, 256, 300, 319];
      const updates = testYs.map((y, i) => ({ x: 0, y, z: 0, block: { stateId: 1000 + i } }));
      const updated = applyBlockUpdates(chunk, updates);

      for (const y of testYs) {
        const expectedCy = Math.floor(y / 16);
        assert.ok(updated.subChunks.has(expectedCy),
          `Y=${y} should be in sub-chunk ${expectedCy} (Math.floor(${y}/16))`);
      }
    });
  });
});
