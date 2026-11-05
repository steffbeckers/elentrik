/** Alleen ingebakken aantaltekst verwijderen; het symbool en zijn aantalstreep blijven identiek. */
export function zonderAantallen(svg: string): string {
  return svg.replace(/<text\b[^>]*\bdata-rol="aantal"[^>]*>[\s\S]*?<\/text>/g, "");
}
