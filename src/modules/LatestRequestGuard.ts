/**
 * Tracks the newest asynchronous request for each logical resource.
 *
 * Work that finishes after a newer request started can use `isCurrent` before
 * committing its result, preventing stale network responses from overwriting
 * current UI state.
 */
export class LatestRequestGuard<Key> {
  private readonly generations = new Map<Key, number>();

  begin(key: Key): number {
    const generation = (this.generations.get(key) ?? 0) + 1;
    this.generations.set(key, generation);
    return generation;
  }

  isCurrent(key: Key, generation: number): boolean {
    return this.generations.get(key) === generation;
  }

  invalidate(key: Key): void {
    this.begin(key);
  }
}
