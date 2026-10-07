// Pure sync decision logic (no browser / Firebase dependencies, unit-testable).

/**
 * Decide what to do on sync.
 * @param {number} localTs  timestamp (ms) of the local encrypted vault (0 if unknown)
 * @param {number|undefined|null} remoteTs  timestamp of the cloud copy; none when no copy exists
 * @param {number} lastSeenTs  cloud timestamp this device last synced with (0 if never)
 * @returns {'push'|'pull'|'none'|'conflict'}
 */
export function decideSync(localTs, remoteTs, lastSeenTs = 0) {
  if (remoteTs === undefined || remoteTs === null) return 'push';
  if (remoteTs === localTs) return 'none';
  if (!lastSeenTs) return 'conflict'; // both sides have data and we never synced before
  const localChanged = localTs > lastSeenTs;
  const remoteChanged = remoteTs > lastSeenTs;
  if (localChanged && remoteChanged) return 'conflict';
  if (remoteChanged) return 'pull';
  if (localChanged) return 'push';
  return remoteTs > localTs ? 'pull' : 'push';
}
