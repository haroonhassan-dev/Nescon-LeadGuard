/**
 * App-wide "data changed on the server" signal. Any page that performs a write calls
 * requestSync(); App re-fetches from the backend once, so every screen shows the same records.
 */
const target = new EventTarget();

export function requestSync(): void {
  target.dispatchEvent(new Event('sync'));
}

export function onSyncRequested(fn: () => void): () => void {
  target.addEventListener('sync', fn);
  return () => target.removeEventListener('sync', fn);
}

/** Readable message from any thrown value (ApiClientError carries the server's own message). */
export function errorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'details' in err) {
    const details = (err as { details?: Array<{ message?: string }> }).details;
    const base = err instanceof Error ? err.message : 'Request failed';
    if (Array.isArray(details) && details.length) {
      return `${base} — ${details.map((d) => d.message).filter(Boolean).join('; ')}`;
    }
    return base;
  }
  return err instanceof Error ? err.message : 'Request failed';
}
