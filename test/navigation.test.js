import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyBlock, findPath, euclideanDistance } from '../src/navigation.js';
import { createChunkCache, setChunk } from '../src/chunks.js';
import { AIR_ID } from '../src/constants.js';

const STONE = 2532;
const LADDER = 1540239144;
const LAVA = 2765474998;
const DOOR = 3763596343;
const STAIRS = 3820945975;

function makeChunk(cx, cz, blocks = {}) {
  const subChunks = new Map();
  for (const [key, val] of Object.entries(blocks)) {
    const [lx, ly, lz] = key.split(',').map(Number);
    const cy = Math.floor(ly / 16);
    if (!subChunks.has(cy)) subChunks.set(cy, new Uint32Array(4096));
    const idx = (lx << 8) | (lz << 4) | (ly & 0xf);
    subChunks.get(cy)[idx] = val.stateId ?? 0;
  }
  return { x: cx, z: cz, subChunks };
}

function posKey(x, y, z) {
  const lx = ((x % 16) + 16) % 16;
  const lz = ((z % 16) + 16) % 16;
  return `${lx},${y},${lz}`;
}

function flatCache(floorY = 63, bounds = 5) {
  let cache = createChunkCache();
  const blocks = {};
  for (let x = -bounds; x <= bounds; x++) {
    for (let z = -bounds; z <= bounds; z++) {
      blocks[posKey(x, floorY, z)] = { stateId: STONE, name: 'minecraft:stone' };
    }
  }
  cache = setChunk(cache, 0, 0, makeChunk(0, 0, blocks));
  return cache;
}

// ── classifyBlock ─────────────────────────────────────────

describe('classifyBlock', () => {
  it('classifies air/null as passable non-solid', () => {
    const c = classifyBlock(null);
    assert.equal(c.passable, true);
    assert.equal(c.solid, false);
  });

  it('classifies air stateId', () => {
    const c = classifyBlock({ stateId: AIR_ID, name: 'minecraft:air' });
    assert.equal(c.passable, true);
    assert.equal(c.solid, false);
  });

  it('classifies doors as openable and passable', () => {
    const c = classifyBlock({ stateId: 100, name: 'minecraft:oak_door' });
    assert.equal(c.openable, true);
    assert.equal(c.passable, true);
    assert.equal(c.solid, false);
  });

  it('classifies stairs as halfHeight', () => {
    const c = classifyBlock({ stateId: 200, name: 'minecraft:stone_stairs' });
    assert.equal(c.halfHeight, true);
  });

  it('classifies ladders as climbable', () => {
    const c = classifyBlock({ stateId: 300, name: 'minecraft:ladder' });
    assert.equal(c.climbable, true);
    assert.equal(c.passable, true);
  });

  it('classifies lava as hazard', () => {
    const c = classifyBlock({ stateId: 400, name: 'minecraft:lava' });
    assert.equal(c.hazard, true);
  });

  it('classifies fence as fence', () => {
    const c = classifyBlock({ stateId: 500, name: 'minecraft:oak_fence' });
    assert.equal(c.fence, true);
  });
});

// ── euclideanDistance ─────────────────────────────────────

describe('euclideanDistance', () => {
  it('returns 0 for same point', () => {
    assert.equal(euclideanDistance(1, 2, 3, 1, 2, 3), 0);
  });

  it('computes correct distance', () => {
    assert.equal(euclideanDistance(0, 0, 0, 3, 4, 0), 5);
  });
});

// ── findPath ─────────────────────────────────────────────

describe('findPath', () => {
  it('returns distance 0 for same position', () => {
    const cache = flatCache();
    const result = findPath(cache, 0, 64, 0, 0, 64, 0);
    assert.ok(result);
    assert.equal(result.distance, 0);
    assert.equal(result.cost, 0);
  });

  it('finds flat path', () => {
    const cache = flatCache();
    const result = findPath(cache, 0, 64, 0, 3, 64, 0);
    assert.ok(result);
    assert.equal(result.path[result.path.length - 1].x, 3);
    assert.equal(result.distance, 3);
    assert.equal(result.cost, 3);
  });

  it('finds step-up path', () => {
    let cache = createChunkCache();
    const blocks = {};
    // Floor at y=63 for x=0..2
    for (let x = 0; x <= 2; x++) {
      blocks[posKey(x, 63, 0)] = { stateId: STONE, name: 'minecraft:stone' };
    }
    // Raised floor at x=2, y=64
    blocks[posKey(2, 64, 0)] = { stateId: STONE, name: 'minecraft:stone' };
    cache = setChunk(cache, 0, 0, makeChunk(0, 0, blocks));

    const result = findPath(cache, 0, 64, 0, 2, 65, 0);
    assert.ok(result, 'Should find step-up path');
    assert.equal(result.path[result.path.length - 1].y, 65);
  });

  it('finds fall path', () => {
    let cache = createChunkCache();
    const blocks = {};
    // Floor at y=63 for x=0..1
    for (let x = 0; x <= 1; x++) {
      blocks[posKey(x, 63, 0)] = { stateId: STONE, name: 'minecraft:stone' };
    }
    // Drop: floor at y=61 for x=2
    blocks[posKey(2, 61, 0)] = { stateId: STONE, name: 'minecraft:stone' };
    cache = setChunk(cache, 0, 0, makeChunk(0, 0, blocks));

    const result = findPath(cache, 0, 64, 0, 2, 62, 0);
    assert.ok(result, 'Should find fall path');
    assert.equal(result.path[result.path.length - 1].y, 62);
    assert.ok(result.cost > result.distance, 'Fall should add cost');
  });

  it('finds ladder climb path', () => {
    let cache = createChunkCache();
    const blocks = {};
    // Floor at y=63
    blocks[posKey(0, 63, 0)] = { stateId: STONE };
    // Ladder going up: y=64, 65, 66
    blocks[posKey(0, 64, 0)] = { stateId: LADDER };
    blocks[posKey(0, 65, 0)] = { stateId: LADDER };
    blocks[posKey(0, 66, 0)] = { stateId: LADDER };
    // Platform at top: floor at (1, 66) so bot can stand at (1, 67)
    blocks[posKey(1, 66, 0)] = { stateId: STONE };
    cache = setChunk(cache, 0, 0, makeChunk(0, 0, blocks));

    const result = findPath(cache, 0, 64, 0, 1, 67, 0);
    assert.ok(result, 'Should find ladder path');
    assert.equal(result.path[result.path.length - 1].y, 67);
    assert.ok(result.cost >= 4, 'Ladder climb should have cost >= 4');
  });

  it('finds path through door', () => {
    let cache = createChunkCache();
    const blocks = {};
    // Floor
    for (let x = -1; x <= 2; x++) {
      blocks[posKey(x, 63, 0)] = { stateId: STONE, name: 'minecraft:stone' };
    }
    // Door at x=1 feet and head
    blocks[posKey(1, 64, 0)] = { stateId: DOOR, name: 'minecraft:oak_door' };
    blocks[posKey(1, 65, 0)] = { stateId: DOOR, name: 'minecraft:oak_door' };
    cache = setChunk(cache, 0, 0, makeChunk(0, 0, blocks));

    const result = findPath(cache, 0, 64, 0, 2, 64, 0);
    assert.ok(result, 'Should path through door');
    assert.ok(result.cost > 2, 'Door adds extra cost');
  });

  it('avoids lava', () => {
    let cache = createChunkCache();
    const blocks = {};
    // Floor with lava gap
    for (let x = -1; x <= 3; x++) {
      for (let z = -2; z <= 2; z++) {
        blocks[posKey(x, 63, z)] = { stateId: STONE, name: 'minecraft:stone' };
      }
    }
    // Lava at x=1 across z=-2..2 on the ground
    for (let z = -2; z <= 2; z++) {
      blocks[posKey(1, 63, z)] = { stateId: LAVA, name: 'minecraft:lava' };
    }
    cache = setChunk(cache, 0, 0, makeChunk(0, 0, blocks));

    const result = findPath(cache, 0, 64, 0, 3, 64, 0);
    assert.equal(result, null, 'Should not path through lava');
  });
});
