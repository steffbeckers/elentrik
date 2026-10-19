// Client voor Gotenberg 8 (Chromium: HTML naar PDF).
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module
// rechtstreeks (ruling E1). Alleen Node's globale fetch, FormData en Blob.

export type PdfFoutCode = "ONBEREIKBAAR" | "TIMEOUT" | "MISLUKT";

export class PdfFout extends Error {
  readonly code: PdfFoutCode;

  constructor(code: PdfFoutCode, bericht: string) {
    super(bericht);
    this.name = "PdfFout";
    this.code = code;
  }
}

export interface PdfInvoer {
  html: string;
  bestanden: { naam: string; data: Uint8Array; mime: string }[];
  papier: "A4" | "A3";
}

export interface PdfOpties {
  fetch?: typeof fetch;
  url?: string;
  timeoutMs?: number;
}

const STANDAARD_URL = "http://127.0.0.1:3001";
const STANDAARD_TIMEOUT_MS = 60_000;
const MM_PER_INCH = 25.4;

/** Liggend papier in mm (breedte × hoogte). */
const PAPIER_MM: Record<PdfInvoer["papier"], { breedte: number; hoogte: number }> = {
  A4: { breedte: 297, hoogte: 210 },
  A3: { breedte: 420, hoogte: 297 },
};

const PDF_KOP = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

function maakFormulier(invoer: PdfInvoer): FormData {
  const form = new FormData();
  form.append("files", new Blob([invoer.html], { type: "text/html" }), "index.html");
  for (const bestand of invoer.bestanden) {
    form.append("files", new Blob([bestand.data as BlobPart], { type: bestand.mime }), bestand.naam);
  }
  const { breedte, hoogte } = PAPIER_MM[invoer.papier];
  form.append("paperWidth", String(breedte / MM_PER_INCH));
  form.append("paperHeight", String(hoogte / MM_PER_INCH));
  for (const rand of ["marginTop", "marginBottom", "marginLeft", "marginRight"]) {
    form.append(rand, "0");
  }
  form.append("printBackground", "true");
  form.append("preferCssPageSize", "true");
  return form;
}

function isPdf(data: Uint8Array): boolean {
  return PDF_KOP.every((byte, i) => data[i] === byte);
}

/** Eén poging. Gooit een PdfFout; `opnieuw` zegt of een nieuwe poging zin heeft. */
async function eenPoging(
  invoer: PdfInvoer,
  url: string,
  timeoutMs: number,
  haal: typeof fetch,
): Promise<{ pdf: Uint8Array } | { fout: PdfFout; opnieuw: boolean }> {
  const controller = new AbortController();
  let verlopen = false;
  const timer = setTimeout(() => {
    verlopen = true;
    controller.abort();
  }, timeoutMs);
  try {
    const antwoord = await haal(`${url}/forms/chromium/convert/html`, {
      method: "POST",
      body: maakFormulier(invoer),
      signal: controller.signal,
    });
    if (antwoord.status >= 500) {
      return { fout: new PdfFout("MISLUKT", `De PDF-dienst antwoordde met status ${antwoord.status}.`), opnieuw: true };
    }
    if (!antwoord.ok) {
      return { fout: new PdfFout("MISLUKT", `De PDF-dienst weigerde het verzoek (status ${antwoord.status}).`), opnieuw: false };
    }
    const data = new Uint8Array(await antwoord.arrayBuffer());
    if (!isPdf(data)) {
      return { fout: new PdfFout("MISLUKT", "De PDF-dienst gaf geen geldige PDF terug."), opnieuw: false };
    }
    return { pdf: data };
  } catch (e) {
    if (verlopen) {
      return { fout: new PdfFout("TIMEOUT", "De PDF-dienst antwoordde niet op tijd."), opnieuw: true };
    }
    const reden = e instanceof Error ? e.message : String(e);
    return { fout: new PdfFout("ONBEREIKBAAR", `De PDF-dienst is niet bereikbaar (${reden}).`), opnieuw: true };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Zet HTML (plus bijbehorende bestanden) om naar een PDF via Gotenberg.
 * Bij een netwerkfout, een 5xx of een timeout volgt één nieuwe poging.
 */
export async function maakPdf(invoer: PdfInvoer, opties: PdfOpties = {}): Promise<Uint8Array> {
  const haal = opties.fetch ?? fetch;
  const url = (opties.url ?? process.env.ELENTRIK_GOTENBERG_URL ?? STANDAARD_URL).replace(/\/+$/, "");
  const timeoutMs = opties.timeoutMs ?? STANDAARD_TIMEOUT_MS;

  let laatste: PdfFout | undefined;
  for (let poging = 0; poging < 2; poging++) {
    const uitkomst = await eenPoging(invoer, url, timeoutMs, haal);
    if ("pdf" in uitkomst) return uitkomst.pdf;
    laatste = uitkomst.fout;
    if (!uitkomst.opnieuw) break;
  }
  throw laatste ?? new PdfFout("MISLUKT", "De PDF kon niet gemaakt worden.");
}
