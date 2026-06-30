/**
 * A marker exports as a still image only (no video clip) when both the pre-roll
 * and post-roll clip windows are zero. Kept in its own electron-free module so
 * the predicate can be unit-tested without loading the main-process IPC graph
 * (which imports `electron` and fails to resolve on CI's Linux runners).
 */
export function isImageOnly(bug: { preSec: number; postSec: number }): boolean {
  return bug.preSec === 0 && bug.postSec === 0
}
