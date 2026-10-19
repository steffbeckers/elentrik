/** Valt de bestandsnaam na het saneren leeg uit, dan geldt deze naam. */
const STANDAARD_DOWNLOADNAAM = "export.pdf";

/** Tekens die in een bestandsnaam niet mogen: `"\/:*?<>|`. */
const VERBODEN = /["\\/:*?<>|]/g;
/** Stuurtekens (C0, DEL en C1). */
const STUURTEKENS = /[\u0000-\u001f\u007f-\u009f]/g;

/** Verwijdert verboden tekens, maakt van stuurtekens een spatie en voegt witruimte samen. */
function saneerBestandsnaam(naam: string): string {
  const schoon = naam.replace(STUURTEKENS, " ").replace(VERBODEN, "").replace(/\s+/g, " ").trim();
  return schoon === "" ? STANDAARD_DOWNLOADNAAM : schoon;
}

/** Een ASCII-vorm voor `filename`: accenten weg, wat dan nog geen ASCII is wordt `_`. */
function asciiVorm(naam: string): string {
  const zonderAccenten = naam.normalize("NFKD").replace(/\p{M}/gu, "");
  return Array.from(zonderAccenten, (teken) => (/^[ -~]$/.test(teken) ? teken : "_")).join("");
}

/** RFC 5987: UTF-8, procentgecodeerd; ook `'()*` worden gecodeerd. */
function rfc5987(naam: string): string {
  return encodeURIComponent(naam).replace(
    /['()*]/g,
    (teken) => `%${teken.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`,
  );
}

function contentDisposition(download: string | undefined): string {
  if (download === undefined) return "inline";
  const naam = saneerBestandsnaam(download);
  return `attachment; filename="${asciiVorm(naam)}"; filename*=UTF-8''${rfc5987(naam)}`;
}

/**
 * Headers voor een opgeslagen bestand: nooit sniffen, onveranderlijk gecachet, standaard inline.
 * Met `download` wordt het een bijlage met een gesaneerde bestandsnaam, ook als RFC 5987 `filename*`.
 * De CSP zet een rechtstreeks geopend bestand in een sandbox zonder scripts of andere bronnen.
 */
export function bestandHeaders(mime: string, opties: { download?: string } = {}): Record<string, string> {
  return {
    "Content-Type": mime,
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": contentDisposition(opties.download),
    "Content-Security-Policy": "sandbox; default-src 'none'",
    "Cache-Control": "private, max-age=31536000, immutable",
  };
}
