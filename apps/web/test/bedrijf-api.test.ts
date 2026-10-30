import { describe, expect, test } from "vitest";
import { maakBedrijfApi, type BedrijfFetch } from "../app/composables/useBedrijfApi";

type Oproep = Parameters<BedrijfFetch>;

function maakApi(antwoord: unknown) {
  const oproepen: Oproep[] = [];
  const api = maakBedrijfApi(async (...argumenten) => {
    oproepen.push(argumenten);
    return antwoord;
  });
  return { api, oproepen };
}

describe("useBedrijfApi", () => {
  test("haal leest /api/bedrijfsgegevens", async () => {
    const partij = { naam: "Elektro Peeters" };
    const { api, oproepen } = maakApi(partij);
    expect(await api.haal()).toEqual(partij);
    expect(oproepen).toEqual([["/api/bedrijfsgegevens"]]);
  });

  test("bewaar stuurt de partij als PUT-body en geeft de bewaarde partij terug", async () => {
    const partij = { naam: "Elektro Peeters", email: "info@peeters.be" };
    const { api, oproepen } = maakApi({ ...partij, logoBestandId: "l1" });
    expect(await api.bewaar(partij)).toEqual({ ...partij, logoBestandId: "l1" });
    expect(oproepen).toEqual([["/api/bedrijfsgegevens", { method: "PUT", body: partij }]]);
  });

  test("uploadLogo verstuurt multipart met het veld bestand en de naam", async () => {
    const info = { id: "l2", mime: "image/png", grootte: 3 };
    const { api, oproepen } = maakApi(info);
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });
    expect(await api.uploadLogo(blob, "logo.png")).toEqual(info);

    expect(oproepen).toHaveLength(1);
    const [url, opties] = oproepen[0] as Oproep;
    expect(url).toBe("/api/bedrijfsgegevens/logo");
    expect(opties?.method).toBe("POST");
    const body = opties?.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    const bestand = body.get("bestand") as File;
    expect(bestand.name).toBe("logo.png");
    expect(bestand.size).toBe(3);
    expect([...body.keys()]).toEqual(["bestand"]);
  });

  test("bewaar en uploadLogo sturen het meegegeven bedrijf mee, niet het actieve van dit moment", async () => {
    const oproepen: Oproep[] = [];
    const api = maakBedrijfApi(
      async (...argumenten) => {
        oproepen.push(argumenten);
        return {};
      },
      { actieveOrganisatieId: () => "org-b" },
    );
    await api.bewaar({ naam: "A" }, "org-a");
    await api.uploadLogo(new Blob([new Uint8Array([1])]), "logo.png", "org-a");
    // Zonder expliciet bedrijf geldt het actieve, zoals voorheen.
    await api.bewaar({ naam: "B" });
    expect(oproepen.map(([, opties]) => opties?.headers)).toEqual([
      { "x-elentrik-organisatie": "org-a" },
      { "x-elentrik-organisatie": "org-a" },
      { "x-elentrik-organisatie": "org-b" },
    ]);
  });

  test("een fout van de server blijft ongemoeid", async () => {
    const eigen = Object.assign(new Error("413"), { status: 413 });
    const api = maakBedrijfApi(async () => {
      throw eigen;
    });
    await expect(api.uploadLogo(new Blob([]), "x.png")).rejects.toBe(eigen);
  });
});
