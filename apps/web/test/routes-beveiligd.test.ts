// Elke API-route buiten /api/auth gebruikt de toegangswrapper: een nieuwe route zonder controle
// doet deze test falen, met het pad van het bestand.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, test } from "vitest";

const API = join(import.meta.dirname, "..", "server", "api");

function bestandenIn(map: string): string[] {
  return readdirSync(map, { withFileTypes: true }).flatMap((item) => {
    const pad = join(map, item.name);
    return item.isDirectory() ? bestandenIn(pad) : [pad];
  });
}

const routes = bestandenIn(API)
  .map((pad) => relative(API, pad).split(sep).join("/"))
  .filter((pad) => !pad.startsWith("auth/"))
  .sort();

describe("beveiligde routes", () => {
  test("er zijn routes buiten auth/", () => {
    expect(routes.length).toBeGreaterThan(10);
  });

  test.each(routes)("server/api/%s gebruikt defineBeveiligdeHandler(", (pad) => {
    const inhoud = readFileSync(join(API, pad), "utf8");
    expect(inhoud.includes("defineBeveiligdeHandler("), `server/api/${pad} mist defineBeveiligdeHandler(`).toBe(true);
  });
});
