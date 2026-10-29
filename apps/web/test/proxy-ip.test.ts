// Het bezoekers-IP achter de Cloudflare Tunnel: alleen als het verzoek uit het vertrouwde
// proxy-subnet komt, geldt cf-connecting-ip; anders blijft het IP van de socket. De auth-route
// zet dat IP in x-forwarded-for voor de limiter van Better Auth.
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApp, createRouter, toNodeListener, type EventHandler } from "h3";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { type Auth, zetAuth } from "../server/auth";
import { clientIp } from "../server/auth/ip";
import { inSubnet, isCidr, isIp } from "../server/net";

const NET = "172.30.70.0/24";

describe("clientIp", () => {
  const met = (header: string | undefined) => new Headers(header === undefined ? {} : { "cf-connecting-ip": header });

  test("een socket in het vertrouwde net: het IP uit cf-connecting-ip", () => {
    expect(clientIp(met("203.0.113.7"), "172.30.70.5", NET)).toBe("203.0.113.7");
  });

  test("een socket buiten het net: het socket-IP, ook met de header", () => {
    expect(clientIp(met("203.0.113.7"), "198.51.100.1", NET)).toBe("198.51.100.1");
  });

  test("een ongeldige header: het socket-IP", () => {
    expect(clientIp(met("onzin"), "172.30.70.5", NET)).toBe("172.30.70.5");
    expect(clientIp(met("203.0.113.7, 10.0.0.1"), "172.30.70.5", NET)).toBe("172.30.70.5");
  });

  test("zonder header: het socket-IP", () => {
    expect(clientIp(met(undefined), "172.30.70.5", NET)).toBe("172.30.70.5");
  });

  test("zonder net: het socket-IP", () => {
    expect(clientIp(met("203.0.113.7"), "172.30.70.5", undefined)).toBe("172.30.70.5");
    expect(clientIp(met("203.0.113.7"), "172.30.70.5", "")).toBe("172.30.70.5");
  });

  test("een ongeldig net: het socket-IP", () => {
    expect(clientIp(met("203.0.113.7"), "172.30.70.5", "onzin")).toBe("172.30.70.5");
  });

  test("zonder socket-IP: undefined", () => {
    expect(clientIp(met("203.0.113.7"), undefined, NET)).toBeUndefined();
  });

  test("een IPv6-header met de socket in het net", () => {
    expect(clientIp(met("2001:db8::1"), "172.30.70.5", NET)).toBe("2001:db8::1");
  });

  test("een socket als IPv4-in-IPv6 valt ook in het net", () => {
    expect(clientIp(met("203.0.113.7"), "::ffff:172.30.70.5", NET)).toBe("203.0.113.7");
  });

  test("x-forwarded-for van de client telt nooit mee", () => {
    const headers = new Headers({ "x-forwarded-for": "6.6.6.6", "x-real-ip": "7.7.7.7" });
    expect(clientIp(headers, "172.30.70.5", NET)).toBe("172.30.70.5");
  });
});

describe("inSubnet", () => {
  test("IPv4 /24: de grenzen", () => {
    expect(inSubnet("172.30.70.0", NET)).toBe(true);
    expect(inSubnet("172.30.70.255", NET)).toBe(true);
    expect(inSubnet("172.30.69.255", NET)).toBe(false);
    expect(inSubnet("172.30.71.0", NET)).toBe(false);
  });

  test("IPv4 /32 en /0", () => {
    expect(inSubnet("10.0.0.1", "10.0.0.1/32")).toBe(true);
    expect(inSubnet("10.0.0.2", "10.0.0.1/32")).toBe(false);
    expect(inSubnet("203.0.113.7", "0.0.0.0/0")).toBe(true);
  });

  test("IPv6 /64", () => {
    expect(inSubnet("2001:db8:0:1::5", "2001:db8:0:1::/64")).toBe(true);
    expect(inSubnet("2001:db8:0:1:ffff:ffff:ffff:ffff", "2001:db8:0:1::/64")).toBe(true);
    expect(inSubnet("2001:db8:0:2::5", "2001:db8:0:1::/64")).toBe(false);
  });

  test("IPv4 tegen een IPv6-net en omgekeerd: false", () => {
    expect(inSubnet("172.30.70.5", "2001:db8::/32")).toBe(false);
    expect(inSubnet("2001:db8::1", NET)).toBe(false);
  });

  test("een ongeldige CIDR of een ongeldig IP geeft false", () => {
    for (const cidr of ["onzin", "172.30.70.0", "172.30.70.0/33", "172.30.70.0/-1", "172.30.70.0/x", "172.30.70/24", "::1/129", "/24", ""]) {
      expect(inSubnet("172.30.70.5", cidr), cidr).toBe(false);
    }
    expect(inSubnet("onzin", NET)).toBe(false);
    expect(inSubnet("172.30.70.256", NET)).toBe(false);
  });
});

describe("isIp en isCidr", () => {
  test("geldige en ongeldige IP's", () => {
    for (const ip of ["127.0.0.1", "203.0.113.7", "::1", "2001:db8::1", "::ffff:1.2.3.4", "1:2:3:4:5:6:7:8"]) {
      expect(isIp(ip), ip).toBe(true);
    }
    for (const ip of ["", "onzin", "1.2.3", "1.2.3.4.5", "256.1.1.1", "01.2.3.4", "1.2.3.4, 5.6.7.8", "1::2::3", "12345::1", " 1.2.3.4"]) {
      expect(isIp(ip), ip).toBe(false);
    }
  });

  test("een CIDR", () => {
    expect(isCidr("172.30.70.0/24")).toBe(true);
    expect(isCidr("2001:db8::/64")).toBe(true);
    expect(isCidr("172.30.70.0")).toBe(false);
    expect(isCidr("172.30.70.0/33")).toBe(false);
  });
});

describe("de auth-route en het IP voor Better Auth", () => {
  let server: Server;
  let basis: string;

  beforeAll(async () => {
    // Een nep-Better Auth die laat zien welk x-forwarded-for hij kreeg.
    zetAuth({
      handler: async (verzoek: Request) =>
        Response.json({ xff: verzoek.headers.get("x-forwarded-for"), realIp: verzoek.headers.get("x-real-ip") }),
    } as unknown as Auth);
    const route = (await import("../server/api/auth/[...all]")) as { default: EventHandler };
    const router = createRouter();
    router.use("/api/auth/**", route.default);
    const app = createApp();
    app.use(router);
    server = createServer(toNodeListener(app));
    await new Promise<void>((klaar) => server.listen(0, "127.0.0.1", klaar));
    basis = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise((klaar) => server?.close(klaar));
    vi.unstubAllEnvs();
  });

  const vraag = async () => {
    const antwoord = await fetch(`${basis}/api/auth/ok`, {
      headers: { "cf-connecting-ip": "203.0.113.7", "x-forwarded-for": "6.6.6.6", "x-real-ip": "7.7.7.7" },
    });
    return (await antwoord.json()) as { xff: string | null; realIp: string | null };
  };

  test("een socket in het vertrouwde net: Better Auth ziet het IP uit cf-connecting-ip", async () => {
    vi.stubEnv("ELENTRIK_VERTROUWD_PROXYNET", "127.0.0.0/8");
    expect(await vraag()).toEqual({ xff: "203.0.113.7", realIp: null });
  });

  test("een socket buiten het net, of zonder net: Better Auth ziet het socket-IP", async () => {
    vi.stubEnv("ELENTRIK_VERTROUWD_PROXYNET", "172.30.70.0/24");
    expect(await vraag()).toEqual({ xff: "127.0.0.1", realIp: null });
    vi.stubEnv("ELENTRIK_VERTROUWD_PROXYNET", "");
    expect(await vraag()).toEqual({ xff: "127.0.0.1", realIp: null });
  });
});
