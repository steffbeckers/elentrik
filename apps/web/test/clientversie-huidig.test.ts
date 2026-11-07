import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { createApp, defineEventHandler, toNodeListener } from "h3";
import { expect, test } from "vitest";
import middleware from "../server/middleware/clientversie";
import { CLIENT_COMPATIBILITEIT, CLIENT_HEADER, CLIENT_MINIMUM_HEADER } from "../shared/clientversie";

test.each(["1", "2"])("de huidige server blokkeert schrijfacties van oude client %s vóór de endpoint", async (oudeClient) => {
  const app = createApp();
  let endpointAanroepen = 0;
  app.use(middleware);
  app.use(defineEventHandler(() => { endpointAanroepen++; return { ok: true }; }));
  const server = createServer(toNodeListener(app));
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/projecten/test`;
  try {
    // Client 2 kent de metingen niet: zijn documentkopie zou ze bij bewaren wegschrijven.
    const oud = await fetch(url, { method: "PUT", headers: { [CLIENT_HEADER]: oudeClient } });
    expect(oud.status).toBe(426);
    expect(endpointAanroepen).toBe(0);
    expect(oud.headers.get(CLIENT_MINIMUM_HEADER)).toBe(String(CLIENT_COMPATIBILITEIT));
    expect(await oud.json()).toMatchObject({ data: { code: "NIEUWE_VERSIE_VEREIST" } });
    const lezen = await fetch(url, { headers: { [CLIENT_HEADER]: oudeClient } });
    expect(lezen.status).toBe(200);
    const huidig = await fetch(url, { method: "PUT", headers: { [CLIENT_HEADER]: String(CLIENT_COMPATIBILITEIT) } });
    expect(huidig.status).toBe(200);
    expect(endpointAanroepen).toBe(2);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  }
});
