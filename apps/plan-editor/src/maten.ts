/** Maatopmaak met de interfacetaal: decimale komma voor nl/fr, punt voor en. */
function getal(waarde: number, taal: string, min: number, max: number): string {
  return new Intl.NumberFormat(taal, { minimumFractionDigits: min, maximumFractionDigits: max }).format(waarde);
}

export function formatteerMaat(meter: number, taal: string, decimalen = 1): string {
  return `${getal(meter, taal, decimalen, decimalen)} m`;
}

export function formatteerOppervlak(vierkanteMeter: number, taal: string, decimalen = 1): string {
  return `${getal(vierkanteMeter, taal, decimalen, decimalen)} m²`;
}

/** Zoals `formatteerMaat`, maar hele meters zonder decimalen en hoogstens `max` decimalen. */
export function formatteerMaatKort(meter: number, taal: string, max = 2): string {
  return `${getal(meter, taal, 0, max)} m`;
}
