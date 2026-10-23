// De foutcodes (plan 8, Task 3): de lijst is gesloten en volledig. Een statische test leest de
// servercode en eist voor elke fout die de gebruiker kan zien een `data.code` uit FOUTCODES, zodat
// de client elke fout kan vertalen (`fouten.<CODE>`, Task 4).
//
// De scanner kent drie soorten plaatsen:
// - `createError({ statusCode: 4xx, statusMessage | message, data: { code } })`;
// - een `createError` met `statusCode,` (geen letterlijke status): alleen toegelaten in een
//   hulpfunctie `function naam(statusCode: number, ..., code: Foutcode)`, waarvan de aanroepen
//   (`naam(404, "...", "CODE")`) dan de status en de code letterlijk meegeven;
// - tuples van `AUTH_CODES` in server/organisaties/leden.ts.
// Wat 5xx is (de PDF-dienst, een webhook die faalt) is geen 4xx en valt buiten de eis.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { betterAuth } from "better-auth";
import { describe, expect, test } from "vitest";
import { AUTH_FOUTCODES, FOUTCODES, isFoutcode, SERVER_FOUTCODES } from "../shared/foutcodes";

const WEB = join(import.meta.dirname, "..");
const SERVER = join(WEB, "server");
const SHARED = join(WEB, "shared");

/**
 * De uitzonderingen: bestanden onder server/ waarvan de fouten de gebruiker nooit ziet. Houd deze
 * lijst klein; een bestand hier heeft een reden, en de test controleert dat het nog `createError`
 * of een hulpfunctie gebruikt (anders is de uitzondering verouderd).
 */
const UITZONDERINGEN: Record<string, string> = {
  "abonnementen/webhook.ts":
    "Antwoord aan Stripe (handtekening ongeldig, webhook uit, verwerken mislukt): geen gebruiker leest dit.",
};

function tsBestanden(map: string): string[] {
  return readdirSync(map, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? tsBestanden(join(map, d.name)) : d.name.endsWith(".ts") ? [join(map, d.name)] : [],
  );
}

/** Vervangt commentaar door spaties (lengte blijft gelijk); tekenreeksen blijven staan. */
function zonderCommentaar(bron: string): string {
  let uit = "";
  let i = 0;
  while (i < bron.length) {
    const c = bron[i]!;
    const volgende = bron[i + 1];
    if (c === "/" && volgende === "/") {
      while (i < bron.length && bron[i] !== "\n") (uit += " "), i++;
    } else if (c === "/" && volgende === "*") {
      while (i < bron.length && !(bron[i] === "*" && bron[i + 1] === "/")) uit += bron[i] === "\n" ? "\n" : " ", i++;
      uit += "  ";
      i += 2;
    } else if (c === '"' || c === "'" || c === "`") {
      const begin = i++;
      while (i < bron.length && bron[i] !== c) i += bron[i] === "\\" ? 2 : 1;
      uit += bron.slice(begin, ++i);
    } else {
      uit += c;
      i++;
    }
  }
  return uit;
}

/** De tekst tussen de haakjes van een aanroep (vanaf de openende haak), met de argumenten op diepte 0. */
function lees(bron: string, open: number): { binnen: string; argumenten: string[] } {
  let diepte = 0;
  let begin = open + 1;
  const argumenten: string[] = [];
  for (let i = open; i < bron.length; i++) {
    const c = bron[i]!;
    if (c === '"' || c === "'" || c === "`") {
      i++;
      while (i < bron.length && bron[i] !== c) i += bron[i] === "\\" ? 2 : 1;
    } else if (c === "(" || c === "{" || c === "[") {
      diepte++;
    } else if (c === ")" || c === "}" || c === "]") {
      diepte--;
      if (diepte === 0) {
        const laatste = bron.slice(begin, i).trim();
        if (laatste !== "") argumenten.push(laatste);
        return { binnen: bron.slice(open + 1, i), argumenten };
      }
    } else if (c === "," && diepte === 1) {
      argumenten.push(bron.slice(begin, i).trim());
      begin = i + 1;
    }
  }
  throw new Error("Haakje niet gesloten");
}

/** Alle `const NAAM = "WAARDE"` in server/ en shared/, om `code: NAAM` te kunnen lezen. */
function constanten(): Map<string, string> {
  const kaart = new Map<string, string>();
  for (const bestand of [...tsBestanden(SERVER), ...tsBestanden(SHARED)]) {
    const bron = zonderCommentaar(readFileSync(bestand, "utf8"));
    for (const m of bron.matchAll(/\bconst\s+([A-Z][A-Z0-9_]*)\s*=\s*"([A-Z][A-Z0-9_]*)"/g)) kaart.set(m[1]!, m[2]!);
  }
  return kaart;
}

const CONSTANTEN = constanten();

/** Een code zoals ze in de bron staat ("CODE" of een constante) naar haar waarde. */
function codeUit(tekst: string): string | undefined {
  const letterlijk = tekst.match(/^"([A-Z][A-Z0-9_]*)"$/);
  if (letterlijk) return letterlijk[1];
  return CONSTANTEN.get(tekst);
}

type Plaats = { bestand: string; regel: number; soort: string; fout?: string; code?: string };

function regelVan(bron: string, index: number): number {
  return bron.slice(0, index).split("\n").length;
}

function scan(): { plaatsen: Plaats[]; perBestand: Map<string, number> } {
  const plaatsen: Plaats[] = [];
  const perBestand = new Map<string, number>();
  for (const pad of tsBestanden(SERVER)) {
    const naam = pad.slice(SERVER.length + 1).replaceAll("\\", "/");
    const bron = zonderCommentaar(readFileSync(pad, "utf8"));
    const uitzondering = Object.hasOwn(UITZONDERINGEN, naam);
    const tel = () => perBestand.set(naam, (perBestand.get(naam) ?? 0) + 1);

    // Hulpfuncties met een statusCode-parameter: hun createError heeft geen letterlijke status.
    const hulp = new Map<string, number>();
    for (const m of bron.matchAll(/\bfunction\s+(\w+)\(\s*statusCode: number/g)) hulp.set(m[1]!, m.index!);

    for (const m of bron.matchAll(/(?<![\w.])createError\(/g)) {
      const open = m.index! + m[0].length - 1;
      const { binnen } = lees(bron, open);
      if (/^\s*function\s/.test(bron.slice(Math.max(0, m.index! - 9), m.index!))) continue;
      if (bron.slice(0, m.index!).trimEnd().endsWith("import {")) continue;
      tel();
      if (uitzondering) continue;
      const plaats = (extra: Partial<Plaats>): Plaats => ({
        bestand: naam,
        regel: regelVan(bron, m.index!),
        soort: "createError",
        ...extra,
      });
      const status = binnen.match(/\bstatusCode:\s*(\d{3})\b/)?.[1];
      if (status === undefined) {
        // `statusCode,`: toegelaten in een hulpfunctie met een verplichte `code: Foutcode`.
        const vorige = [...hulp.entries()].filter(([, index]) => index < m.index!).at(-1);
        const kop = vorige ? bron.slice(vorige[1], m.index!) : "";
        if (!/\bcode: Foutcode\b/.test(kop) || !/\bdata: \{ code \}/.test(binnen) || !/\bstatusCode\b/.test(binnen)) {
          plaatsen.push(plaats({ fout: "createError zonder letterlijke status buiten een hulpfunctie met code: Foutcode" }));
        }
        continue;
      }
      if (Number(status) < 400 || Number(status) >= 500) continue;
      if (!/\b(statusMessage|message):/.test(binnen)) continue;
      const code = binnen.match(/\bcode:\s*("[A-Z][A-Z0-9_]*"|[A-Za-z_]\w*)/)?.[1];
      plaatsen.push(
        plaats(code === undefined ? { fout: "geen data.code" } : { code: codeUit(code) ?? `onbekend: ${code}` }),
      );
    }

    for (const [functie] of hulp) {
      for (const m of bron.matchAll(new RegExp(`(?<![\\w.])${functie}\\(`, "g"))) {
        if (/function\s+$/.test(bron.slice(Math.max(0, m.index! - 10), m.index!))) continue;
        const { argumenten } = lees(bron, m.index! + m[0].length - 1);
        tel();
        if (uitzondering) continue;
        // `fout(...bekend)` met een tuple uit AUTH_CODES: de test "AUTH_CODES" hieronder controleert die codes.
        if (argumenten[0] === "bekend[0]") continue;
        const status = Number(argumenten[0]);
        if (!Number.isInteger(status)) {
          plaatsen.push({
            bestand: naam,
            regel: regelVan(bron, m.index!),
            soort: `${functie}()`,
            fout: `status niet letterlijk: ${argumenten[0]}`,
          });
          continue;
        }
        if (!(status >= 400 && status < 500)) continue;
        const code = argumenten[2] === undefined ? undefined : codeUit(argumenten[2]);
        plaatsen.push({
          bestand: naam,
          regel: regelVan(bron, m.index!),
          soort: `${functie}()`,
          ...(code === undefined ? { fout: `geen code als derde argument: ${argumenten.join(" | ")}` } : { code }),
        });
      }
    }
  }
  return { plaatsen, perBestand };
}

const { plaatsen, perBestand } = scan();

describe("FOUTCODES", () => {
  test("de lijst is gesloten: geen dubbels, SCREAMING_SNAKE_CASE", () => {
    expect(new Set(FOUTCODES).size).toBe(FOUTCODES.length);
    for (const code of FOUTCODES) expect(code).toMatch(/^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/);
    expect([...SERVER_FOUTCODES, ...AUTH_FOUTCODES]).toEqual([...FOUTCODES]);
  });

  test("de bestaande codes zijn ongewijzigd", () => {
    for (const code of [
      "ABONNEMENT_VEREIST",
      "ABONNEMENT_BESTAAT",
      "GEEN_KLANT",
      "ABONNEMENTEN_UIT",
      "ANDERE_ORGANISATIE",
      "ANDERE_GEBRUIKER",
      "LAATSTE_EIGENAAR",
      "ALLEEN_EIGENAAR",
      "ONGELDIGE_TAAL",
      "TE_VEEL_UITNODIGINGEN",
      "AL_LID",
      "AL_UITGENODIGD",
      "ACCOUNT_BESTAAT",
      "ONBEREIKBAAR",
      "TIMEOUT",
      "MISLUKT",
    ]) {
      expect(FOUTCODES as readonly string[]).toContain(code);
    }
  });

  test("isFoutcode kent alleen de lijst", () => {
    expect(isFoutcode("NIET_GEVONDEN")).toBe(true);
    expect(isFoutcode("INVALID_TOKEN")).toBe(true);
    expect(isFoutcode("niet_gevonden")).toBe(false);
    expect(isFoutcode("ONBEKEND")).toBe(false);
    expect(isFoutcode(404)).toBe(false);
  });

  test("elke code van Better Auth in de lijst bestaat in Better Auth 1.7.7", () => {
    const auth = betterAuth({
      secret: "vitest-geheim-alleen-voor-tests-0123456789abcdef",
      baseURL: "http://127.0.0.1:3000",
      telemetry: { enabled: false },
    });
    const bestaand = Object.keys(auth.$ERROR_CODES);
    for (const code of AUTH_FOUTCODES) expect(bestaand).toContain(code);
  });

  test("elke code van de server wordt ergens in server/ of shared/ gebruikt", () => {
    const bronnen = [...tsBestanden(SERVER), ...tsBestanden(SHARED)]
      .filter((pad) => !pad.endsWith("foutcodes.ts"))
      .map((pad) => zonderCommentaar(readFileSync(pad, "utf8")))
      .join("\n");
    const ongebruikt = SERVER_FOUTCODES.filter((code) => !bronnen.includes(`"${code}"`));
    expect(ongebruikt).toEqual([]);
  });

  test("de codes van PdfFout (502) staan in de lijst", () => {
    const bron = readFileSync(join(SERVER, "pdf/gotenberg.ts"), "utf8");
    const lijst = bron.match(/export type PdfFoutCode = ([^;]+);/)?.[1];
    const codes = [...(lijst ?? "").matchAll(/"([A-Z_]+)"/g)].map((m) => m[1]!);
    expect(codes).toHaveLength(3);
    for (const code of codes) expect(FOUTCODES as readonly string[]).toContain(code);
    const exports = zonderCommentaar(readFileSync(join(SERVER, "utils/exports.ts"), "utf8"));
    expect(exports).toMatch(/statusCode: 502,[^)]*data: \{ code: fout\.code \}/);
  });
});

describe("foutcodes in de server (statisch)", () => {
  test("de scanner vindt de createError-plaatsen (vangnet tegen een stille scanner)", () => {
    // Er zijn er nu 20+ met een letterlijke 4xx-status; een scanner die er veel minder vindt, is stuk.
    expect(plaatsen.length).toBeGreaterThanOrEqual(30);
    expect(plaatsen.some((p) => p.soort === "createError")).toBe(true);
    expect(plaatsen.some((p) => p.soort === "fout()")).toBe(true);
    expect(plaatsen.map((p) => p.bestand)).toEqual(
      expect.arrayContaining(["utils/toegang.ts", "utils/projecten.ts", "utils/bestanden.ts", "organisaties/leden.ts"]),
    );
  });

  test("elke createError met een statusMessage en een 4xx-status heeft een data.code uit FOUTCODES", () => {
    const fouten = plaatsen
      .filter((p) => p.fout !== undefined || p.code === undefined || !isFoutcode(p.code))
      .map((p) => `${p.bestand}:${p.regel} ${p.soort} ${p.fout ?? p.code ?? "zonder code"}`);
    expect(fouten).toEqual([]);
  });

  test("de uitzonderingslijst is klein en actueel", () => {
    expect(Object.keys(UITZONDERINGEN).length).toBeLessThanOrEqual(2);
    for (const [bestand, reden] of Object.entries(UITZONDERINGEN)) {
      expect(reden.length).toBeGreaterThan(20);
      expect(perBestand.get(bestand) ?? 0).toBeGreaterThan(0);
    }
  });

  test("AUTH_CODES in leden.ts: elke tuple heeft een code uit FOUTCODES", () => {
    const bron = zonderCommentaar(readFileSync(join(SERVER, "organisaties/leden.ts"), "utf8"));
    const start = bron.indexOf("const AUTH_CODES");
    expect(start).toBeGreaterThan(-1);
    const blok = bron.slice(bron.indexOf("{", start + 40), bron.indexOf("\n};", start));
    const tuples = [...blok.matchAll(/^\s+\w+:\s*\[(\d{3}),\s*([^\]]*)\],?$/gm)];
    expect(tuples.length).toBeGreaterThanOrEqual(8);
    for (const t of tuples) {
      // [status, boodschap, code]: de code is het laatste deel (de boodschap kan een komma bevatten).
      const code = codeUit(t[2]!.slice(t[2]!.lastIndexOf(",") + 1).trim());
      expect(code !== undefined && isFoutcode(code), t[0]).toBe(true);
    }
  });
});
