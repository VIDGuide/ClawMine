import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Regression tests for the sub-chunk request offset calculation in bot.js.
 *
 * The logic: origin.y = -4, offsets are relative to origin.
 * Actual sub-chunk index = origin.y + offset = -4 + dy.
 * Valid sub-chunk indices: -4 to 19 (Y=-64 to Y=319).
 * So valid dy range: 0 to 23.
 */

function computeRequestOffsets(botY) {
  const ORIGIN_Y = -4;
  const centerSub = Math.floor((botY + 64) / 16);
  const requests = [];
  for (let r = -3; r <= 3; r++) {
    const dy = centerSub + r;
    if (dy >= 0 && dy <= 23) requests.push(dy);
  }
  return {
    offsets: requests,
    subChunkIndices: requests.map(dy => ORIGIN_Y + dy),
    centerSub,
  };
}

describe('sub-chunk request offset calculation', () => {
  it('covers the correct sub-chunk for Y=64 (normal height)', () => {
    const { subChunkIndices } = computeRequestOffsets(64);
    const needed = Math.floor(64 / 16); // 4
    assert.ok(subChunkIndices.includes(needed),
      `Y=64 needs sub-chunk ${needed}, got indices: ${subChunkIndices}`);
  });

  it('covers the correct sub-chunk for Y=200 (high hills)', () => {
    const { subChunkIndices } = computeRequestOffsets(200);
    const needed = Math.floor(200 / 16); // 12
    assert.ok(subChunkIndices.includes(needed),
      `Y=200 needs sub-chunk ${needed}, got indices: ${subChunkIndices}`);
  });

  it('covers the correct sub-chunk for Y=260 (mountain peak)', () => {
    const { subChunkIndices } = computeRequestOffsets(260);
    const needed = Math.floor(260 / 16); // 16
    assert.ok(subChunkIndices.includes(needed),
      `Y=260 needs sub-chunk ${needed}, got indices: ${subChunkIndices}`);
  });

  it('covers the correct sub-chunk for Y=300 (build limit area)', () => {
    const { subChunkIndices } = computeRequestOffsets(300);
    const needed = Math.floor(300 / 16); // 18
    assert.ok(subChunkIndices.includes(needed),
      `Y=300 needs sub-chunk ${needed}, got indices: ${subChunkIndices}`);
  });

  it('covers the correct sub-chunk for Y=319 (world ceiling)', () => {
    const { subChunkIndices } = computeRequestOffsets(319);
    const needed = Math.floor(319 / 16); // 19
    assert.ok(subChunkIndices.includes(needed),
      `Y=319 needs sub-chunk ${needed}, got indices: ${subChunkIndices}`);
  });

  it('covers the correct sub-chunk for Y=-64 (world floor)', () => {
    const { subChunkIndices } = computeRequestOffsets(-64);
    const needed = Math.floor(-64 / 16); // -4
    assert.ok(subChunkIndices.includes(needed),
      `Y=-64 needs sub-chunk ${needed}, got indices: ${subChunkIndices}`);
  });

  it('covers the correct sub-chunk for Y=-32 (deep caves)', () => {
    const { subChunkIndices } = computeRequestOffsets(-32);
    const needed = Math.floor(-32 / 16); // -2
    assert.ok(subChunkIndices.includes(needed),
      `Y=-32 needs sub-chunk ${needed}, got indices: ${subChunkIndices}`);
  });

  it('never produces offsets outside valid range [0, 23]', () => {
    for (let y = -64; y <= 319; y += 10) {
      const { offsets } = computeRequestOffsets(y);
      for (const dy of offsets) {
        assert.ok(dy >= 0 && dy <= 23,
          `Y=${y} produced offset ${dy} outside [0, 23]`);
      }
    }
  });

  it('all requested sub-chunk indices are within valid world range [-4, 19]', () => {
    for (let y = -64; y <= 319; y += 10) {
      const { subChunkIndices } = computeRequestOffsets(y);
      for (const idx of subChunkIndices) {
        assert.ok(idx >= -4 && idx <= 19,
          `Y=${y} produced sub-chunk index ${idx} outside [-4, 19]`);
      }
    }
  });

  it('always produces at least 1 request for any valid Y', () => {
    for (let y = -64; y <= 319; y++) {
      const { offsets } = computeRequestOffsets(y);
      assert.ok(offsets.length >= 1,
        `Y=${y} produced 0 requests`);
    }
  });
});
