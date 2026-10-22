// Zuivere hulp om een link uit de platte tekst van een mail te halen. Geen Playwright- of
// netwerkimport, zodat Vitest ze rechtstreeks kan testen. We lezen de platte tekst (niet de
// html): daar staat de link ongewijzigd, zonder `&amp;`.

function escapeRegex(tekst: string): string {
  return tekst.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

/** De eerste link die met `basisUrl` + `/` begint, tot het eerste spatieteken of `<`, `>`, `"`. */
export function linkUitTekst(tekst: string, basisUrl: string): string {
  const basis = basisUrl.replace(/\/+$/, "");
  const treffer = tekst.match(new RegExp(`${escapeRegex(basis)}/[^\\s<>"]+`));
  if (!treffer) throw new Error(`Geen link naar ${basis} in de mail`);
  return treffer[0];
}
