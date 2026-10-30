// Elke API-route behalve server/api/auth/[...all].ts exporteert als default de toegangswrapper:
// een nieuwe route zonder controle doet deze test falen, met het pad van het bestand. Nitro serveert
// ook server/routes en server/middleware; die mogen niet bestaan zonder dat deze test ze kent.
// Een publieke route (`{ publiek: true }`, zonder sessie) moet met naam in PUBLIEKE_ROUTES staan.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { API, AUTH_ROUTE, apiPad, beveiligdeRoutebestanden, PUBLIEKE_ROUTES, SERVER, zonderCommentaar } from "./routes";

const BEWAKING = /export\s+default\s+defineBeveiligdeHandler\s*\(/;
const PUBLIEK = /publiek\s*:/;

const routes = beveiligdeRoutebestanden().map(apiPad);

describe("beveiligde routes", () => {
  test("er zijn routes, en de enige uitzondering bestaat", () => {
    expect(routes.length).toBeGreaterThan(10);
    expect(existsSync(join(API, AUTH_ROUTE))).toBe(true);
  });

  test.each(routes)("server/api/%s exporteert defineBeveiligdeHandler( als default", (pad) => {
    const inhoud = zonderCommentaar(readFileSync(join(API, pad), "utf8"));
    expect(BEWAKING.test(inhoud), `server/api/${pad} mist "export default defineBeveiligdeHandler("`).toBe(true);
  });

  test.each(routes)("server/api/%s is alleen publiek als het in PUBLIEKE_ROUTES staat", (pad) => {
    const inhoud = zonderCommentaar(readFileSync(join(API, pad), "utf8"));
    expect(PUBLIEK.test(inhoud), `server/api/${pad}: publiek moet overeenkomen met PUBLIEKE_ROUTES`).toBe(
      PUBLIEKE_ROUTES.includes(pad),
    );
  });

  test("elke route in PUBLIEKE_ROUTES bestaat", () => {
    for (const pad of PUBLIEKE_ROUTES) expect(routes, pad).toContain(pad);
  });

  test("het patroon weigert een vermelding in commentaar of een wrap die niet de default export is", () => {
    expect(BEWAKING.test("// defineBeveiligdeHandler(\nexport default defineEventHandler(() => 1);")).toBe(false);
    expect(BEWAKING.test("const h = defineBeveiligdeHandler(() => 1);\nexport default defineEventHandler(h);")).toBe(
      false,
    );
    expect(BEWAKING.test("export default defineBeveiligdeHandler(async () => 1);")).toBe(true);
  });

  // De echte tests lezen een bestand eerst door `zonderCommentaar`: een aanroep die alleen in commentaar
  // of in een tekst staat, telt niet als beveiligd, ook niet als het de hele regel `export default
  // defineBeveiligdeHandler(` is.
  test("een aanroep in commentaar of in een tekst telt niet als beveiligd, een echte wel", () => {
    const beveiligd = (bron: string) => BEWAKING.test(zonderCommentaar(bron));
    const ongecontroleerd = "export default defineEventHandler(() => 1);";
    const aanroep = "export default defineBeveiligdeHandler(() => 1);";
    const regels = (...r: string[]) => r.join("\n");
    expect(beveiligd(regels(`// ${aanroep}`, ongecontroleerd))).toBe(false);
    expect(beveiligd(regels(`/* ${aanroep} */`, ongecontroleerd))).toBe(false);
    expect(beveiligd(regels("/**", " * export default defineBeveiligdeHandler(", " */", ongecontroleerd))).toBe(false);
    expect(beveiligd(regels(`const t = "${aanroep}";`, ongecontroleerd))).toBe(false);
    expect(beveiligd(regels(`const t = '${aanroep}';`, ongecontroleerd))).toBe(false);
    expect(beveiligd(regels(`const t = \`${aanroep}\`;`, ongecontroleerd))).toBe(false);
    expect(beveiligd(`${aanroep} // klaar`)).toBe(true);
    expect(beveiligd(regels('const url = "https://x.test"; // c', aanroep))).toBe(true);
    // Hetzelfde voor `publiek:`: een vermelding in commentaar maakt een route niet publiek.
    expect(PUBLIEK.test(zonderCommentaar(regels("// { publiek: true }", aanroep)))).toBe(false);
    expect(PUBLIEK.test(zonderCommentaar("export default defineBeveiligdeHandler(() => 1, { publiek: true });"))).toBe(true);
  });

  test("server/routes bestaat niet (Nitro zou het ongecontroleerd serveren)", () => {
    expect(
      existsSync(join(SERVER, "routes")),
      "server/routes bestaat: breid deze test en de routetabel uit voor je het toevoegt",
    ).toBe(false);
  });

  // De enige middleware is die voor /robots.txt op staging (plan 10): zonder sessie, en alleen voor dat pad.
  // Een andere middleware moet hier met naam bekend zijn.
  test("server/middleware bevat alleen robots.ts, en die antwoordt alleen op /robots.txt", () => {
    const map = join(SERVER, "middleware");
    expect(readdirSync(map)).toEqual(["robots.ts"]);
    const inhoud = readFileSync(join(map, "robots.ts"), "utf8");
    expect(inhoud).toMatch(/pathname\s*!==\s*"\/robots\.txt"\)\s*return;/);
  });
});
