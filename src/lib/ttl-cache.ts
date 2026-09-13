export class TtlCache<T> {
  private readonly values = new Map<string, { expiresAt: number; value: T }>();

  constructor(private readonly ttlMs: number) {}

  get(key: string) {
    const current = this.values.get(key);
    if (!current) return undefined;
    if (current.expiresAt <= Date.now()) {
      this.values.delete(key);
      return undefined;
    }
    return current.value;
  }

  set(key: string, value: T, ttlMs = this.ttlMs) {
    this.values.set(key, { value, expiresAt: Date.now() + ttlMs });
    return value;
  }
}
