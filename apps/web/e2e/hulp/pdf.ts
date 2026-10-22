// Leest een PDF in het Node-proces van de test: het aantal pagina's, de tekst en het aantal
// afbeeldingen (paint-operatoren van de operatorlijst) per pagina.
// De legacy-build van pdfjs-dist draait zonder DOM; de worker laadt pdfjs zelf in Node.
export async function leesPdf(bytes: Uint8Array): Promise<{ aantalPaginas: number; paginaTeksten: string[]; afbeeldingenPerPagina: number[] }> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const taak = pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
  const pdf = await taak.promise;
  try {
    const paginaTeksten: string[] = [];
    const afbeeldingenPerPagina: number[] = [];
    const beeldOperatoren = new Set<number>([
      pdfjs.OPS.paintImageXObject,
      pdfjs.OPS.paintInlineImageXObject,
      pdfjs.OPS.paintImageMaskXObject,
    ]);
    for (let nummer = 1; nummer <= pdf.numPages; nummer++) {
      const pagina = await pdf.getPage(nummer);
      const inhoud = await pagina.getTextContent();
      paginaTeksten.push(inhoud.items.map((item) => ("str" in item ? item.str : "")).join(" "));
      const lijst = await pagina.getOperatorList();
      afbeeldingenPerPagina.push(lijst.fnArray.filter((fn) => beeldOperatoren.has(fn)).length);
      pagina.cleanup();
    }
    return { aantalPaginas: pdf.numPages, paginaTeksten, afbeeldingenPerPagina };
  } finally {
    await taak.destroy();
  }
}
