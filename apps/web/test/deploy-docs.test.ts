// Kruiscontrole tussen deploy/nas/.env.voorbeeld en de handleiding docs/online.md: elke variabele van
// het voorbeeldbestand komt in de handleiding voor, en elke `NAAM=`-vermelding in de handleiding is een
// variabele uit het voorbeeldbestand. Zo raakt de handleiding niet achter op de configuratie.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const lees = (...pad: string[]) => readFileSync(join(ROOT, ...pad), "utf8");

/** De variabelen van .env.voorbeeld, ook de uitgecommentarieerde (`# NAAM=...`). */
function variabelenUitVoorbeeld(tekst: string): string[] {
  const namen = new Set<string>();
  for (const regel of tekst.split(/\r?\n/)) {
    const m = /^#? ?([A-Z][A-Z0-9_]*)=/.exec(regel);
    if (m?.[1]) namen.add(m[1]);
  }
  return [...namen];
}

/** Elke `NAAM=`-vermelding in een tekst (hoofdletters, minstens drie tekens, direct gevolgd door `=`). */
function vermeldingenMetGelijkteken(tekst: string): string[] {
  const namen = new Set<string>();
  for (const m of tekst.matchAll(/(?<![A-Za-z0-9_])([A-Z][A-Z0-9_]{2,})=/g)) if (m[1]) namen.add(m[1]);
  return [...namen];
}

const voorbeeld = lees("deploy", "nas", ".env.voorbeeld");
const handleiding = lees("docs", "online.md");
const namen = variabelenUitVoorbeeld(voorbeeld);

describe("docs/online.md en deploy/nas/.env.voorbeeld", () => {
  test("het voorbeeldbestand levert variabelen (de controle is niet leeg)", () => {
    expect(namen.length).toBeGreaterThan(20);
    expect(namen).toContain("POSTGRES_WACHTWOORD");
    expect(namen).toContain("GRAPH_CLIENT_GEHEIM");
    expect(namen).toContain("ELENTRIK_GEPLANDE_TAKEN");
  });

  test.each(namen)("de handleiding noemt %s", (naam) => {
    expect(new RegExp(`(?<![A-Za-z0-9_])${naam}(?![A-Za-z0-9_])`).test(handleiding), `${naam} staat niet in docs/online.md`).toBe(true);
  });

  test("elke NAAM= in de handleiding staat in .env.voorbeeld", () => {
    const onbekend = vermeldingenMetGelijkteken(handleiding).filter((n) => !namen.includes(n));
    expect(onbekend, `in docs/online.md maar niet in .env.voorbeeld: ${onbekend.join(", ")}`).toEqual([]);
  });

  test("de handleiding bevat geen echte geheimen of adressen", () => {
    expect(handleiding).not.toMatch(/sk_(live|test)_[A-Za-z0-9]{8,}/);
    expect(handleiding).not.toMatch(/whsec_[A-Za-z0-9]{8,}/);
    expect(handleiding).not.toMatch(/price_[A-Za-z0-9]{8,}/);
    expect(handleiding).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    expect(handleiding).not.toMatch(/dexxter/i);
  });

  test("compose.yaml heeft een vaste projectnaam elentrik (Container Manager en SSH moeten hetzelfde project raken)", () => {
    const compose = lees("deploy", "nas", "compose.yaml");
    expect(compose).toMatch(/^name: elentrik$/m);
  });

  test("compose.yaml heeft een proxy zonder poorten en zonder depends_on op de web-diensten", () => {
    const compose = lees("deploy", "nas", "compose.yaml");
    // Het blok van de dienst: van `  proxy:` tot de volgende dienst (twee spaties inspringing).
    const blok = /^ {2}proxy:\r?\n(?:(?: {4}.*)?\r?\n)+/m.exec(compose)?.[0] ?? "";
    expect(blok, "geen dienst proxy in compose.yaml").not.toBe("");
    expect(blok).toMatch(/^ {4}container_name: elentrik-proxy$/m);
    expect(blok).not.toMatch(/^ {4}ports:/m);
    expect(blok).not.toMatch(/^ {4}depends_on:/m);
    // Een exacte versie: major.minor.patch, desnoods met een achtervoegsel als -alpine; nooit latest of alleen een hoofdversie.
    const image = /^ {4}image: (\S+)$/m.exec(blok)?.[1] ?? "";
    expect(image, "de proxy heeft geen image").not.toBe("");
    expect(image).not.toMatch(/:latest$/);
    expect(image).toMatch(/^caddy:\d+\.\d+\.\d+(-[a-z0-9.]+)?$/);
  });

  test("de Caddyfile stuurt door naar de dienstnamen web en web-staging", () => {
    const caddyfile = lees("deploy", "nas", "proxy", "Caddyfile");
    expect(caddyfile).toContain("web:3000");
    expect(caddyfile).toContain("web-staging:3000");
    expect(caddyfile).not.toContain("elentrik-web");
  });

  test("de handleiding wijst de tunnel naar elentrik-proxy:8080", () => {
    expect(handleiding).toContain("elentrik-proxy:8080");
    // De containernaam van web komt alleen nog voor in de uitleg van de interne doorsturing.
    const regels = handleiding.split(/\r?\n/).filter((r) => /elentrik-web(-staging)?:3000/.test(r));
    for (const regel of regels) expect(regel, "de tunnel hoort niet meer naar een web-container te wijzen").toMatch(/[Ii]ntern/);
  });

  test("de hulpfuncties herkennen de vormen", () => {
    expect(variabelenUitVoorbeeld("A_B=1\n# C_D=2\n#E=3\n# gewone tekst: x=1\nfoo=bar\n")).toEqual(["A_B", "C_D", "E"]);
    expect(vermeldingenMetGelijkteken("`ABC_DEF=1` en x=2 en p=none en AB=3 en v=DMARC1")).toEqual(["ABC_DEF"]);
  });
});
