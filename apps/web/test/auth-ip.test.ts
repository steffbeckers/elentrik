import { describe, expect, test } from "vitest";
import { metSocketIp } from "../server/auth/ip";

describe("metSocketIp", () => {
  test("vervangt een x-forwarded-for van de client door het socket-IP en schrapt x-real-ip", async () => {
    const verzoek = new Request("http://127.0.0.1:3000/api/auth/sign-in/email", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "203.0.113.7, 198.51.100.1",
        "x-real-ip": "203.0.113.8",
        cookie: "a=b",
      },
      body: JSON.stringify({ email: "a@b.be" }),
    });

    const nieuw = metSocketIp(verzoek, "127.0.0.1");

    expect(nieuw.headers.get("x-forwarded-for")).toBe("127.0.0.1");
    expect(nieuw.headers.has("x-real-ip")).toBe(false);
    expect(nieuw.headers.get("cookie")).toBe("a=b");
    expect(nieuw.method).toBe("POST");
    expect(nieuw.url).toBe(verzoek.url);
    expect(await nieuw.json()).toEqual({ email: "a@b.be" });
  });

  test("zonder socket-IP blijft er geen door de client gekozen IP over", () => {
    const verzoek = new Request("http://127.0.0.1:3000/api/auth/ok", {
      headers: { "x-forwarded-for": "203.0.113.7", "x-real-ip": "203.0.113.8" },
    });
    const nieuw = metSocketIp(verzoek, undefined);
    expect(nieuw.headers.has("x-forwarded-for")).toBe(false);
    expect(nieuw.headers.has("x-real-ip")).toBe(false);
  });
});
