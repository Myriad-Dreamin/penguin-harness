/**
 * Race a promise against a deadline, without ever leaking a rejection.
 *
 * A fuzz call that outlives its deadline is a finding (the caller throws), so the wrapper
 * must always settle: the guarded chain resolves whether the promise resolved or rejected,
 * and a rejection that arrives after the timer already decided cannot become an
 * `unhandledRejection` — the very crash face this harness exists to keep impossible.
 */
export function withSoftTimeout<T>(
  promise: Promise<T>,
  ms: number,
): Promise<{ ok: true; value: T } | { ok: false; threw: Error | null }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const guarded = promise.then(
    (value) => ({ ok: true as const, value, threw: null as Error | null }),
    (err: unknown) => ({
      ok: false as const,
      value: undefined as T | undefined,
      threw: err instanceof Error ? err : new Error(String(err)),
    }),
  );
  const timeout = new Promise<{ ok: false; value: undefined; threw: null }>((resolve) => {
    timer = setTimeout(() => resolve({ ok: false, value: undefined, threw: null }), ms);
  });
  return Promise.race([guarded, timeout]).finally(() => clearTimeout(timer));
}
