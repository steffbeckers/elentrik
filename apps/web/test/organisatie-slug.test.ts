import { describe, expect, test } from "vitest";
import { maakSlug } from "../app/sessie/slug";

describe("maakSlug", () => {
  test("kleine letters zonder accenten, plus 6 willekeurige tekens", () => {
    expect(maakSlug("Électro Peeters & Zonen")).toMatch(/^electro-peeters-zonen-[a-z0-9]{6}$/);
  });

  test("zonder bruikbare tekens: organisatie", () => {
    expect(maakSlug("  ***  ")).toMatch(/^organisatie-[a-z0-9]{6}$/);
  });

  test("hoogstens 40 tekens voor het achtervoegsel, zonder streepje aan het einde", () => {
    const slug = maakSlug(`${"a".repeat(39)} b`);
    expect(slug).toMatch(/^a{39}-[a-z0-9]{6}$/);
  });

  test("twee keer dezelfde naam: verschillende slugs", () => {
    expect(maakSlug("Elektro")).not.toBe(maakSlug("Elektro"));
  });
});
