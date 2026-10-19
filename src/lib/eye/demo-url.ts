/** Build a shareable URL for the read-only sample-fleet demo page. */
export function buildSignalsDemoUrl(origin: string, token: string): string {
  const url = new URL("/signals", origin);
  url.searchParams.set("t", token);
  return url.toString();
}
