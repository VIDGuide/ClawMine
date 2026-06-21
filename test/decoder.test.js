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
      subChunks.set(4, new Uint32Array(4096));
      const chunk = { x: 0, z: 0, subChunks };

      const updated = applyBlockUpdates(chunk, [
        { x: 5, y: 0, z: 5, block: { stateId: 2532 } },
      ]);

      const idx = (5 << 8) | (5 << 4) | 0;
      assert.equal(updated.subChunks.get(4)[idx], 2532);
      // Original chunk is not mutated
      assert.equal(subChunks.get(4)[idx], 0);
    });
  });
});
