import type { AbonnementConfig } from "../abonnementen/config";
export function stripeBeheerLinks(config: AbonnementConfig, ids: { klantId: string | null; abonnementId: string | null }) {
  const leeg = { klant: null, abonnement: null };
  if (!config.ingeschakeld || config.apiBasis) return leeg;
  const modus = /^(?:sk|rk)_(test|live)_/.exec(config.sleutel)?.[1];
  if (!modus) return leeg;
  const basis = `https://dashboard.stripe.com/${modus === "test" ? "test/" : ""}`;
  return {
    klant: ids.klantId && /^cus_[a-zA-Z0-9]+$/.test(ids.klantId) ? `${basis}customers/${ids.klantId}` : null,
    abonnement: ids.abonnementId && /^sub_[a-zA-Z0-9]+$/.test(ids.abonnementId) ? `${basis}subscriptions/${ids.abonnementId}` : null,
  };
}
