// Wanneer een terugkeer-bestemming (de `terug`-parameter van /inloggen, of de `callbackURL` van een
// link in een mail) veilig is: een relatief pad op dezelfde oorsprong. De server (de foutredirect van
// een mislukte link) en de client (de inlogpagina, de middleware) delen deze ene functie.
// Expliciete import in de server en client (ruling E1): dit bestand importeert niets.

/** Hoogstens zo lang mag een terugkeer-bestemming zijn. */
const MAX_TERUGPAD = 2000;

/** Eén lokaal pad: precies één `/` vooraan, zonder `\` of stuurtekens (een browser schrapt tab en nieuwe regel). */
function isLokaalPad(pad: string): boolean {
  if (pad.length === 0 || pad.length > MAX_TERUGPAD) return false;
  if (!pad.startsWith("/") || pad.startsWith("//")) return false;
  return !/[\u0000-\u001f\u007f\\]/.test(pad);
}

/** Een vaste oorsprong om tegen te normaliseren; het pad blijft er altijd op. */
const BASIS = "http://terugpad.lokaal";

/**
 * Het pad zoals een browser het leest (WHATWG: puntsegmenten `.` en `..`, ook als `%2E`, worden
 * weggewerkt), of `null` als dat niet meer een lokaal pad is. `/.//evil.example` wordt zo
 * `//evil.example`, en dat is een ander domein.
 */
function genormaliseerd(pad: string): string | null {
  if (!isLokaalPad(pad)) return null;
  let url: URL;
  try {
    url = new URL(pad, BASIS);
  } catch {
    return null;
  }
  if (url.origin !== BASIS) return null;
  const uit = `${url.pathname}${url.search}${url.hash}`;
  return isLokaalPad(uit) ? uit : null;
}

/**
 * De bestemming als ze een veilig relatief pad is, anders `null`. Veilig: begint met precies één `/`
 * (dus niet `//` of `/\`, wat een browser als een ander domein leest, en geen schema), zonder `\` of
 * stuurtekens, en ook na normalisatie van puntsegmenten nog zo. De waarde reist URL-gecodeerd en een
 * tussenstap kan haar al eens gedecodeerd hebben: daarom moet zowel de waarde zelf als haar
 * gedecodeerde vorm veilig zijn (`%2F%2Fevil.example` valt weg).
 *
 * Het resultaat is het genormaliseerde pad (met query en hash), niet de ruwe invoer: wie het resultaat
 * gebruikt, gebruikt precies wat gevalideerd is.
 */
export function veiligTerugpad(waarde: unknown): string | null {
  if (typeof waarde !== "string") return null;
  let gedecodeerd: string;
  try {
    gedecodeerd = decodeURIComponent(waarde);
  } catch {
    return null;
  }
  const pad = genormaliseerd(waarde);
  if (pad === null || genormaliseerd(gedecodeerd) === null) return null;
  return pad;
}
