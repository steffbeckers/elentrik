// De vertaalbestanden van de interface (plan 8, Task 4): nl.json is de bron, fr.json en en.json
// hebben exact dezelfde sleutels, met dezelfde plaatshouders en meervoudsvormen. Een ontbrekende
// sleutel of een andere plaatshouder toont anders een rauwe sleutel of `{naam}` in beeld.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { FOUTCODES } from "../shared/foutcodes";

const LOCALES_MAP = join(import.meta.dirname, "..", "i18n", "locales");
const TALEN = ["nl", "fr", "en"] as const;
type Bestand = (typeof TALEN)[number];

type Boom = { [sleutel: string]: string | Boom };

function lees(taal: Bestand): Boom {
  const pad = join(LOCALES_MAP, `${taal}.json`);
  if (!existsSync(pad)) return {};
  return JSON.parse(readFileSync(pad, "utf8")) as Boom;
}

/** Alle bladeren als `a.b.c` → tekst. Een andere soort waarde (getal, lijst) is een fout. */
function plat(boom: Boom, voorvoegsel = ""): Map<string, string> {
  const uit = new Map<string, string>();
  for (const [sleutel, waarde] of Object.entries(boom)) {
    const pad = voorvoegsel ? `${voorvoegsel}.${sleutel}` : sleutel;
    if (typeof waarde === "string") uit.set(pad, waarde);
    else if (waarde !== null && typeof waarde === "object" && !Array.isArray(waarde)) {
      for (const [k, v] of plat(waarde, pad)) uit.set(k, v);
    } else throw new Error(`${pad}: geen tekst en geen object`);
  }
  return uit;
}

const BESTANDEN = Object.fromEntries(TALEN.map((taal) => [taal, plat(lees(taal))])) as Record<
  Bestand,
  Map<string, string>
>;
const NL = BESTANDEN.nl;

function plaatshouders(tekst: string): string[] {
  return [...tekst.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();
}

function aantalVormen(tekst: string): number {
  return tekst.split("|").length;
}

/**
 * Waarden die in elke taal dezelfde zijn: merknamen, symbolen en codes. Ze tellen niet mee voor
 * "geen kopie van nl".
 */
const MAG_GELIJK = new Set([
  "app.naam", // Elentrik
  "editor.onderdelenPaneel.geenSneltoets", // —
  "editor.eigenschappen.verschillend", // —
  "editor.eigenschappen.zelfdeType", // {aantal} × {type}
  "abonnement.korting", // −{percentage} %
]);

describe("de vertaalbestanden", () => {
  test("nl.json heeft sleutels", () => {
    expect(NL.size).toBeGreaterThan(100);
  });

  describe.each(["fr", "en"] as const)("%s.json", (taal) => {
    const bestand = BESTANDEN[taal];

    test("bestaat en heeft exact dezelfde sleutels als nl.json", () => {
      expect(existsSync(join(LOCALES_MAP, `${taal}.json`))).toBe(true);
      expect([...bestand.keys()].sort()).toEqual([...NL.keys()].sort());
    });

    test("elke waarde heeft dezelfde plaatshouders en hetzelfde aantal meervoudsvormen als nl", () => {
      const afwijkend: string[] = [];
      for (const [sleutel, nl] of NL) {
        const tekst = bestand.get(sleutel);
        if (tekst === undefined) continue;
        if (plaatshouders(tekst).join() !== plaatshouders(nl).join()) afwijkend.push(`${sleutel}: plaatshouders`);
        if (aantalVormen(tekst) !== aantalVormen(nl)) afwijkend.push(`${sleutel}: meervoudsvormen`);
      }
      expect(afwijkend).toEqual([]);
    });

    test("is geen kopie van nl: minder dan 5 % van de waarden is identiek (buiten merknamen en codes)", () => {
      const gelijk = [...NL].filter(([sleutel, nl]) => !MAG_GELIJK.has(sleutel) && bestand.get(sleutel) === nl);
      expect(bestand.size).toBeGreaterThan(0);
      expect(gelijk.length / NL.size, gelijk.map(([s]) => s).join(", ")).toBeLessThan(0.05);
    });
  });

  describe.each(TALEN)("%s.json", (taal) => {
    const bestand = BESTANDEN[taal];

    test("geen lege tekst", () => {
      expect([...bestand].filter(([, tekst]) => tekst.trim() === "").map(([s]) => s)).toEqual([]);
    });

    test("geen tekens die vue-i18n als syntaxis leest: `@` (gekoppelde sleutel) of een losse accolade", () => {
      const fout = [...bestand].filter(([, tekst]) => /@/.test(tekst) || /\{(?!\w+\})|(?<!\{\w+)\}/.test(tekst));
      expect(fout.map(([s]) => s)).toEqual([]);
    });

    test("elke foutcode heeft een vertaling `fouten.<CODE>`, plus `fouten.onbekend`", () => {
      const ontbrekend = [...FOUTCODES, "onbekend"].filter((code) => !bestand.has(`fouten.${code}`));
      expect(ontbrekend).toEqual([]);
    });

    test("de taalkeuze heeft haar teksten", () => {
      for (const sleutel of ["taal.kiezen", "taal.bewarenMislukt"]) expect(bestand.has(sleutel), sleutel).toBe(true);
    });
  });

  // docs/vertalingen.md: "inloglink" is "lien de connexion" / "sign-in link".
  test("inloggen.nieuweLink volgt de woordenlijst", () => {
    expect(plat(lees("fr")).get("inloggen.nieuweLink")).toBe("Envoyer un nouveau lien de connexion");
    expect(plat(lees("en")).get("inloggen.nieuweLink")).toBe("Send a new sign-in link");
  });
});
