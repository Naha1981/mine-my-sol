import icons from './icons.json' with { type: 'json' };
const links = '<link rel="icon" type="image/x-icon" sizes="16x16 32x32 48x48 64x64" href="/favicon.ico?v=2"><link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png?v=2"><link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png?v=2"><link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?v=2">';
export function rewriteIcons(html) {
  return html.replace(/<head\b[^>]*>[\s\S]*?<\/head>/i, (head) => head
    .replace(/<link\b[^>]*\brel=["'][^"']*\b(?:icon|apple-touch-icon)\b[^"']*["'][^>]*>/gi, '')
    .replace(/<\/head>/i, links + '</head>'));
}
export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    const icon = icons[path];
    if (icon && (request.method === 'GET' || request.method === 'HEAD')) {
      const bytes = Uint8Array.from(atob(icon.base64), (c) => c.charCodeAt(0));
      return new Response(request.method === 'HEAD' ? null : bytes, { headers: { 'content-type': icon.type, 'cache-control': 'public, max-age=86400' } });
    }
    // ASSETS points to the already-deployed 24Oct asset set. No build/upload.
    const response = await env.ASSETS.fetch(request);
    if (request.method !== 'GET' || !(response.headers.get('content-type') || '').includes('text/html')) return response;
    const html = await response.text();
    const headers = new Headers(response.headers);
    headers.delete('content-length'); headers.delete('etag');
    return new Response(rewriteIcons(html), { status: response.status, statusText: response.statusText, headers });
  },
};
