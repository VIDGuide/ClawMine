/**
 * ClawMine — Chunk decoder
 *
 * Decodes Bedrock level_chunk and subchunk packet buffers into
 * a flat block state ID array. Uses standalone sub-chunk parser.
 */

import { decodeSubChunkBuffer, getLocalBlock, extractSubChunks } from './blocks.js';

/**
 * Decode a level_chunk packet payload.
 * Stores decoded block state IDs in the chunk object.
 */
export async function decodeLevelChunk(cx, cz, payload, subChunkCount) {
  const chunk = {
    x: cx,
    z: cz,
    subChunks: new Map(), // cy → Uint32Array(4096)
    subChunkCount,
    decoded: false,
    rawSize: payload?.length || 0,
  };

  if (subChunkCount === -1 || !payload || payload.length < 2) {
    return chunk; // Empty chunk, nothing to decode
  }

  try {
    const subChunkBuffers = extractSubChunks(payload);
    for (let i = 0; i < subChunkBuffers.length; i++) {
      const { blocks } = decodeSubChunkBuffer(subChunkBuffers[i].buffer);
      chunk.subChunks.set(i, blocks);
    }
    chunk.decoded = true;
  } catch (e) {
    // Return partially decoded chunk on error
  }

  return chunk;
}

/**
 * Decode a single sub-chunk from a subchunk packet entry.
 */
export async function decodeSubChunk(chunk, cy, buffer) {
  if (!chunk) throw new Error('Chunk must be created first');
  try {
    const { blocks } = decodeSubChunkBuffer(buffer);
    chunk.subChunks.set(cy, blocks);
  } catch (e) {
    throw new Error(`Sub-chunk decode failed at Y=${cy}: ${e.message}`);
  }
  return chunk;
}

/**
 * Apply block-level updates from update_subchunk_blocks.
 */
export function applyBlockUpdates(chunk, blockUpdates) {
  if (!chunk || !blockUpdates || !chunk.subChunks) return;

  for (const update of blockUpdates) {
    try {
      const cy = Math.floor(update.y / 16);
      const ly = update.y & 0xf;
      const lx = (update.x & 0xf);
      const lz = (update.z & 0xf);
      const stateId = update.block?.stateId ?? update.stateId ?? 0;

      if (!chunk.subChunks.has(cy)) {
        chunk.subChunks.set(cy, new Uint32Array(4096));
      }
      const idx = (lx << 8) | (lz << 4) | ly;
      chunk.subChunks.get(cy)[idx] = stateId;
    } catch { /* skip individual failures */ }
  }
}

/**
 * Create a blank chunk.
 */
export async function createBlankChunk(cx, cz) {
  return { x: cx, z: cz, subChunks: new Map(), decoded: false, rawSize: 0 };
}
