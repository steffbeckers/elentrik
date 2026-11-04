import { expect, test } from "vitest";
import { verklaarToegang } from "../server/admin/toegangsweergave";
const nu = new Date("2026-11-03T12:00:00Z");
const basis = { nu, ingeschakeld: true, proefEinde: nu, vrijgesteld: false, abonnement: null };
test("explanation preserves precedence and unknown dates", () => {
  expect(verklaarToegang(basis)).toMatchObject({ schrijven: false, reden: "proef-voorbij" });
  expect(verklaarToegang({ ...basis, ingeschakeld: false })).toMatchObject({ schrijven: true, reden: "uit" });
  expect(verklaarToegang({ ...basis, vrijgesteld: true, abonnement: { status: "unpaid", achterstalligSinds: null } })).toMatchObject({ schrijven: true, reden: "vrijgesteld" });
  expect(verklaarToegang({ ...basis, abonnement: { status: "active", achterstalligSinds: null } })).toMatchObject({ schrijven: true, reden: "actief" });
  expect(verklaarToegang({ ...basis, abonnement: { status: "past_due", achterstalligSinds: null } })).toMatchObject({ schrijven: true, reden: "betaling-mislukt", achterstalligTot: null });
  expect(verklaarToegang({ ...basis, abonnement: { status: "past_due", achterstalligSinds: new Date("2026-10-20T12:00:00Z") } })).toMatchObject({ schrijven: false, reden: "betaling-mislukt" });
});
