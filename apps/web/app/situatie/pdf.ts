// Alleen in de browser: pdf.js en canvas. Geen Vitest-test; geen statische import van pdfjs-dist,
// zodat het buiten SSR en buiten de eerste bundel blijft (laadt pas in `laadPdf`).
import { rasterSchaal, verkleinMaat } from "./raster";

export type PdfRaster = { blob: Blob; breedte: number; hoogte: number };

export type PdfDocument = {
  aantalPaginas: number;
  /** PNG van pagina `nr` (1-gebaseerd) met een lange zijde van `maxPx`. */
  voorbeeld(nr: number, maxPx: number): Promise<Blob>;
  /** PNG van pagina `nr` op 300 dpi, begrensd op de maximale lange zijde. */
  raster(nr: number): Promise<PdfRaster>;
  /** Geeft het pdf.js-document, de loading task en de worker vrij. */
  sluit(): Promise<void>;
};

function maakCanvas(breedte: number, hoogte: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = breedte;
  canvas.height = hoogte;
  return canvas;
}

/** Laat de browser het canvas geheugen vrijgeven. */
function leegCanvas(canvas: HTMLCanvasElement): void {
  canvas.width = 0;
  canvas.height = 0;
}

function canvasNaarBlob(
  canvas: HTMLCanvasElement,
  type: string,
  kwaliteit?: number,
): Promise<Blob> {
  return new Promise((los, weiger) => {
    canvas.toBlob(
      (blob) =>
        blob ? los(blob) : weiger(new Error("Canvas kon niet worden omgezet")),
      type,
      kwaliteit,
    );
  });
}

export async function laadPdf(data: ArrayBuffer): Promise<PdfDocument> {
  const [pdfjs, werker] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = werker.default;

  // pdf.js geeft de buffer door aan de worker (detached); werk dus op een kopie.
  const taak = pdfjs.getDocument({ data: new Uint8Array(data.slice(0)) });
  let document: Awaited<typeof taak.promise>;
  try {
    document = await taak.promise;
  } catch (fout) {
    await taak.destroy();
    throw fout;
  }

  async function render(
    nr: number,
    schaalVoor: (breedte_pt: number, hoogte_pt: number) => number,
  ): Promise<PdfRaster> {
    const pagina = await document.getPage(nr);
    const canvas = maakCanvas(1, 1);
    try {
      const basis = pagina.getViewport({ scale: 1 });
      const viewport = pagina.getViewport({
        scale: schaalVoor(basis.width, basis.height),
      });
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      await pagina.render({ canvas, viewport }).promise;
      const blob = await canvasNaarBlob(canvas, "image/png");
      return { blob, breedte: canvas.width, hoogte: canvas.height };
    } finally {
      pagina.cleanup();
      leegCanvas(canvas);
    }
  }

  return {
    aantalPaginas: document.numPages,
    async voorbeeld(nr, maxPx) {
      const { blob } = await render(nr, (b, h) => maxPx / Math.max(b, h));
      return blob;
    },
    raster: (nr) => render(nr, rasterSchaal),
    async sluit() {
      await document.cleanup();
      // Vernietigt ook het document en de worker.
      await taak.destroy();
    },
  };
}

/** Brengt een PNG of JPEG terug tot een lange zijde van hoogstens `MAX_RASTER_PX`. */
export async function verkleinAfbeelding(bestand: Blob): Promise<PdfRaster> {
  const bitmap = await createImageBitmap(bestand);
  try {
    const doel = verkleinMaat(bitmap.width, bitmap.height);
    if (doel.breedte === bitmap.width && doel.hoogte === bitmap.height) {
      return { blob: bestand, breedte: bitmap.width, hoogte: bitmap.height };
    }
    const canvas = maakCanvas(doel.breedte, doel.hoogte);
    try {
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas niet beschikbaar");
      context.drawImage(bitmap, 0, 0, doel.breedte, doel.hoogte);
      // JPEG blijft JPEG, zodat een foto niet als (veel grotere) PNG terugkomt.
      const jpeg = bestand.type === "image/jpeg";
      const blob = await canvasNaarBlob(
        canvas,
        jpeg ? "image/jpeg" : "image/png",
        jpeg ? 0.92 : undefined,
      );
      return { blob, breedte: doel.breedte, hoogte: doel.hoogte };
    } finally {
      leegCanvas(canvas);
    }
  } finally {
    bitmap.close();
  }
}
