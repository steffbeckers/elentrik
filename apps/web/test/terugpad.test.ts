// `veiligTerugpad`: wanneer een terugkeer-bestemming (de `terug`-parameter of een `callbackURL`) een
// veilig relatief pad is. Dezelfde functie draait op de server (de foutredirect) en op de client.
import { describe, expect, test } from "vitest";
import { veiligTerugpad } from "../shared/terugpad";

describe("veiligTerugpad", () => {
  test.each(["/projecten", "/uitnodiging/abc?x=1", "/", "/projecten/p1?tab=x#y"])("%j wordt aanvaard", (pad) => {
    expect(veiligTerugpad(pad)).toBe(pad);
  });

  test.each([
    "//evil.example",
    "https://evil.example",
    "http://evil.example/",
    "/\\evil.example",
    "%2F%2Fevil.example",
    "/%2Fevil.example",
    "/%5Cevil.example",
    "%2Fprojecten%2F..%2F%2Fevil.example",
    "javascript:alert(1)",
    "/\t/evil.example",
    "/\n/evil.example",
    "evil.example",
    " /projecten",
    "/%E0%A4%A",
    // Puntsegmenten: de browser (WHATWG) normaliseert dit tot `//evil.example`.
    "/.//evil.example?error=1",
    "/..//evil",
    "/%2E//evil",
    "/%2e%2E//evil",
    "/a/..//evil?error=1",
    "",
  ])("%j wordt geweigerd", (pad) => {
    expect(veiligTerugpad(pad)).toBeNull();
  });

  test("het resultaat is het genormaliseerde pad: wat gevalideerd is, is wat gebruikt wordt", () => {
    expect(veiligTerugpad("/a/../projecten?x=1#y")).toBe("/projecten?x=1#y");
    expect(veiligTerugpad("/./projecten")).toBe("/projecten");
    expect(veiligTerugpad("/projecten/./p1")).toBe("/projecten/p1");
  });

  test("een niet-string of een absurd lang pad wordt geweigerd", () => {
    for (const waarde of [undefined, null, 42, ["/a"], {}]) expect(veiligTerugpad(waarde)).toBeNull();
    expect(veiligTerugpad(`/${"a".repeat(3000)}`)).toBeNull();
  });
});
