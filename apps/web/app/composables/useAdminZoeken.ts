import { ref, shallowRef } from "vue";
import type { AdminZoekresultaten } from "../../shared/admin/zoeken";
export function maakAdminZoeken(haal: (zoek: string) => Promise<AdminZoekresultaten>, gebruikerId: string) {
  const resultaat = shallowRef<AdminZoekresultaten | null>(null);
  const fout = shallowRef<unknown>(null);
  const bezig = ref(false);
  let generatie = 0;
  let huidigeGebruiker: string | null = gebruikerId;
  function wis() { generatie++; resultaat.value = null; fout.value = null; bezig.value = false; }
  return {
    resultaat, fout, bezig, wis,
    gebruikerGewijzigd(id: string | null) { huidigeGebruiker = id; wis(); },
    async zoek(invoer: string) {
      wis();
      const tekst = invoer.trim();
      if (huidigeGebruiker !== gebruikerId || tekst.length < 2 || tekst.length > 200) return;
      const nu = generatie;
      bezig.value = true;
      try { const r = await haal(tekst); if (nu === generatie) resultaat.value = r; }
      catch (error) { if (nu === generatie) fout.value = error; }
      finally { if (nu === generatie) bezig.value = false; }
    },
  };
}
