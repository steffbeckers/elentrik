import { describe, expect, test, vi } from "vitest";
import { maakPdf, PdfFout } from "../server/pdf/gotenberg";

const pdfBytes = new TextEncoder().encode("%PDF-1.7\n%test");
const invoer = {
  html: "<p>Hallo</p>",
  bestanden: [{ naam: "logo.png", data: new Uint8Array([1, 2, 3]), mime: "image/png" }],
  papier: "A4" as const,
};

function pdfAntwoord(): Response {
  return new Response(pdfBytes, { status: 200, headers: { "Content-Type": "application/pdf" } });
}

describe("maakPdf", () => {
  test("succes: één aanroep met de juiste velden en index.html", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => pdfAntwoord());
    const pdf = await maakPdf(invoer, { fetch: fetchMock as unknown as typeof fetch, url: "http://gotenberg.test" });
    expect(Array.from(pdf)).toEqual(Array.from(pdfBytes));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://gotenberg.test/forms/chromium/convert/html");
    expect(init?.method).toBe("POST");
    const form = init?.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect(Number(form.get("paperWidth"))).toBeCloseTo(297 / 25.4, 4);
    expect(Number(form.get("paperHeight"))).toBeCloseTo(210 / 25.4, 4);
    for (const rand of ["marginTop", "marginBottom", "marginLeft", "marginRight"]) {
      expect(form.get(rand)).toBe("0");
    }
    expect(form.get("printBackground")).toBe("true");
    expect(form.get("preferCssPageSize")).toBe("true");
    const namen = form.getAll("files").map((f) => (f as File).name);
    expect(namen).toEqual(["index.html", "logo.png"]);
    expect(await (form.getAll("files")[0] as File).text()).toBe("<p>Hallo</p>");
  });

  test("A3 gebruikt 420 × 297 mm liggend", async () => {
    const fetchMock = vi.fn(async (_u: string | URL | Request, _i?: RequestInit) => pdfAntwoord());
    await maakPdf({ ...invoer, papier: "A3" }, { fetch: fetchMock as unknown as typeof fetch, url: "http://g.test" });
    const form = fetchMock.mock.calls[0]![1]?.body as FormData;
    expect(Number(form.get("paperWidth"))).toBeCloseTo(420 / 25.4, 4);
    expect(Number(form.get("paperHeight"))).toBeCloseTo(297 / 25.4, 4);
  });

  test("eerst een 503 en dan succes geeft twee aanroepen", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("nee", { status: 503 }))
      .mockResolvedValueOnce(pdfAntwoord());
    const pdf = await maakPdf(invoer, { fetch: fetchMock as unknown as typeof fetch, url: "http://g.test" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(pdf.length).toBe(pdfBytes.length);
  });

  test("twee keer een netwerkfout geeft ONBEREIKBAAR", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    const fout = await maakPdf(invoer, { fetch: fetchMock as unknown as typeof fetch, url: "http://g.test" }).catch((e) => e);
    expect(fout).toBeInstanceOf(PdfFout);
    expect(fout.code).toBe("ONBEREIKBAAR");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("de oorzaak van een netwerkfout (code en boodschap) staat in de details", async () => {
    const oorzaak = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:3001"), { code: "ECONNREFUSED" });
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("fetch failed", { cause: oorzaak }));
    const fout = await maakPdf(invoer, { fetch: fetchMock as unknown as typeof fetch, url: "http://g.test" }).catch((e) => e);
    expect(fout).toBeInstanceOf(PdfFout);
    expect(fout.code).toBe("ONBEREIKBAAR");
    expect(fout.details).toEqual({ code: "ECONNREFUSED", bericht: "connect ECONNREFUSED 127.0.0.1:3001" });
  });

  test("een netwerkfout zonder oorzaak heeft geen details", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    const fout = await maakPdf(invoer, { fetch: fetchMock as unknown as typeof fetch, url: "http://g.test" }).catch((e) => e);
    expect(fout.details).toBeUndefined();
  });

  test("twee keer een 5xx geeft MISLUKT na twee aanroepen", async () => {
    const fetchMock = vi.fn(async () => new Response("stuk", { status: 500 }));
    const fout = await maakPdf(invoer, { fetch: fetchMock as unknown as typeof fetch, url: "http://g.test" }).catch((e) => e);
    expect(fout).toBeInstanceOf(PdfFout);
    expect(fout.code).toBe("MISLUKT");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("twee keer een timeout geeft TIMEOUT", async () => {
    const fetchMock = vi.fn(
      (_u: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_ok, weiger) => {
          init?.signal?.addEventListener("abort", () => weiger(init.signal!.reason));
        }),
    );
    const fout = await maakPdf(invoer, {
      fetch: fetchMock as unknown as typeof fetch,
      url: "http://g.test",
      timeoutMs: 20,
    }).catch((e) => e);
    expect(fout).toBeInstanceOf(PdfFout);
    expect(fout.code).toBe("TIMEOUT");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("een 400 geeft één aanroep en MISLUKT", async () => {
    const fetchMock = vi.fn(async () => new Response("slecht", { status: 400 }));
    const fout = await maakPdf(invoer, { fetch: fetchMock as unknown as typeof fetch, url: "http://g.test" }).catch((e) => e);
    expect(fout).toBeInstanceOf(PdfFout);
    expect(fout.code).toBe("MISLUKT");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("een antwoord dat geen PDF is geeft MISLUKT", async () => {
    const fetchMock = vi.fn(async () => new Response("<html>geen pdf</html>", { status: 200 }));
    const fout = await maakPdf(invoer, { fetch: fetchMock as unknown as typeof fetch, url: "http://g.test" }).catch((e) => e);
    expect(fout).toBeInstanceOf(PdfFout);
    expect(fout.code).toBe("MISLUKT");
  });
  test("de foutbody van een 5xx komt afgekapt (hoogstens 500 tekens) in de details", async () => {
    const lang = "x".repeat(1200);
    const fetchMock = vi.fn(async () => new Response(lang, { status: 503 }));
    const fout = await maakPdf(invoer, { fetch: fetchMock as unknown as typeof fetch, url: "http://g.test" }).catch((e) => e);
    expect(fout).toBeInstanceOf(PdfFout);
    expect(fout.details).toEqual({ status: 503, body: "x".repeat(500) });
  });

  test("de foutbody van een 4xx staat in de details", async () => {
    const fetchMock = vi.fn(async () => new Response("slecht formulier", { status: 400 }));
    const fout = await maakPdf(invoer, { fetch: fetchMock as unknown as typeof fetch, url: "http://g.test" }).catch((e) => e);
    expect(fout.details).toEqual({ status: 400, body: "slecht formulier" });
  });

  test("een lege ELENTRIK_GOTENBERG_URL valt terug op de standaard", async () => {
    vi.stubEnv("ELENTRIK_GOTENBERG_URL", "");
    try {
      const fetchMock = vi.fn(async (_u: string | URL | Request, _i?: RequestInit) => pdfAntwoord());
      await maakPdf(invoer, { fetch: fetchMock as unknown as typeof fetch });
      expect(fetchMock.mock.calls[0]![0]).toBe("http://127.0.0.1:3001/forms/chromium/convert/html");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
