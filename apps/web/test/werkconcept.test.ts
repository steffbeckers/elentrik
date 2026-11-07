import { expect, test } from "vitest";
import { Werkconcepten, veldWaarde } from "../app/editor/werkconcept";

test("ongeldige -1 blijft na blur zichtbaar en verhuist niet naar een andere selectie", () => {
  const drafts = new Werkconcepten();
  drafts.selecteer(["a"]);
  drafts.invoer("nominaal_A", "-1", false);
  drafts.verlaat("nominaal_A");
  expect(drafts.tekst.nominaal_A).toBe("-1");
  expect(drafts.ongeldig.nominaal_A).toBe(true);
  drafts.selecteer(["b"]);
  expect(drafts.tekst.nominaal_A).toBeUndefined();
  expect(drafts.verlaten[0]).toEqual({ ids: ["a"], waarden: { nominaal_A: "-1" } });
  drafts.selecteer(["a"]);
  expect(drafts.tekst.nominaal_A).toBe("-1");
  drafts.herstel("nominaal_A");
  expect(drafts.tekst.nominaal_A).toBeUndefined();
  expect(drafts.verlaten).toEqual([]);
});

test("geldige invoer ruimt bij blur op en verlaten concepten kunnen expliciet weg", () => {
  const drafts = new Werkconcepten();
  drafts.selecteer(["a"]);
  drafts.invoer("label", "keuken", true);
  drafts.verlaat("label");
  expect(drafts.tekst.label).toBeUndefined();
  drafts.invoer("nominaal_A", "-1", false);
  drafts.selecteer(["b"]);
  drafts.verwerp(["a"]);
  drafts.selecteer(["a"]);
  expect(drafts.tekst).toEqual({});
});

test("geneste aanlegwaarden lezen zonder het veldconcept te veranderen", () => {
  expect(veldWaarde({ aanleg: { inBuis: false } }, "aanleg.inBuis")).toBe(false);
  expect(veldWaarde({}, "aanleg.ligging")).toBeUndefined();
});
