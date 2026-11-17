// Het bordoverzicht, de voorstellen en de teller van het tabblad Situatieschema (elektricien-review,
// taak 4). Er is geen componenttest in deze map; wat hier vaststaat is wat een lezer van het scherm
// nodig heeft: elke gebruikte tekst bestaat (de pariteitstest eist hem dan ook in fr en en), een
// aantal heeft een enkelvoud en een meervoud, en een waarschuwing is nooit alleen een kleur.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import nl from "../i18n/locales/nl.json";

type Boom = { [sleutel: string]: string | Boom };

const COMPONENTEN = join(import.meta.dirname, "..", "app", "components");
const bron = (pad: string) => readFileSync(join(COMPONENTEN, pad), "utf8");

const BORD = bron("kringenlijst/BordOverzicht.vue");
const TABEL = bron("kringenlijst/KringenlijstTabel.vue");
const PANEEL = bron("editor/EigenschappenPaneel.vue");
const WERKRUIMTE = bron("editor/EditorWerkruimte.vue");

function tekst(sleutel: string): string | undefined {
  let huidig: string | Boom | undefined = nl as Boom;
  for (const deel of sleutel.split(".")) {
    if (typeof huidig !== "object" || !Object.hasOwn(huidig, deel)) return undefined;
    huidig = huidig[deel];
  }
  return typeof huidig === "string" ? huidig : undefined;
}

/** De letterlijke vertaalsleutels onder de drie delen van deze taak in een bronbestand. */
function sleutels(tekstBron: string): string[] {
  return [...tekstBron.matchAll(/["'`]((?:editor\.bord|editor\.werkruimte|velden\.suggesties)\.\w+)["'`]/g)].map((m) => m[1]!);
}

describe("teksten van bordoverzicht, voorstellen en teller", () => {
  test("elke gebruikte sleutel bestaat in nl.json", () => {
    const gebruikt = [...new Set([BORD, PANEEL, WERKRUIMTE].flatMap(sleutels))];
    expect(gebruikt).toEqual(expect.arrayContaining([
      "editor.bord.titel", "editor.bord.indicatief", "editor.bord.teVeel", "editor.werkruimte.tePlaatsen", "velden.suggesties.knop",
    ]));
    expect(gebruikt.filter((sleutel) => tekst(sleutel) === undefined)).toEqual([]);
  });

  test("er staat geen ongebruikte tekst onder editor.bord", () => {
    const gebruikt = new Set(sleutels(BORD));
    const bord = ((nl as Boom).editor as Boom).bord as Boom;
    expect(Object.keys(bord).filter((sleutel) => !gebruikt.has(`editor.bord.${sleutel}`))).toEqual([]);
  });

  test.each(["editor.bord.kringen", "editor.bord.modules", "editor.bord.kast", "editor.bord.contactdozen", "editor.werkruimte.tePlaatsen"])(
    "%s heeft een enkelvoud en een meervoud met het aantal",
    (sleutel) => {
      const vormen = tekst(sleutel)!.split("|");
      expect(vormen).toHaveLength(2);
      expect(vormen[0]).toMatch(/\b1\b/);
      expect(vormen[1]).toContain("{aantal}");
    },
  );

  test("de plaatshouders die de componenten invullen", () => {
    expect(tekst("editor.bord.kast")).toContain("{perRij}");
    expect(tekst("editor.bord.teVeel")).toContain("{max}");
    expect(tekst("velden.suggesties.knop")).toContain("{veld}");
  });
});

describe("BordOverzicht.vue", () => {
  test("staat boven de kringenlijst en zegt dat het indicatief is", () => {
    expect(TABEL.indexOf("<BordOverzicht />")).toBeGreaterThan(-1);
    expect(TABEL.indexOf("<BordOverzicht />")).toBeLessThan(TABEL.indexOf("<table"));
    expect(BORD).toContain('$t("editor.bord.indicatief")');
    expect(tekst("editor.bord.indicatief")).toMatch(/^Indicatief/);
  });

  test("te veel kringen: een kleur, een icoon en een tekst, nooit de kleur alleen", () => {
    expect(BORD).toMatch(/teVeelKringen \? 'bg-warning\/10'/);
    expect(BORD).toMatch(/<UIcon\s+v-if="differentieel\.teVeelKringen"\s+name="i-lucide-triangle-alert"/);
    expect(BORD).toMatch(/<span v-if="differentieel\.teVeelKringen"[^>]*>\s*\{\{ \$t\("editor\.bord\.teVeel"/);
  });

  test("rekent zelf niets uit: de getallen en de grens komen uit @elentrik/render", () => {
    expect(BORD).toMatch(/import \{[^}]*MAX_KRINGEN_PER_DIFFERENTIEEL[^}]*bordOverzicht[^}]*\} from "@elentrik\/render"/s);
    expect(BORD).not.toMatch(/[<>]=?\s*8\b/);
    // Geen kolomkoppen: die van dit tabblad zijn de kolommen van de kringenlijst in de PDF.
    expect(BORD).not.toMatch(/<t[hd]\b|<table\b/);
  });
});

describe("EigenschappenPaneel.vue: voorstellen naast vrije invoer", () => {
  test("het invoerveld houdt zijn testid en zijn afhandeling; de voorstellen staan in een knop ernaast", () => {
    expect(PANEEL).toContain(':data-testid="`veld-${veld.sleutel}`"');
    expect(PANEEL).toContain('@update:model-value="(w: string | number) => invoer(veld, w)"');
    expect(PANEEL).toContain('@blur="verlaat(veld)"');
    expect(PANEEL).toContain(':data-testid="`veld-${veld.sleutel}-voorstellen`"');
    expect(PANEEL).toMatch(/:aria-label="\$t\('velden\.suggesties\.knop', \{ veld: \$t\(veld\.labelSleutel\) \}\)"/);
  });

  test("een gekozen voorstel volgt de weg van getypte invoer en sluit de undo-stap", () => {
    const functie = PANEEL.slice(PANEEL.indexOf("function kiesVoorstel"), PANEEL.indexOf("function voorstelItems"));
    expect(functie).toMatch(/invoer\(veld, voorstel\);\s*verlaat\(veld\);/);
  });
});

describe("EditorWerkruimte.vue: teller bij Situatieschema", () => {
  test("telt met de dossierstatus, toont niets bij nul en geeft een schermlezer de volledige zin", () => {
    expect(WERKRUIMTE).toContain("dossierStatus(store.document, store.analyse).ongeplaatst");
    expect(WERKRUIMTE).toContain(`v-if="tabblad === 'situatieschema' && tePlaatsen > 0"`);
    expect(WERKRUIMTE).toMatch(/<span aria-hidden="true">\{\{ tePlaatsen \}\}<\/span>\s*<span class="sr-only">\{\{ \$t\('editor\.werkruimte\.tePlaatsen'/);
  });
});
