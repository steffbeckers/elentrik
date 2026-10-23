// Een geheugenimplementatie van de Stripe-poort voor de tests. Ze praat nooit met het netwerk
// en legt elke aanroep vast in `aanroepen`. De tests vullen `abonnementen`, `facturen` en
// `prijzen` zelf.
import type {
  StripeAbonnement,
  StripeCheckout,
  StripeFactuur,
  StripePoort,
  StripePrijs,
} from "../server/abonnementen/stripe";

export type NepStripe = StripePoort & {
  aanroepen: { methode: string; invoer: unknown }[];
  /** Per klant-id. */
  abonnementen: Map<string, StripeAbonnement[]>;
  facturen: Map<string, StripeFactuur>;
  prijzen: Map<string, StripePrijs>;
  checkouts: Map<string, StripeCheckout>;
  vervallen: Set<string>;
  /** Waar: `haalPrijs` gooit alsof Stripe onbereikbaar is. */
  faalPrijzen: boolean;
};

export function maakNepStripe(): NepStripe {
  let klantTeller = 0;
  let checkoutTeller = 0;
  const nep: NepStripe = {
    aanroepen: [],
    abonnementen: new Map(),
    facturen: new Map(),
    prijzen: new Map(),
    checkouts: new Map(),
    vervallen: new Set(),
    faalPrijzen: false,

    async maakKlant(i) {
      nep.aanroepen.push({ methode: "maakKlant", invoer: i });
      return { id: `cus_nep_${++klantTeller}` };
    },

    async maakCheckout(i) {
      nep.aanroepen.push({ methode: "maakCheckout", invoer: i });
      const id = `cs_nep_${++checkoutTeller}`;
      nep.checkouts.set(id, { id, klantId: i.klantId, abonnementId: null });
      return { id, url: `https://checkout.nep/${id}` };
    },

    async haalCheckout(id) {
      nep.aanroepen.push({ methode: "haalCheckout", invoer: id });
      const c = nep.checkouts.get(id);
      return c ? { ...c } : null;
    },

    async laatCheckoutVervallen(id) {
      nep.aanroepen.push({ methode: "laatCheckoutVervallen", invoer: id });
      nep.vervallen.add(id);
    },

    async maakPortaal(i) {
      nep.aanroepen.push({ methode: "maakPortaal", invoer: i });
      return { url: `https://portaal.nep/${i.klantId}` };
    },

    async abonnementenVanKlant(klantId) {
      nep.aanroepen.push({ methode: "abonnementenVanKlant", invoer: klantId });
      return (nep.abonnementen.get(klantId) ?? []).map((a) => ({ ...a }));
    },

    async beeindigAbonnement(id) {
      nep.aanroepen.push({ methode: "beeindigAbonnement", invoer: id });
      for (const lijst of nep.abonnementen.values()) {
        const a = lijst.find((x) => x.id === id);
        if (a) {
          a.status = "canceled";
          a.opgezegdOpPeriodeEinde = false;
          return;
        }
      }
      throw new Error(`Abonnement ${id} bestaat niet`);
    },

    async haalFactuur(id) {
      nep.aanroepen.push({ methode: "haalFactuur", invoer: id });
      const f = nep.facturen.get(id);
      return f ? { ...f } : null;
    },

    async factuurPdf(factuur) {
      nep.aanroepen.push({ methode: "factuurPdf", invoer: factuur });
      return new TextEncoder().encode(`%PDF-nep ${factuur.id}`);
    },

    async haalPrijs(id) {
      nep.aanroepen.push({ methode: "haalPrijs", invoer: id });
      if (nep.faalPrijzen) throw new Error("Stripe is niet bereikbaar");
      const p = nep.prijzen.get(id);
      if (!p) throw new Error(`Prijs ${id} bestaat niet`);
      return { ...p };
    },
  };
  return nep;
}
