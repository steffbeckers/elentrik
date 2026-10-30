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

/**
 * De bestemming als ze een veilig relatief pad is, anders `null`. Veilig: begint met precies één `/`
 * (dus niet `//` of `/\`, wat een browser als een ander domein leest, en geen schema), zonder `\` of
 * stuurtekens. De waarde reist URL-gecodeerd en een tussenstap kan haar al eens gedecodeerd hebben:
 * daarom moet zowel de waarde zelf als haar gedecodeerde vorm veilig zijn (`%2F%2Fevil.example` valt
 * weg). Het resultaat is de waarde zoals ze binnenkwam.
 */
export function veiligTerugpad(waarde: unknown): string | null {
  if (typeof waarde !== "string") return null;
  let gedecodeerd: string;
  try {
    gedecodeerd = decodeURIComponent(waarde);
  } catch {
    return null;
  }
  return isLokaalPad(waarde) && isLokaalPad(gedecodeerd) ? waarde : null;
}
