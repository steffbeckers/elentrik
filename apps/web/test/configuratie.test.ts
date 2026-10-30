// De opstartcontrole van de configuratie: alleen namen van variabelen in de meldingen, nooit
// een waarde. In productie gooit de plugin bij problemen; anders waarschuwt ze alleen.
import { afterEach, describe, expect, test, vi } from "vitest";
import { controleerBijStart, controleerConfiguratie } from "../server/config/controle";
import { isPlaatshouder, PLAATSHOUDERS } from "../server/config/plaatshouders";
import { plaatshoudersUitVoorbeelden } from "./plaatshouders";

// Nitro draait niet in Vitest: defineNitroPlugin geeft de functie van de plugin terug.
vi.mock("nitropack/runtime", () => ({ defineNitroPlugin: (f: () => void) => f }));

const GEHEIM = "geheim-xyz";

const VOLLEDIG: Record<string, string> = {
  DATABASE_URL: `postgres://elentrik:${GEHEIM}@db:5432/elentrik`,
  BETTER_AUTH_SECRET: `${GEHEIM}-lang-genoeg-voor-de-controle-0123456789`,
  BETTER_AUTH_URL: "https://elentrik.example.be",
  ELENTRIK_BESTANDEN_DIR: "/data/bestanden",
  ELENTRIK_GOTENBERG_URL: "http://gotenberg:3000",
};

const VERPLICHT = Object.keys(VOLLEDIG);

const STRIPE: Record<string, string> = {
  ...VOLLEDIG,
  STRIPE_GEHEIME_SLEUTEL: "sk_live_x",
  STRIPE_WEBHOOK_GEHEIM: "whsec_x",
  STRIPE_PRIJS_MAAND: "price_m",
  STRIPE_PRIJS_JAAR: "price_j",
};

describe("controleerConfiguratie", () => {
  test("een volledige env geeft geen problemen", () => {
    expect(controleerConfiguratie(VOLLEDIG)).toEqual([]);
  });

  test.each(VERPLICHT)("zonder %s: die naam", (naam) => {
    const env = { ...VOLLEDIG };
    delete env[naam];
    expect(controleerConfiguratie(env)).toEqual([naam]);
  });

  test("een lege of blanco waarde telt als ontbrekend", () => {
    expect(controleerConfiguratie({ ...VOLLEDIG, ELENTRIK_GOTENBERG_URL: "   " })).toEqual(["ELENTRIK_GOTENBERG_URL"]);
    expect(controleerConfiguratie({ ...VOLLEDIG, DATABASE_URL: "" })).toEqual(["DATABASE_URL"]);
  });

  test("MAIL_VERZENDER=graph vraagt de GRAPH-variabelen en het afzenderadres", () => {
    const graph = {
      ...VOLLEDIG,
      MAIL_VERZENDER: "graph",
      GRAPH_TENANT_ID: "t",
      GRAPH_CLIENT_ID: "c",
      GRAPH_CLIENT_GEHEIM: GEHEIM,
      MAIL_AFZENDER: "noreply@elentrik.example.be",
    };
    expect(controleerConfiguratie(graph)).toEqual([]);
    for (const naam of ["GRAPH_TENANT_ID", "GRAPH_CLIENT_ID", "GRAPH_CLIENT_GEHEIM", "MAIL_AFZENDER"]) {
      const env: Record<string, string | undefined> = { ...graph };
      delete env[naam];
      expect(controleerConfiguratie(env), naam).toEqual([naam]);
    }
  });

  test("zonder MAIL_VERZENDER of met smtp zijn de GRAPH-variabelen niet nodig", () => {
    expect(controleerConfiguratie({ ...VOLLEDIG, MAIL_VERZENDER: "smtp" })).toEqual([]);
    expect(controleerConfiguratie({ ...VOLLEDIG, MAIL_VERZENDER: "" })).toEqual([]);
  });

  test("een onbekende MAIL_VERZENDER: die naam", () => {
    expect(controleerConfiguratie({ ...VOLLEDIG, MAIL_VERZENDER: "post" })).toEqual(["MAIL_VERZENDER"]);
  });

  describe("in productie", () => {
    const PROD: Record<string, string> = {
      ...VOLLEDIG,
      NODE_ENV: "production",
      SMTP_HOST: "smtp.example.be",
      SMTP_VAN: "Elentrik <noreply@elentrik.example.be>",
    };

    test("smtp (ook als MAIL_VERZENDER leeg is) vraagt SMTP_HOST en SMTP_VAN", () => {
      expect(controleerConfiguratie(PROD)).toEqual([]);
      expect(controleerConfiguratie({ ...PROD, MAIL_VERZENDER: "smtp" })).toEqual([]);
      for (const verzender of [undefined, "", "smtp"]) {
        for (const naam of ["SMTP_HOST", "SMTP_VAN"]) {
          const env: Record<string, string | undefined> = { ...PROD, MAIL_VERZENDER: verzender };
          delete env[naam];
          expect(controleerConfiguratie(env), `${verzender} zonder ${naam}`).toEqual([naam]);
          expect(controleerConfiguratie({ ...env, [naam]: "  " }), `${verzender} met blanco ${naam}`).toEqual([naam]);
        }
      }
    });

    test("graph vraagt geen SMTP-variabelen", () => {
      const graph = {
        ...VOLLEDIG,
        NODE_ENV: "production",
        MAIL_VERZENDER: "graph",
        GRAPH_TENANT_ID: "t",
        GRAPH_CLIENT_ID: "c",
        GRAPH_CLIENT_GEHEIM: GEHEIM,
        MAIL_AFZENDER: "noreply@elentrik.example.be",
      };
      expect(controleerConfiguratie(graph)).toEqual([]);
    });

    test("een onbekende MAIL_VERZENDER meldt alleen die naam", () => {
      expect(controleerConfiguratie({ ...PROD, MAIL_VERZENDER: "post" })).toEqual(["MAIL_VERZENDER"]);
    });

    test("PGPASSWORD als plaatshouder (<...>): die naam; een echte waarde of niet gezet is goed", () => {
      expect(controleerConfiguratie({ ...PROD, PGPASSWORD: "<vervang-door-een-lange-willekeurige-waarde>" })).toEqual(["PGPASSWORD"]);
      expect(controleerConfiguratie({ ...PROD, PGPASSWORD: "rook/test#pw?x@y" })).toEqual([]);
      expect(controleerConfiguratie(PROD)).toEqual([]);
    });
  });

  test("buiten productie blijft SMTP onbeperkt (Mailpit-standaard)", () => {
    expect(controleerConfiguratie({ ...VOLLEDIG, NODE_ENV: "development" })).toEqual([]);
    expect(controleerConfiguratie({ ...VOLLEDIG, MAIL_VERZENDER: "smtp" })).toEqual([]);
  });

  test("de plaatshouders uit de voorbeeldbestanden tellen als niet ingevuld (graph)", () => {
    const graph = {
      ...VOLLEDIG,
      MAIL_VERZENDER: "graph",
      GRAPH_TENANT_ID: "t",
      GRAPH_CLIENT_ID: "c",
      GRAPH_CLIENT_GEHEIM: GEHEIM,
      MAIL_AFZENDER: "noreply@elentrik.example.be",
    };
    for (const naam of ["GRAPH_TENANT_ID", "GRAPH_CLIENT_ID", "GRAPH_CLIENT_GEHEIM", "MAIL_AFZENDER"]) {
      expect(controleerConfiguratie({ ...graph, [naam]: "<tenant-id>" }), naam).toEqual([naam]);
      expect(controleerConfiguratie({ ...graph, [naam]: "  <client-geheim>" }), naam).toEqual([naam]);
    }
  });

  test("BETTER_AUTH_URL moet een http(s)-adres zijn", () => {
    expect(controleerConfiguratie({ ...VOLLEDIG, BETTER_AUTH_URL: "http://127.0.0.1:3399" })).toEqual([]);
    for (const slecht of ["elentrik.app", "<jouw-adres>", "ftp://elentrik.app", "https://", "onzin"]) {
      expect(controleerConfiguratie({ ...VOLLEDIG, BETTER_AUTH_URL: slecht }), slecht).toEqual(["BETTER_AUTH_URL"]);
    }
  });

  test("een Stripe-sleutel vraagt beide prijzen en het webhookgeheim", () => {
    expect(controleerConfiguratie(STRIPE)).toEqual([]);
    for (const naam of ["STRIPE_WEBHOOK_GEHEIM", "STRIPE_PRIJS_MAAND", "STRIPE_PRIJS_JAAR"]) {
      const env: Record<string, string | undefined> = { ...STRIPE };
      delete env[naam];
      expect(controleerConfiguratie(env), naam).toEqual([naam]);
    }
  });

  test("zonder Stripe-sleutel zijn de Stripe-variabelen niet nodig", () => {
    expect(controleerConfiguratie({ ...VOLLEDIG, STRIPE_GEHEIME_SLEUTEL: "", STRIPE_PRIJS_MAAND: "" })).toEqual([]);
  });

  test("een ongeldige STRIPE_API_BASIS: die naam", () => {
    expect(controleerConfiguratie({ ...STRIPE, STRIPE_API_BASIS: "https://example.com" })).toEqual(["STRIPE_API_BASIS"]);
  });

  test("ELENTRIK_OPSLAG_PER_BEDRIJF_MB: leeg of een positief geheel getal is goed, anders die naam", () => {
    for (const goed of ["100", "5120", "", "  "]) {
      expect(controleerConfiguratie({ ...VOLLEDIG, ELENTRIK_OPSLAG_PER_BEDRIJF_MB: goed }), goed).toEqual([]);
    }
    for (const fout of ["0", "-1", "abc", "1.5"]) {
      expect(controleerConfiguratie({ ...VOLLEDIG, ELENTRIK_OPSLAG_PER_BEDRIJF_MB: fout }), fout).toEqual([
        "ELENTRIK_OPSLAG_PER_BEDRIJF_MB",
      ]);
    }
  });

  test("ELENTRIK_VERTROUWD_PROXYNET: leeg of een geldige CIDR is goed, anders die naam", () => {
    expect(controleerConfiguratie({ ...VOLLEDIG, ELENTRIK_VERTROUWD_PROXYNET: "172.30.70.0/24" })).toEqual([]);
    expect(controleerConfiguratie({ ...VOLLEDIG, ELENTRIK_VERTROUWD_PROXYNET: "" })).toEqual([]);
    expect(controleerConfiguratie({ ...VOLLEDIG, ELENTRIK_VERTROUWD_PROXYNET: "onzin" })).toEqual([
      "ELENTRIK_VERTROUWD_PROXYNET",
    ]);
    expect(controleerConfiguratie({ ...VOLLEDIG, ELENTRIK_VERTROUWD_PROXYNET: "172.30.70.0" })).toEqual([
      "ELENTRIK_VERTROUWD_PROXYNET",
    ]);
  });

  test("meerdere problemen: alle namen, en geen enkele melding bevat een waarde", () => {
    const env = {
      ...VOLLEDIG,
      BETTER_AUTH_SECRET: undefined,
      MAIL_VERZENDER: "graph",
      GRAPH_TENANT_ID: GEHEIM,
      GRAPH_CLIENT_ID: GEHEIM,
      STRIPE_GEHEIME_SLEUTEL: `sk_live_${GEHEIM}`,
      ELENTRIK_VERTROUWD_PROXYNET: GEHEIM,
    };
    const problemen = controleerConfiguratie(env);
    expect(problemen).toEqual(
      expect.arrayContaining([
        "BETTER_AUTH_SECRET",
        "GRAPH_CLIENT_GEHEIM",
        "MAIL_AFZENDER",
        "STRIPE_WEBHOOK_GEHEIM",
        "STRIPE_PRIJS_MAAND",
        "STRIPE_PRIJS_JAAR",
        "ELENTRIK_VERTROUWD_PROXYNET",
      ]),
    );
    for (const melding of problemen) {
      expect(melding).toMatch(/^[A-Z][A-Z0-9_]*$/);
      expect(melding).not.toContain(GEHEIM);
    }
  });
});

describe("controleerBijStart", () => {
  afterEach(() => vi.restoreAllMocks());

  test("in productie met problemen: een Error met de namen, zonder waarden", () => {
    const env = { ...VOLLEDIG, NODE_ENV: "production", ELENTRIK_VERTROUWD_PROXYNET: GEHEIM, ELENTRIK_GOTENBERG_URL: "" };
    let fout: unknown;
    try {
      controleerBijStart(env);
    } catch (f) {
      fout = f;
    }
    expect(fout).toBeInstanceOf(Error);
    const bericht = (fout as Error).message;
    expect(bericht).toContain("ELENTRIK_VERTROUWD_PROXYNET");
    expect(bericht).toContain("ELENTRIK_GOTENBERG_URL");
    expect(bericht).not.toContain(GEHEIM);
  });

  test("in productie zonder problemen: geen throw en geen waarschuwing", () => {
    const waarschuw = vi.spyOn(console, "warn").mockImplementation(() => {});
    const env = { ...VOLLEDIG, NODE_ENV: "production", SMTP_HOST: "smtp.example.be", SMTP_VAN: "noreply@elentrik.example.be" };
    expect(() => controleerBijStart(env)).not.toThrow();
    expect(waarschuw).not.toHaveBeenCalled();
  });

  test("in productie met smtp (standaard) zonder SMTP_HOST en SMTP_VAN: de server start niet", () => {
    expect(() => controleerBijStart({ ...VOLLEDIG, NODE_ENV: "production" })).toThrow(/SMTP_HOST, SMTP_VAN/);
  });

  test("buiten productie met problemen: een waarschuwing met de namen, geen throw", () => {
    const waarschuw = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => controleerBijStart({ ...VOLLEDIG, ELENTRIK_GOTENBERG_URL: undefined, NODE_ENV: "development" })).not.toThrow();
    expect(waarschuw).toHaveBeenCalledTimes(1);
    const bericht = String(waarschuw.mock.calls[0]![0]);
    expect(bericht).toContain("ELENTRIK_GOTENBERG_URL");
    expect(bericht).not.toContain(GEHEIM);
  });
});

describe("de Nitro-plugin", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  async function laad(): Promise<() => void> {
    return ((await import("../server/plugins/configuratie")) as { default: () => void }).default;
  }

  test("in productie met een onvolledige omgeving: de plugin gooit", async () => {
    for (const naam of VERPLICHT) vi.stubEnv(naam, "");
    vi.stubEnv("NODE_ENV", "production");
    const plugin = await laad();
    expect(plugin).toThrow(/DATABASE_URL/);
  });

  test("buiten productie met een onvolledige omgeving: een waarschuwing", async () => {
    for (const naam of VERPLICHT) vi.stubEnv(naam, "");
    vi.stubEnv("NODE_ENV", "development");
    const waarschuw = vi.spyOn(console, "warn").mockImplementation(() => {});
    const plugin = await laad();
    expect(plugin).not.toThrow();
    expect(waarschuw).toHaveBeenCalled();
  });
});

describe("grendels per omgeving (plan 10)", () => {
  const STAGING: Record<string, string> = {
    ...VOLLEDIG,
    ELENTRIK_OMGEVING: "staging",
    MAIL_VERZENDER: "smtp",
    SMTP_HOST: "mailpit",
    SMTP_VAN: "Elentrik <noreply@staging.elentrik.app>",
    STRIPE_GEHEIME_SLEUTEL: "sk_test_x",
    STRIPE_WEBHOOK_GEHEIM: "whsec_x",
    STRIPE_PRIJS_MAAND: "price_m",
    STRIPE_PRIJS_JAAR: "price_j",
  };
  const GRAPH_VARS = {
    GRAPH_TENANT_ID: "t",
    GRAPH_CLIENT_ID: "c",
    GRAPH_CLIENT_GEHEIM: GEHEIM,
    MAIL_AFZENDER: "noreply@elentrik.example.be",
  };

  test("staging met smtp/mailpit en een sk_test_-sleutel: geen probleem", () => {
    expect(controleerConfiguratie(STAGING)).toEqual([]);
    expect(controleerConfiguratie({ ...STAGING, NODE_ENV: "production" })).toEqual([]);
  });

  test("staging met MAIL_VERZENDER=graph: MAIL_VERZENDER", () => {
    expect(controleerConfiguratie({ ...STAGING, MAIL_VERZENDER: "graph", ...GRAPH_VARS })).toEqual(["MAIL_VERZENDER"]);
  });

  test("staging met een sk_live_-sleutel: STRIPE_GEHEIME_SLEUTEL, zonder de waarde", () => {
    const problemen = controleerConfiguratie({ ...STAGING, STRIPE_GEHEIME_SLEUTEL: `sk_live_${GEHEIM}` });
    expect(problemen).toEqual(["STRIPE_GEHEIME_SLEUTEL"]);
    expect(problemen.join()).not.toContain(GEHEIM);
  });

  test.each(["sk_test_abc", "rk_test_abc", "  sk_test_abc  "])("staging met testsleutel %j: geen probleem", (sleutel) => {
    expect(controleerConfiguratie({ ...STAGING, STRIPE_GEHEIME_SLEUTEL: sleutel })).toEqual([]);
  });

  test.each(["rk_live_abc", "  sk_live_abc", "sk_abc", "geheim-zonder-voorvoegsel", "Sk_test_abc"])(
    "staging met sleutel %j (geen testsleutel): STRIPE_GEHEIME_SLEUTEL",
    (sleutel) => {
      const problemen = controleerConfiguratie({ ...STAGING, STRIPE_GEHEIME_SLEUTEL: sleutel });
      expect(problemen).toEqual(["STRIPE_GEHEIME_SLEUTEL"]);
      expect(problemen.join()).not.toContain(sleutel.trim());
    },
  );

  test("staging zonder Stripe-sleutel mag (abonnementen uit)", () => {
    expect(controleerConfiguratie({ ...STAGING, STRIPE_GEHEIME_SLEUTEL: "" })).toEqual([]);
  });

  test("productie met SMTP_HOST=mailpit: SMTP_HOST", () => {
    const productie = { ...VOLLEDIG, ELENTRIK_OMGEVING: "productie", NODE_ENV: "production", SMTP_HOST: "mailpit", SMTP_VAN: "x@elentrik.app" };
    expect(controleerConfiguratie(productie)).toEqual(["SMTP_HOST"]);
    expect(controleerConfiguratie({ ...productie, SMTP_HOST: " Mailpit " })).toEqual(["SMTP_HOST"]);
    expect(controleerConfiguratie({ ...productie, SMTP_HOST: "elentrik-mailpit" })).toEqual(["SMTP_HOST"]);
    expect(controleerConfiguratie({ ...productie, SMTP_HOST: " Elentrik-Mailpit " })).toEqual(["SMTP_HOST"]);
    expect(controleerConfiguratie({ ...productie, SMTP_HOST: "smtp.example.be" })).toEqual([]);
  });

  test("productie met graph en een live-sleutel is toegelaten", () => {
    const productie = {
      ...VOLLEDIG,
      ELENTRIK_OMGEVING: "productie",
      MAIL_VERZENDER: "graph",
      ...GRAPH_VARS,
      STRIPE_GEHEIME_SLEUTEL: "sk_live_x",
      STRIPE_WEBHOOK_GEHEIM: "whsec_x",
      STRIPE_PRIJS_MAAND: "price_m",
      STRIPE_PRIJS_JAAR: "price_j",
    };
    expect(controleerConfiguratie(productie)).toEqual([]);
  });

  test("zonder ELENTRIK_OMGEVING gelden de grendels niet (lokaal en e2e)", () => {
    expect(controleerConfiguratie({ ...VOLLEDIG, MAIL_VERZENDER: "graph", ...GRAPH_VARS, SMTP_HOST: "mailpit" })).toEqual([]);
    expect(controleerConfiguratie({ ...STRIPE, SMTP_HOST: "mailpit" })).toEqual([]);
  });

  test("een andere waarde dan productie of staging: ELENTRIK_OMGEVING (anders vallen de grendels stil weg)", () => {
    expect(controleerConfiguratie({ ...VOLLEDIG, ELENTRIK_OMGEVING: "Staging" })).toEqual(["ELENTRIK_OMGEVING"]);
    expect(controleerConfiguratie({ ...VOLLEDIG, ELENTRIK_OMGEVING: "  " })).toEqual([]);
  });

  test("met ELENTRIK_OMGEVING gezet weigert de server ook buiten NODE_ENV=production", () => {
    const env = { ...STAGING, NODE_ENV: "development", MAIL_VERZENDER: "graph", ...GRAPH_VARS };
    expect(() => controleerBijStart(env)).toThrow(/MAIL_VERZENDER/);
    expect(() => controleerBijStart(env)).not.toThrow(/mailpit|geheim/);
  });
});

// Alleen de exacte plaatshouders uit deploy/nas/.env.voorbeeld en apps/web/.env.example gelden als niet
// ingevuld, niet elke waarde die met "<" begint: een wachtwoord als "<geheim>wachtwoord123" is geldig.
// De lijst in de code wordt hier uit die twee bestanden afgeleid, zodat ze niet kan afwijken.
describe("plaatshouders uit de voorbeeldbestanden", () => {
  const AFGELEID = plaatshoudersUitVoorbeelden();

  test("de afleiding vindt de plaatshouders, en geen samengestelde waarde", () => {
    expect(AFGELEID).toEqual(
      expect.arrayContaining([
        "<vervang-door-een-lange-willekeurige-waarde>",
        "<vervang-door-een-andere-lange-willekeurige-waarde>",
        "<tenant-id>",
        "<client-geheim>",
      ]),
    );
    expect(AFGELEID.length).toBeGreaterThanOrEqual(8);
    expect(AFGELEID.some((p) => p.includes("noreply"))).toBe(false);
  });

  test("PLAATSHOUDERS in de code is precies die lijst", () => {
    expect([...PLAATSHOUDERS].sort()).toEqual([...AFGELEID].sort());
  });

  test("elke plaatshouder wordt geweigerd als PGPASSWORD en als Graph-variabele", () => {
    const graph = {
      ...VOLLEDIG,
      MAIL_VERZENDER: "graph",
      GRAPH_TENANT_ID: "t",
      GRAPH_CLIENT_ID: "c",
      GRAPH_CLIENT_GEHEIM: GEHEIM,
      MAIL_AFZENDER: "noreply@elentrik.example.be",
    };
    for (const plaatshouder of AFGELEID) {
      expect(isPlaatshouder(plaatshouder), plaatshouder).toBe(true);
      expect(isPlaatshouder(`  ${plaatshouder} `), plaatshouder).toBe(true);
      expect(controleerConfiguratie({ ...VOLLEDIG, NODE_ENV: "production", MAIL_VERZENDER: "smtp", SMTP_HOST: "smtp.example.be", SMTP_VAN: "a@b.be", PGPASSWORD: plaatshouder }), plaatshouder).toEqual(["PGPASSWORD"]);
      expect(controleerConfiguratie({ ...graph, GRAPH_CLIENT_ID: plaatshouder }), plaatshouder).toEqual(["GRAPH_CLIENT_ID"]);
    }
  });

  test("een echte waarde die met < begint of een < bevat, wordt aanvaard", () => {
    const productie = { ...VOLLEDIG, NODE_ENV: "production", MAIL_VERZENDER: "smtp", SMTP_HOST: "smtp.example.be", SMTP_VAN: "a@b.be" };
    for (const waarde of ["<geheim>wachtwoord123", "<geheim", "wacht<woord>123", "<vervang-door-iets-anders>", "<tenant-id>x", "Elentrik <noreply@elentrik.app>"]) {
      expect(isPlaatshouder(waarde), waarde).toBe(false);
      expect(controleerConfiguratie({ ...productie, PGPASSWORD: waarde }), waarde).toEqual([]);
    }
    expect(isPlaatshouder(undefined)).toBe(false);
    expect(isPlaatshouder("")).toBe(false);
  });

  test("Graph-variabelen met een echte waarde die met < begint, worden aanvaard", () => {
    const graph = {
      ...VOLLEDIG,
      MAIL_VERZENDER: "graph",
      GRAPH_TENANT_ID: "t",
      GRAPH_CLIENT_ID: "c",
      GRAPH_CLIENT_GEHEIM: "<geheim>wachtwoord123",
      MAIL_AFZENDER: "noreply@elentrik.example.be",
    };
    expect(controleerConfiguratie(graph)).toEqual([]);
  });
});
