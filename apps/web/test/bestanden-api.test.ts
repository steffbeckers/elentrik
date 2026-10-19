import { describe, expect, test } from "vitest";
import {
  maakBestandenApi,
  type BestandenFetch,
} from "../app/composables/useBestandenApi";

type Oproep = Parameters<BestandenFetch>;

function maakApi(antwoord: unknown) {
  const oproepen: Oproep[] = [];
  const api = maakBestandenApi(async (...argumenten) => {
    oproepen.push(argumenten);
    return antwoord;
  });
  return { api, oproepen };
}

describe("useBestandenApi", () => {
  test("upload stuurt een FormData met bestand en soort", async () => {
    const info = {
      id: "b1",
      mime: "image/png",
      grootte: 3,
      breedte_px: 10,
      hoogte_px: 20,
    };
    const { api, oproepen } = maakApi(info);
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });

    expect(await api.upload("p1", "plan-raster", blob, "plan.png")).toEqual(
      info,
    );

    expect(oproepen).toHaveLength(1);
    const [url, opties] = oproepen[0]!;
    expect(url).toBe("/api/projecten/p1/bestanden");
    expect(opties?.method).toBe("POST");
    const body = opties?.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get("soort")).toBe("plan-raster");
    const bestand = body.get("bestand") as File;
    expect(bestand.name).toBe("plan.png");
    expect(bestand.size).toBe(3);
    expect(opties?.signal).toBeUndefined();
  });

  test("upload geeft een AbortSignal door", async () => {
    const { api, oproepen } = maakApi({});
    const controller = new AbortController();
    await api.upload(
      "p1",
      "plan-origineel",
      new Blob(["x"]),
      "plan.pdf",
      controller.signal,
    );
    expect(oproepen[0]![1]?.signal).toBe(controller.signal);
  });

  test("url wijst naar de bestandsroute", () => {
    const { api } = maakApi({});
    expect(api.url("abc")).toBe("/api/bestanden/abc");
  });
});
