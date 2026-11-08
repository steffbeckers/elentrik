import { expect, test } from "vitest";
import { stripeBeheerLinks } from "../server/admin/stripe-links";
import { ADMIN_BILLING } from "./admin-fixtures";
test("Stripe links target validated records in the configured mode without secrets", () => {
  const ids = { klantId: "cus_123", abonnementId: "sub_456" };
  expect(stripeBeheerLinks(ADMIN_BILLING, ids)).toEqual({ klant: "https://dashboard.stripe.com/test/customers/cus_123", abonnement: "https://dashboard.stripe.com/test/subscriptions/sub_456" });
  expect(stripeBeheerLinks({ ...ADMIN_BILLING, sleutel: "sk_live_geheim" }, ids).abonnement).toBe("https://dashboard.stripe.com/subscriptions/sub_456");
  for (const config of [{ ingeschakeld: false, limieten: { kringen: 5, situatieschemas: 1 } } as const, { ...ADMIN_BILLING, sleutel: "onbekend" }, { ...ADMIN_BILLING, apiBasis: new URL("http://127.0.0.1:9999") }]) {
    expect(stripeBeheerLinks(config, ids)).toEqual({ klant: null, abonnement: null });
  }
  expect(stripeBeheerLinks(ADMIN_BILLING, { klantId: null, abonnementId: "sub_../secret" })).toEqual({ klant: null, abonnement: null });
});
