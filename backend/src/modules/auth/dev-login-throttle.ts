/**
 * A global ceiling on wrong dev-login passcodes.
 *
 * The per-address limiter cannot carry this on its own: the frontend proxy
 * forwards whatever X-Forwarded-For the caller sends, so an address-keyed
 * bucket can be rotated by anyone willing to vary that header. One counter for
 * the whole endpoint cannot be rotated around, and dev login is a stopgap admin
 * path rather than something a crowd signs in through, so a shared ceiling
 * costs nothing real.
 *
 * Only wrong guesses count. Refusing a correct passcode once the ceiling is hit
 * would let anyone lock the real owner out by guessing badly on purpose.
 */
const MAX_FAILURES = 10;
const WINDOW_MS = 15 * 60 * 1000;

export class DevLoginThrottle {
  private failures: number[] = [];

  constructor(
    private readonly maxFailures = MAX_FAILURES,
    private readonly windowMs = WINDOW_MS,
  ) {}

  /** Records a wrong passcode. Returns true once the window is exhausted. */
  recordFailure(now = Date.now()): boolean {
    this.failures.push(now);
    return this.isExhausted(now);
  }

  isExhausted(now = Date.now()): boolean {
    const cutoff = now - this.windowMs;
    while (this.failures.length && (this.failures[0] ?? 0) < cutoff) this.failures.shift();
    return this.failures.length >= this.maxFailures;
  }
}

export const devLoginThrottle = new DevLoginThrottle();
