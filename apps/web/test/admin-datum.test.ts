import { expect, test } from "vitest";
import { proefEindeVoorDatum, brusselseDatum } from "../server/admin/datum";
test("trial expires at the following Brussels midnight", () => {
  expect(proefEindeVoorDatum("2027-03-28").toISOString()).toBe("2027-03-28T22:00:00.000Z");
  expect(proefEindeVoorDatum("2027-10-31").toISOString()).toBe("2027-10-31T23:00:00.000Z");
  expect(proefEindeVoorDatum("2026-12-31").toISOString()).toBe("2026-12-31T23:00:00.000Z");
  for (const datum of ["2027-02-29", "2026-13-01", "2026-11-31", "2026-1-1", "0000-01-01"]) expect(() => proefEindeVoorDatum(datum)).toThrow();
});
test("follow-ups use the Brussels calendar day", () => {
  expect(brusselseDatum(new Date("2027-03-28T22:00:00Z"))).toBe("2027-03-29");
  expect(brusselseDatum(new Date("2027-10-31T22:59:59Z"))).toBe("2027-10-31");
});

test("historical dates use their actual Brussels offset before extension validation", () => {
  expect(proefEindeVoorDatum("1800-01-01").toISOString()).toBe("1800-01-01T23:42:30.000Z");
  expect(proefEindeVoorDatum("1900-01-01").toISOString()).toBe("1900-01-02T00:00:00.000Z");
});
