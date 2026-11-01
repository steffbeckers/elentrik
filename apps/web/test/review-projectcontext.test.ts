import { expect, test } from "vitest";
import { nieuwProjectDocument } from "@elentrik/model";
import { formulierUitProject, gegevensUitFormulier } from "../app/editor/projectformulier";

test("projectformulier bewaart expliciete context en toont onbekend bij oude dossiers", () => {
  const doc = structuredClone(nieuwProjectDocument({ klantNaam: "Test", stroomtype: "2x230V" }));
  delete doc.meta.installatieContext;
  const f = formulierUitProject("Test", doc);
  expect(f.installatieContext).toBe("onbekend");
  f.installatieContext = "nieuw";
  expect(gegevensUitFormulier(f).installatieContext).toBe("nieuw");
});
