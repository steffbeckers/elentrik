/**
 * Headers voor een opgeslagen planbestand: nooit sniffen, altijd inline, onveranderlijk gecachet.
 * De CSP zet een rechtstreeks geopend bestand in een sandbox zonder scripts of andere bronnen.
 */
export function bestandHeaders(mime: string): Record<string, string> {
  return {
    "Content-Type": mime,
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": "inline",
    "Content-Security-Policy": "sandbox; default-src 'none'",
    "Cache-Control": "private, max-age=31536000, immutable",
  };
}
