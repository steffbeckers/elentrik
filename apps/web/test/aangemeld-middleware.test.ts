import { describe, expect, test } from "vitest";
import { bestemming, isPubliek, terugZonderFout } from "../app/sessie/bestemming";
import { veiligTerugpad } from "../shared/terugpad";

const metOrganisatie = { actieveOrganisatieId: "org-1" };
const zonderOrganisatie = { actieveOrganisatieId: null };

function route(fullPath: string) {
  return { path: fullPath.split("?")[0]!, fullPath };
}

describe("isPubliek", () => {
  test.each(["/inloggen", "/registreren", "/wachtwoord-vergeten", "/wachtwoord-herstellen", "/uitnodiging/abc123"])(
    "%s is publiek",
    (pad) => {
      expect(isPubliek(pad)).toBe(true);
    },
  );

  test.each(["/", "/organisatie", "/geen-organisatie", "/instellingen", "/projecten/p1", "/uitnodiging", "/uitnodiging/", "/uitnodiging/a/b", "/inloggen-x", "/x/inloggen"])(
    "%s is niet publiek",
    (pad) => {
      expect(isPubliek(pad)).toBe(false);
    },
  );
});

describe("bestemming", () => {
  test("zonder sessie: naar /inloggen met de terugkeer-URL", () => {
    expect(bestemming(route("/projecten/p1?tab=x"), null)).toBe(
      `/inloggen?terug=${encodeURIComponent("/projecten/p1?tab=x")}`,
    );
    expect(bestemming(route("/organisatie"), null)).toBe("/inloggen?terug=%2Forganisatie");
  });

  test("zonder sessie op de startpagina: naar /inloggen zonder terugkeer-URL", () => {
    expect(bestemming(route("/"), null)).toBe("/inloggen");
  });

  test("een publieke pagina: altijd null", () => {
    for (const sessie of [null, metOrganisatie, zonderOrganisatie]) {
      expect(bestemming(route("/inloggen?terug=%2F"), sessie)).toBeNull();
      expect(bestemming(route("/registreren"), sessie)).toBeNull();
      expect(bestemming(route("/wachtwoord-vergeten"), sessie)).toBeNull();
      expect(bestemming(route("/wachtwoord-herstellen"), sessie)).toBeNull();
      expect(bestemming(route("/uitnodiging/token-1"), sessie)).toBeNull();
    }
  });

  test("een sessie zonder organisatie: naar /geen-organisatie", () => {
    expect(bestemming(route("/"), zonderOrganisatie)).toBe("/geen-organisatie");
    expect(bestemming(route("/organisatie"), zonderOrganisatie)).toBe("/geen-organisatie");
    expect(bestemming(route("/projecten/p1"), zonderOrganisatie)).toBe("/geen-organisatie");
    expect(bestemming(route("/geen-organisatie"), zonderOrganisatie)).toBeNull();
  });

  test("een sessie met organisatie: overal toegelaten, ook om een bedrijf bij te maken", () => {
    expect(bestemming(route("/"), metOrganisatie)).toBeNull();
    expect(bestemming(route("/projecten/p1"), metOrganisatie)).toBeNull();
    expect(bestemming(route("/organisatie"), metOrganisatie)).toBeNull();
    expect(bestemming(route("/geen-organisatie"), metOrganisatie)).toBeNull();
  });

  test("zonder sessie op /geen-organisatie: eerst inloggen", () => {
    expect(bestemming(route("/geen-organisatie"), null)).toBe("/inloggen?terug=%2Fgeen-organisatie");
  });
});

describe("veiligTerugpad", () => {
  test("een lokaal pad blijft", () => {
    expect(veiligTerugpad("/")).toBe("/");
    expect(veiligTerugpad("/projecten/p1?tab=x#y")).toBe("/projecten/p1?tab=x#y");
    expect(veiligTerugpad("/uitnodiging/abc")).toBe("/uitnodiging/abc");
  });

  test.each([
    "https://evil.example",
    "http://evil.example/",
    "//evil.example",
    "/\\evil.example",
    "\\\\evil.example",
    "/\t/evil.example",
    "/\n/evil.example",
    "javascript:alert(1)",
    "evil.example",
    "",
    " /projecten",
  ])("%j wordt geweigerd", (terug) => {
    expect(veiligTerugpad(terug)).toBeNull();
  });

  test("geen tekst of een lijst: geweigerd", () => {
    expect(veiligTerugpad(undefined)).toBeNull();
    expect(veiligTerugpad(null)).toBeNull();
    expect(veiligTerugpad(["/a", "/b"])).toBeNull();
    expect(veiligTerugpad(42)).toBeNull();
  });

  test("absurd lang: geweigerd", () => {
    expect(veiligTerugpad(`/${"a".repeat(3000)}`)).toBeNull();
  });
});

describe("terugZonderFout", () => {
  test("zonder error-parameter: het pad blijft, geen fout", () => {
    expect(terugZonderFout("/projecten/p1?tab=x")).toEqual({ pad: "/projecten/p1?tab=x", fout: false });
    expect(terugZonderFout("/")).toEqual({ pad: "/", fout: false });
  });

  test("een verlopen link (?error=…): de fout gemeld en uit het pad gehaald", () => {
    expect(terugZonderFout("/?error=INVALID_TOKEN")).toEqual({ pad: "/", fout: true });
    expect(terugZonderFout("/projecten/p1?tab=x&error=TOKEN_EXPIRED&error_description=weg#kop")).toEqual({
      pad: "/projecten/p1?tab=x#kop",
      fout: true,
    });
  });
});
