// De versie van de app: de korte git-sha (7 tekens) van het image, gedeeld door de server en de client.
// Eén bron: ELENTRIK_REVISIE, die de image-workflow als build-arg meegeeft (de volledige sha). Lokaal en
// in de tests is die leeg: dan is er geen versie. Expliciet geïmporteerd (ruling E1).

const SHA = /^[0-9a-f]{7,64}$/i;

/** De korte sha uit ELENTRIK_REVISIE, of `null` als die leeg is of geen sha. */
export function leesVersie(env: Record<string, string | undefined>): string | null {
  const revisie = env.ELENTRIK_REVISIE?.trim();
  return revisie && SHA.test(revisie) ? revisie.slice(0, 7).toLowerCase() : null;
}
