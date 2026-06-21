/**
 * ClawCraft — Pure state management
 *
 * Tracks bot position, rotation, and connection state.
 * No I/O — pure data, fully testable.
 */

export function createState() {
  return {
    connected: false,
    spawned: false,
    pos: null,        // { x, y, z }
    yaw: 0,
    pitch: 0,
    headYaw: 0,
    runtimeId: null,
  };
}

export function applyMovePlayer(state, pkt) {
  if (!pkt) return state;
  return {
    ...state,
    pos: pkt.position ? { x: pkt.position.x, y: pkt.position.y, z: pkt.position.z } : state.pos,
    yaw: pkt.yaw ?? state.yaw,
    pitch: pkt.pitch ?? state.pitch,
    headYaw: pkt.head_yaw ?? state.headYaw,
    // Note: runtimeId is intentionally NOT updated here. It is set once from
    // start_game / self add_player. Updating it from move_player would let another
    // entity's packet hijack our identity.
  };
}

export function setPosition(state, x, y, z) {
  return { ...state, pos: { x, y, z } };
}

export function setRotation(state, yaw, pitch) {
  return { ...state, yaw, pitch, headYaw: yaw };
}

export function setConnected(state, connected) {
  return { ...state, connected, spawned: connected ? state.spawned : false };
}

export function setSpawned(state, spawned) {
  return { ...state, spawned };
}
