// Leest een PDF in het Node-proces van de test: het aantal pagina's en de tekst per pagina.
// De legacy-build van pdfjs-dist draait zonder DOM; de worker laadt pdfjs zelf in Node.
export async function leesPdf(bytes: Uint8Array): Promise<{ aantalPaginas: number; paginaTeksten: string[] }> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const taak = pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
  const pdf = await taak.promise;
  try {
    const paginaTeksten: string[] = [];
    for (let nummer = 1; nummer <= pdf.numPages; nummer++) {
      const pagina = await pdf.getPage(nummer);
      const inhoud = await pagina.getTextContent();
      paginaTeksten.push(inhoud.items.map((item) => ("str" in item ? item.str : "")).join(" "));
      pagina.cleanup();
    }
    return { aantalPaginas: pdf.numPages, paginaTeksten };
  } finally {
    await taak.destroy();
  }
}
