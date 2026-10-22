// Elke API-route behalve server/api/auth/[...all].ts exporteert als default de toegangswrapper:
// een nieuwe route zonder controle doet deze test falen, met het pad van het bestand. Nitro serveert
// ook server/routes en server/middleware; die mogen niet bestaan zonder dat deze test ze kent.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { API, AUTH_ROUTE, apiPad, beveiligdeRoutebestanden, SERVER } from "./routes";

const BEWAKING = /export\s+default\s+defineBeveiligdeHandler\s*\(/;

const routes = beveiligdeRoutebestanden().map(apiPad);

describe("beveiligde routes", () => {
  test("er zijn routes, en de enige uitzondering bestaat", () => {
    expect(routes.length).toBeGreaterThan(10);
    expect(existsSync(join(API, AUTH_ROUTE))).toBe(true);
  });

  test.each(routes)("server/api/%s exporteert defineBeveiligdeHandler( als default", (pad) => {
    const inhoud = readFileSync(join(API, pad), "utf8");
    expect(BEWAKING.test(inhoud), `server/api/${pad} mist "export default defineBeveiligdeHandler("`).toBe(true);
  });

  test("het patroon weigert een vermelding in commentaar of een wrap die niet de default export is", () => {
    expect(BEWAKING.test("// defineBeveiligdeHandler(\nexport default defineEventHandler(() => 1);")).toBe(false);
    expect(BEWAKING.test("const h = defineBeveiligdeHandler(() => 1);\nexport default defineEventHandler(h);")).toBe(
      false,
    );
    expect(BEWAKING.test("export default defineBeveiligdeHandler(async () => 1);")).toBe(true);
  });

  test.each(["routes", "middleware"])("server/%s bestaat niet (Nitro zou het ongecontroleerd serveren)", (map) => {
    expect(
      existsSync(join(SERVER, map)),
      `server/${map} bestaat: breid deze test en de routetabel uit voor je het toevoegt`,
    ).toBe(false);
  });
});
