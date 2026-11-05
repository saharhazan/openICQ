/** Checks the Origin header of state-changing requests and WebSocket upgrades. */
export class OriginPolicy {
  private readonly allowed: ReadonlySet<string>;

  constructor(allowedOrigins: readonly string[]) {
    this.allowed = new Set(allowedOrigins);
  }

  /** A missing Origin is rejected: browsers always send it on POST and on WebSocket upgrades. */
  isAllowed(origin: string | undefined): boolean {
    return origin !== undefined && this.allowed.has(origin);
  }
}
