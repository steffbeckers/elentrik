/** Valt de bestandsnaam na het saneren leeg uit, dan geldt deze naam. */
export const STANDAARD_DOWNLOADNAAM = "export.pdf";

/** Zoveel tekens (codepunten) mag een downloadnaam hebben vóór de extensie. */
const MAX_NAAM_TEKENS = 150;

/** Tekens die in een bestandsnaam niet mogen: `"\/:*?<>|`. */
const VERBODEN = /["\\/:*?<>|]/g;
/** Stuurtekens (C0, DEL en C1). */
const STUURTEKENS = /[\u0000-\u001f\u007f-\u009f]/g;

/** Verwijdert verboden tekens, maakt van stuurtekens een spatie en voegt witruimte samen. */
function zuiver(naam: string): string {
  return naam.replace(STUURTEKENS, " ").replace(VERBODEN, "").replace(/\s+/g, " ").trim();
}

/** Kapt de naam af op `MAX_NAAM_TEKENS` codepunten vóór de extensie (zoals `.pdf`), die blijft staan. */
function afgekapt(naam: string): string {
  const punt = naam.lastIndexOf(".");
  const extensie = punt > 0 && naam.length - punt <= 5 ? naam.slice(punt) : "";
  const stam = Array.from(naam.slice(0, naam.length - extensie.length));
  if (stam.length <= MAX_NAAM_TEKENS) return naam;
  return stam.slice(0, MAX_NAAM_TEKENS).join("").trimEnd() + extensie;
}

/** De gesaneerde, afgekapte naam; leeg wordt `export.pdf`. */
function saneerBestandsnaam(naam: string): string {
  const schoon = zuiver(naam);
  return schoon === "" ? STANDAARD_DOWNLOADNAAM : afgekapt(schoon);
}

/**
 * Een ASCII-vorm voor `filename`: accenten weg, wat dan nog geen ASCII is wordt `_`. NFKD brengt
 * volbrede tekens terug naar hun ASCII-vorm (U+FF02 wordt `"`, U+FF3C `\`), dus wordt de uitkomst
 * opnieuw gezuiverd. `;` en `=` worden `_`, zodat ook een naïeve parser geen extra parameter ziet.
 */
function asciiVorm(naam: string): string {
  const zonderAccenten = naam.normalize("NFKD").replace(/\p{M}/gu, "");
  const ascii = Array.from(zonderAccenten, (teken) => (/^[ -~]$/.test(teken) ? teken : "_")).join("");
  const veilig = zuiver(ascii.replace(/[;=]/g, "_"));
  return veilig === "" ? STANDAARD_DOWNLOADNAAM : afgekapt(veilig);
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
