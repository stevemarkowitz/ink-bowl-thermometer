/** www.<domain> -> <domain>, keeping path and query. Returns a URL to redirect to, or null. */
export function canonicalRedirect(url) {
  if (!url.hostname.startsWith('www.')) return null;
  const to = new URL(url);
  to.hostname = url.hostname.slice(4);
  return to.toString();
}
