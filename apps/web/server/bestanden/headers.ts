/** Headers voor een opgeslagen planbestand: nooit sniffen, altijd inline, onveranderlijk gecachet. */
export function bestandHeaders(mime: string): Record<string, string> {
  return {
    "Content-Type": mime,
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": "inline",
    "Cache-Control": "private, max-age=31536000, immutable",
  };
}
