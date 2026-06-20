import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { decodeSubChunkBuffer, getLocalBlock, extractSubChunks } from '../src/blocks.js';

function encodeVarInt(val) {
  // ZigZag encode: positive numbers → even, negative → odd
  const zigzag = val < 0 ? (-val << 1) | 1 : val << 1;
  let tmp = zigzag >>> 0;
  const result = [];
  while (tmp >= 0x80) {
    result.push((tmp & 0x7f) | 0x80);
    tmp >>>= 7;
  }
  result.push(tmp & 0x7f);
  return Buffer.from(result);
}

function makeBuffer(arr) {
  return Buffer.from(arr);
}

/**
 * Build a sub-chunk buffer with known blocks.
 * blocks is an array of { lx, ly, lz, stateId }.
 * All unspecified blocks default to air (stateId 12530).
 */
function buildSubChunk(blocks) {
  const paletteMap = new Map();
  const blockIndices = new Uint32Array(4096);
  let nextPalIdx = 0;

  // Default all to air (12530)
  paletteMap.set(12530, nextPalIdx++);
  for (let i = 0; i < 4096; i++) blockIndices[i] = 0;

  for (const b of blocks) {
    if (!paletteMap.has(b.stateId)) paletteMap.set(b.stateId, nextPalIdx++);
    const lidx = ((b.lx & 0xf) << 8) | ((b.lz & 0xf) << 4) | (b.ly & 0xf);
    blockIndices[lidx] = paletteMap.get(b.stateId);
  }

  const paletteSize = paletteMap.size;
  const bitsPerBlock = Math.max(1, Math.ceil(Math.log2(paletteSize)));
  const blocksPerWord = Math.floor(64 / bitsPerBlock);
  const wordCount = Math.ceil(4096 / blocksPerWord);

  // Build word data
  const words = Buffer.alloc(wordCount * 8, 0);
  for (let i = 0; i < 4096; i++) {
    const wi = Math.floor(i / blocksPerWord);
    const bo = (i % blocksPerWord) * bitsPerBlock;
    const val = blockIndices[i];
    // Write bits using Number operations (avoids BigInt issues)
    const wordIdx = wi * 8;
    for (let b = 0; b < bitsPerBlock; b++) {
      if (val & (1 << b)) {
        const byteOffset = wordIdx + Math.floor((bo + b) / 8);
        const bitOffset = (bo + b) % 8;
        words[byteOffset] |= (1 << bitOffset);
      }
    }
  }

  const paletteType = (bitsPerBlock << 1) | 1;
  const parts = [];
  parts.push(makeBuffer([9, 1, paletteType]));
  parts.push(encodeVarInt(wordCount));
  parts.push(words);
  parts.push(encodeVarInt(paletteSize));

  // Palette entries sorted by palette index
  const sorted = [...paletteMap.entries()].sort((a, b) => a[1] - b[1]);
  for (const [stateId] of sorted) {
    parts.push(encodeVarInt(stateId));
  }

  return Buffer.concat(parts);
}

describe('blocks', () => {
  describe('decodeSubChunkBuffer', () => {
    it('decodes a single-block sub-chunk (all air)', () => {
      const buf = buildSubChunk([]);
      const result = decodeSubChunkBuffer(buf);

      assert.equal(result.blocks.length, 4096);
      // All should be air (12530)
      const unique = new Set(result.blockStateIds);
      assert.equal(unique.size, 1);
      assert.ok(unique.has(12530));
    });

    it('decodes a two-block sub-chunk (air + stone)', () => {
      const buf = buildSubChunk([
        { lx: 0, ly: 0, lz: 0, stateId: 2532 }, // stone at (0, 0, 0)
      ]);
      const result = decodeSubChunkBuffer(buf);

      assert.equal(getLocalBlock(result.blocks, 0, 0, 0), 2532);
      assert.equal(getLocalBlock(result.blocks, 1, 0, 0), 12530);
      assert.equal(getLocalBlock(result.blocks, 0, 1, 0), 12530);
    });

    it('decodes blocks at specific positions', () => {
      const buf = buildSubChunk([
        { lx: 5, ly: 7, lz: 3, stateId: 2532 },    // stone
        { lx: 10, ly: 0, lz: 15, stateId: 7336 },   // iron_ore
        { lx: 0, ly: 15, lz: 0, stateId: 3203 },    // gold_ore
      ]);
      const result = decodeSubChunkBuffer(buf);

      assert.equal(getLocalBlock(result.blocks, 5, 7, 3), 2532);
      assert.equal(getLocalBlock(result.blocks, 10, 0, 15), 7336);
      assert.equal(getLocalBlock(result.blocks, 0, 15, 0), 3203);
      assert.equal(getLocalBlock(result.blocks, 0, 0, 0), 12530); // air
    });

    it('handles palette with 3 entries', () => {
      const buf = buildSubChunk([
        { lx: 0, ly: 0, lz: 0, stateId: 2532 },    // stone at (0,0,0)
        { lx: 1, ly: 0, lz: 0, stateId: 7336 },    // iron_ore at (1,0,0)
      ]);
      const result = decodeSubChunkBuffer(buf);
      assert.equal(getLocalBlock(result.blocks, 0, 0, 0), 2532);
      assert.equal(getLocalBlock(result.blocks, 1, 0, 0), 7336);
      assert.equal(getLocalBlock(result.blocks, 0, 1, 0), 12530); // air
    });

    it('rejects unsupported versions', () => {
      const buf = makeBuffer([7, 0]); // version 7
      assert.throws(() => decodeSubChunkBuffer(buf));
    });

    it('rejects invalid bit depth', () => {
      const buf = makeBuffer([9, 1, 0]); // paletteType=0 → bitsPerBlock=0
      assert.throws(() => decodeSubChunkBuffer(buf));
    });
  });

  describe('extractSubChunks', () => {
    it('returns empty for minimal payload', () => {
      // Just border blocks length = 0
      const buf = makeBuffer([0]);
      const result = extractSubChunks(buf);
      assert.equal(result.length, 0);
    });

    it('extracts sub-chunks from payload', () => {
      // Border blocks length = 0, then one sub-chunk
      const sc = buildSubChunk([{ lx: 0, ly: 0, lz: 0, stateId: 2532 }]);
      const payload = Buffer.concat([makeBuffer([0]), sc]);
      const result = extractSubChunks(payload);

      assert.equal(result.length, 1);
      assert.ok(result[0].byteLength > 10);

      // Verify the extracted sub-chunk decodes correctly
      const decoded = decodeSubChunkBuffer(result[0].buffer);
      assert.equal(getLocalBlock(decoded.blocks, 0, 0, 0), 2532);
    });
  });
});
