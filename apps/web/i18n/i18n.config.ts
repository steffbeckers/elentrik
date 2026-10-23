// De opties van vue-i18n (plan 8). Een bericht dat in fr of en ontbreekt, valt terug op nl; de
// pariteitstest (test/vertalingen.test.ts) zorgt dat dat niet gebeurt.
//
// Frans: 0 en 1 zijn enkelvoud ("0 erreur", "1 erreur"); vue-i18n kiest standaard bij 0 het
// meervoud. Alleen voor berichten met twee vormen; met drie vormen ("geen | één | meer") blijft de
// standaard (0 → de eerste vorm).
function fransMeervoud(keuze: number, aantalVormen: number): number {
  const n = Math.abs(keuze);
  if (aantalVormen === 2) return n > 1 ? 1 : 0;
  return n === 0 ? 0 : Math.min(n, 2);
}

export default defineI18nConfig(() => ({
  fallbackLocale: "nl",
  pluralRules: { fr: fransMeervoud },
}));
