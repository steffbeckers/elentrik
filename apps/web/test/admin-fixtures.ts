import type { AbonnementConfig } from "../server/abonnementen/config";
export const ADMIN_BILLING: Extract<AbonnementConfig, { ingeschakeld: true }> = {
  ingeschakeld: true, sleutel: "sk_test_fixture", webhookGeheim: null,
  prijzen: { maand: "price_maand", jaar: "price_jaar" }, boekhoudingInbox: null, apiBasis: null,
};
