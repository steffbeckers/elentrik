import { describe, expect, test, vi } from "vitest";
import { haalMijOpServer, setCookies } from "../app/sessie/ssr";

describe("setCookies", () => {
  test("elke Set-Cookie apart, ook met komma's in een vervaldatum", () => {
    const headers = new Headers();
    headers.append("set-cookie", "a=1; Expires=Wed, 21 Oct 2026 07:28:00 GMT; Path=/; HttpOnly");
    headers.append("set-cookie", "b=2; Path=/");
    expect(setCookies(headers)).toEqual([
      "a=1; Expires=Wed, 21 Oct 2026 07:28:00 GMT; Path=/; HttpOnly",
      "b=2; Path=/",
    ]);
  });

  test("geen Set-Cookie: leeg", () => {
    expect(setCookies(new Headers({ "content-type": "application/json" }))).toEqual([]);
  });
});

describe("haalMijOpServer", () => {
  const MIJ = { gebruiker: { id: "u1", naam: "An", email: "an@x.be", proefGebruikt: false, taal: "nl" as const }, organisaties: [], actieveOrganisatieId: null, abonnementenIngeschakeld: false };

  test("stuurt de cookie van het verzoek mee en de verlengde sessiecookie door naar de pagina", async () => {
    const headers = new Headers();
    headers.append("set-cookie", "better-auth.session_token=nieuw; Max-Age=2592000; Path=/; HttpOnly");
    const haalRuw = vi.fn(async () => ({ _data: MIJ, headers }));
    const voegCookieToe = vi.fn();

    const mij = await haalMijOpServer({ haalRuw, cookie: "better-auth.session_token=oud", voegCookieToe });

    expect(mij).toEqual(MIJ);
    expect(haalRuw).toHaveBeenCalledWith("/api/mij", { headers: { cookie: "better-auth.session_token=oud" } });
    expect(voegCookieToe).toHaveBeenCalledTimes(1);
    expect(voegCookieToe).toHaveBeenCalledWith("better-auth.session_token=nieuw; Max-Age=2592000; Path=/; HttpOnly");
  });

  test("zonder cookie: geen cookie-header", async () => {
    const haalRuw = vi.fn(async () => ({ _data: MIJ, headers: new Headers() }));
    await haalMijOpServer({ haalRuw, cookie: undefined, voegCookieToe: vi.fn() });
    expect(haalRuw).toHaveBeenCalledWith("/api/mij", { headers: {} });
  });

  test("een fout gaat door (bv. 401), en wat de server toch aan cookies zette, gaat mee", async () => {
    const headers = new Headers();
    headers.append("set-cookie", "better-auth.session_token=; Max-Age=0; Path=/");
    const fout = Object.assign(new Error("Niet ingelogd"), { status: 401, response: { headers } });
    const voegCookieToe = vi.fn();
    await expect(
      haalMijOpServer({ haalRuw: vi.fn(async () => Promise.reject(fout)), cookie: "x=1", voegCookieToe }),
    ).rejects.toBe(fout);
    expect(voegCookieToe).toHaveBeenCalledWith("better-auth.session_token=; Max-Age=0; Path=/");
  });
});
