import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { expect, test } from "vitest";

const pakkettenMap = join(import.meta.dirname, "..", "packages");
const verboden = /from\s+["']node:|require\(|\bfetch\(/;

function bronbestanden(map: string): string[] {
  return readdirSync(map, { withFileTypes: true }).flatMap((item) => {
    const pad = join(map, item.name);
    if (item.isDirectory()) return bronbestanden(pad);
    return pad.endsWith(".ts") ? [pad] : [];
  });
}

test("geen node:-imports of fetch in pakketbronnen", () => {
  const bronmappen = readdirSync(pakkettenMap, { withFileTypes: true })
    .filter((item) => item.isDirectory())
    .map((item) => join(pakkettenMap, item.name, "src"));

  const overtreders = bronmappen
    .flatMap((map) => bronbestanden(map))
    .filter((bestand) => verboden.test(readFileSync(bestand, "utf8")))
    .map((bestand) => relative(pakkettenMap, bestand));

  expect(overtreders).toEqual([]);
});
