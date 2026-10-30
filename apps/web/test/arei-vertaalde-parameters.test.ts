// VERTAALDE_PARAMETERS (packages/arei) wordt bewaakt, niet blind vertrouwd: de test leest de parameters uit
// de bron van de AREI-regels en laat elke naam een soort kiezen. Een nieuwe parameter zonder soort laat de
// test falen, en de lijst moet precies de parameters met een vertaalde waarde (een ruimte of toestelsoort)
// bevatten. Deze test staat in apps/web omdat de pakketten geen Node-types hebben om bestanden te lezen.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { BERICHTEN, formatteerBericht, VERTAALDE_PARAMETERS, type Bevinding } from "@elentrik/arei";
import { describe, expect, test } from "vitest";

/** De unieke `{naam}`-plaatshouders van een tekst. */
function plaatshouders(tekst: string): string[] {
  return [...new Set([...tekst.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!))].sort();
}

describe("VERTAALDE_PARAMETERS", () => {
  type Soort = "getal" | "vrij" | "vertaald";
  /** Elke parameter van een AREI-regel met haar soort: een getal, vrije tekst (of een technische waarde die niet vertaald wordt) of een model-enumwaarde die per taal een vertaling heeft. */
  const SOORT: Readonly<Record<string, Soort>> = {
    aantal: "getal",
    doorsnede: "getal",
    gevoeligheid: "getal",
    max: "getal",
    min: "getal",
    nominaal: "getal",
    polen: "getal",
    verwacht: "getal",
    kring: "vrij",
    label: "vrij",
    stroomtype: "vrij",
    reden: "vertaald",
    toestel: "vertaald",
  };

  const REGELS = join(import.meta.dirname, "..", "..", "..", "packages", "arei", "src", "regelsets", "arei-2020", "regels");

  /** De sleutels van elke letterlijke `parameters: { ... }` in de bron van de regels. */
  function parameterSleutels(): Set<string> {
    const sleutels = new Set<string>();
    for (const bestand of readdirSync(REGELS).filter((n) => n.endsWith(".ts"))) {
      const bron = readFileSync(join(REGELS, bestand), "utf8");
      const aantal = [...bron.matchAll(/\bparameters\s*:/g)].length;
      const objecten = [...bron.matchAll(/\bparameters\s*:\s*\{([^{}]*)\}/g)];
      expect(objecten.length, `${bestand}: een parameters-object dat de scan niet kan lezen`).toBe(aantal);
      for (const [, inhoud] of objecten) {
        // Splits op komma's buiten haakjes en aanhalingstekens; de sleutel staat voor de eerste ':'.
        let diepte = 0;
        let quote: string | null = null;
        let huidig = "";
        const delen: string[] = [];
        for (const c of inhoud!) {
          if (quote) {
            if (c === quote) quote = null;
          } else if (c === '"' || c === "'" || c === "`") quote = c;
          else if ("([{".includes(c)) diepte++;
          else if (")]}".includes(c)) diepte--;
          else if (c === "," && diepte === 0) {
            delen.push(huidig);
            huidig = "";
            continue;
          }
          huidig += c;
        }
        delen.push(huidig);
        for (const deel of delen.map((d) => d.trim()).filter(Boolean)) {
          sleutels.add(/^(\w+)/.exec(deel)![1]!);
        }
      }
    }
    return sleutels;
  }

  test("de scan vindt de parameters van de regels", () => {
    const sleutels = parameterSleutels();
    expect([...sleutels].sort()).toEqual(Object.keys(SOORT).sort());
  });

  test("elk bericht gebruikt alleen parameters die een regel levert", () => {
    const sleutels = parameterSleutels();
    for (const [sleutel, tekst] of Object.entries(BERICHTEN.nl)) {
      for (const naam of plaatshouders(tekst)) expect(sleutels.has(naam), `${sleutel}: {${naam}}`).toBe(true);
    }
  });

  test("de lijst bevat precies de parameters met een vertaalde waarde", () => {
    const vertaald = Object.entries(SOORT)
      .filter(([, soort]) => soort === "vertaald")
      .map(([naam]) => naam)
      .sort();
    expect([...VERTAALDE_PARAMETERS].sort()).toEqual(vertaald);
  });

  test("de lijst bevat geen parameter die niet bestaat", () => {
    const sleutels = parameterSleutels();
    for (const naam of VERTAALDE_PARAMETERS) expect(sleutels.has(naam), naam).toBe(true);
  });

  test("een parameter in de lijst wordt echt vertaald, elke andere tekstparameter blijft zoals ze is", () => {
    const bericht = (naam: string): Bevinding => ({
      regelId: "R1",
      ernst: "fout",
      nodeIds: [],
      berichtSleutel: "t",
      parameters: { [naam]: "badkamer" },
      afgeweken: false,
    });
    for (const [naam, soort] of Object.entries(SOORT)) {
      if (soort === "getal") continue;
      const catalogus = {
        nl: { t: `{${naam}}`, "waarde.badkamer": "badkamer" },
        fr: { t: `{${naam}}`, "waarde.badkamer": "salle de bain" },
        en: { t: `{${naam}}`, "waarde.badkamer": "bathroom" },
      };
      expect(formatteerBericht(bericht(naam), "en", catalogus), naam).toBe(soort === "vertaald" ? "bathroom" : "badkamer");
    }
  });
});
