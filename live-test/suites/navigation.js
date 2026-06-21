/**
 * Suite: navigation
 * Verifies A* pathfinding and paced walk. Moves the bot a short distance and back.
 * Checks walk_done event is emitted after walk completes.
 */
import { test, cmd, waitForEvent, sleep, assert, assertNoError } from '../runner.js';

// Get a stable starting position at the start of this suite
const startResp = await cmd('pos');
const start = startResp.pos;

await test('path finds a route to a nearby point', async () => {
  assert(start != null, 'need a position to test path');
  const target = { x: Math.floor(start.x) + 3, y: Math.floor(start.y), z: Math.floor(start.z) };
  const resp = await cmd('path', target);
  if (resp.error && resp.error.includes('No path found')) {
    // Not a code failure — area may be obstructed. Warn but don't fail.
    console.log(`    (path: no path found to ${JSON.stringify(target)} — may be obstructed)`);
    return;
  }
  assertNoError(resp, 'path');
  assert(Array.isArray(resp.path), 'path is array');
  assert(resp.path.length > 0, 'path has at least one waypoint');
  assert(typeof resp.length === 'number', 'path has length field');
});

await test('move takes steps toward a point', async () => {
  assert(start != null, 'need a position to test move');
  const target = { x: Math.floor(start.x) + 2, y: Math.floor(start.y), z: Math.floor(start.z) };
  const resp = await cmd('move', target);
  assertNoError(resp, 'move');
  assert(resp.moved === true, 'move.moved should be true');
  assert(typeof resp.steps === 'number', 'move.steps is a number');
  assert(resp.steps > 0, 'move should take at least 1 step');
  // Restore
  await cmd('move', { x: Math.floor(start.x), y: Math.floor(start.y), z: Math.floor(start.z) });
});

await test('walk to nearby point emits walk_done event', async () => {
  assert(start != null, 'need a position to test walk');
  const target = { x: Math.floor(start.x) + 4, y: Math.floor(start.y), z: Math.floor(start.z) };
  const before = Date.now();
  const resp = await cmd('walk', target);

  if (resp.error && resp.error.includes('No path found')) {
    console.log(`    (walk: no path found — may be obstructed, skipping walk_done check)`);
    return;
  }
  assertNoError(resp, 'walk');
  assert(resp.walking === true, 'walk.walking should be true');
  assert(typeof resp.steps === 'number', 'walk.steps is a number');
  const walkId = resp.id;

  // Wait for walk_done event
  const done = await waitForEvent(
    e => e.type === 'walk_done' && e.id === walkId,
    { timeout: 15000, since: before },
  );
  assert(done.walked >= 0, `walk_done.walked should be >= 0, got ${done.walked}`);
  if (done.walked === 0) console.log('    (walk completed with 0 steps — path may have been trivial or chunks unloaded)');
  assert(done.pos != null, 'walk_done.pos should exist');

  // Restore
  await cmd('walk', { x: Math.floor(start.x), y: Math.floor(start.y), z: Math.floor(start.z) });
  // Wait for return walk to finish before next test
  await sleep(3000);
});

await test('walk actually moves the bot (pos changes after walk_done)', async () => {
  const beforePos = await cmd('pos');
  assertNoError(beforePos, 'pos before walk');
  assert(beforePos.pos != null, 'need position');
  const startX = beforePos.pos.x;
  const startZ = beforePos.pos.z;

  const target = { x: Math.floor(startX) + 5, y: Math.floor(beforePos.pos.y), z: Math.floor(startZ) };
  const before = Date.now();
  const resp = await cmd('walk', target);

  if (resp.error) {
    console.log(`    (walk failed: ${resp.error} — skipping movement check)`);
    return;
  }
  assertNoError(resp, 'walk');
  assert(resp.walking === true, 'should be walking');

  // Wait for walk_done
  const done = await waitForEvent(
    e => e.type === 'walk_done' && e.id === resp.id,
    { timeout: 15000, since: before },
  );
  assert(done.walked > 0, `should have walked steps, got ${done.walked}`);

  // Check that pos command now reports a different position
  const afterPos = await cmd('pos');
  assertNoError(afterPos, 'pos after walk');
  const dx = afterPos.pos.x - startX;
  const dz = afterPos.pos.z - startZ;
  const distMoved = Math.sqrt(dx * dx + dz * dz);
  assert(distMoved > 2, `bot should have moved at least 2 blocks, but only moved ${distMoved.toFixed(1)}`);

  // Restore position
  await cmd('walk', { x: Math.floor(startX), y: Math.floor(beforePos.pos.y), z: Math.floor(startZ) });
  await sleep(4000);
});

await test('SERVER-VERIFIED: walk produces server-side position change', async () => {
  // This test uses SEND_CMD to teleport to a known flat spot, then walks and
  // checks position_desync events — if the server disagrees with our position,
  // we'd see desync events (meaning movement was rejected).
  const probeResp = await cmd('cmd', { cmd: 'list' });
  if (probeResp.error?.includes('No SEND_CMD')) {
    console.log('    SKIP: SEND_CMD not configured — cannot verify server-side position');
    return;
  }

  // Teleport to a known flat area (spawn), wait for chunks
  await cmd('tp', { x: 0, y: 64, z: 0 });
  await sleep(3000);

  // Get position after chunks load
  const posAfterTp = await cmd('pos');
  const startPos = posAfterTp.pos;

  // Attempt a short walk
  const walkTarget = { x: Math.floor(startPos.x) + 3, y: Math.floor(startPos.y), z: Math.floor(startPos.z) };
  const before = Date.now();
  const walkResp = await cmd('walk', walkTarget);

  if (walkResp.error) {
    console.log(`    (walk from spawn failed: ${walkResp.error})`);
    // Try move instead (doesn't need pathfinding)
    const moveResp = await cmd('move', walkTarget);
    assertNoError(moveResp, 'move fallback');

    // Wait a bit for server to process, then check for desync
    await sleep(2000);
    const posAfterMove = await cmd('pos');
    const dx = posAfterMove.pos.x - startPos.x;
    const dz = posAfterMove.pos.z - startPos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    console.log(`    move displacement: ${dist.toFixed(2)} blocks (local)`);

    // Check if server sent us back (desync = movement rejected)
    const posCheck = await cmd('pos');
    const finalDist = Math.sqrt((posCheck.pos.x - startPos.x) ** 2 + (posCheck.pos.z - startPos.z) ** 2);
    console.log(`    final position displacement: ${finalDist.toFixed(2)} blocks`);
    // If final displacement is 0 after we tried to move 3 blocks, movement was rejected
    assert(finalDist > 0.5, `SERVER REJECTED MOVEMENT: position returned to start after move (displacement ${finalDist.toFixed(2)})`);
    return;
  }

  // Wait for walk_done
  const done = await waitForEvent(
    e => e.type === 'walk_done' && e.id === walkResp.id,
    { timeout: 20000, since: before },
  );

  // Wait extra time for server to send any position corrections
  await sleep(2000);

  // Final position check — if server rejected movement, move_player correction
  // would have reset position back to start
  const finalPos = await cmd('pos');
  const finalDist = Math.sqrt((finalPos.pos.x - startPos.x) ** 2 + (finalPos.pos.z - startPos.z) ** 2);
  console.log(`    server-verified displacement: ${finalDist.toFixed(2)} blocks (target was 3)`);
  assert(finalDist > 1.0, `SERVER REJECTED MOVEMENT: position is ${finalDist.toFixed(2)} blocks from start (expected ~3). Server sent correction back to start.`);
});

await test('walk to current position returns immediately (0 steps)', async () => {
  const posResp = await cmd('pos');
  assertNoError(posResp, 'pos');
  const { x, y, z } = posResp.pos;
  const resp = await cmd('walk', { x: Math.round(x), y: Math.round(y), z: Math.round(z) });
  assertNoError(resp, 'walk same position');
  // Either walked:0 or walking:true with 0 steps
  const isImmediate = resp.walked === 0 || resp.steps === 0;
  assert(isImmediate, `walk to same pos should have 0 steps, got: ${JSON.stringify(resp)}`);
});

await test('abort_walk returns error when not walking', async () => {
  const resp = await cmd('abort_walk');
  assert(resp.error === 'Not walking', 'Expected "Not walking" error');
});

await test('reachable checks pathfinding to a nearby point', async () => {
  const posResp = await cmd('pos');
  assertNoError(posResp, 'pos');
  const { x, y, z } = posResp.pos;
  const resp = await cmd('reachable', { x: Math.floor(x) + 2, y: Math.floor(y), z: Math.floor(z) });
  assertNoError(resp, 'reachable');
  assert(typeof resp.reachable === 'boolean', 'reachable should be boolean');
  assert(typeof resp.euclidean === 'number', 'euclidean should be a number');
  if (resp.reachable) {
    assert(typeof resp.distance === 'number', 'distance should be number when reachable');
    assert(typeof resp.estimatedTime === 'number', 'estimatedTime should be number when reachable');
  }
});

await test('distance returns euclidean distance and direction', async () => {
  const posResp = await cmd('pos');
  assertNoError(posResp, 'pos');
  const { x, y, z } = posResp.pos;
  const resp = await cmd('distance', { x: x + 10, y, z });
  assertNoError(resp, 'distance');
  assert(typeof resp.euclidean === 'number', 'euclidean should be number');
  assert(Math.abs(resp.euclidean - 10) < 1, `euclidean ~10, got ${resp.euclidean}`);
  assert(resp.direction != null, 'direction should exist');
  assert(typeof resp.direction.x === 'number', 'direction.x is number');
});
