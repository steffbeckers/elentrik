import { DocumentFout } from "@elentrik/model";

/**
 * Voert een editoractie uit en maakt van een `DocumentFout` een toastmelding. Andere fouten gaan
 * gewoon door. Geeft `true` als de actie lukte.
 */
export function useDocumentFoutMelding() {
  const { t, te } = useI18n();
  const toast = useToast();

  return function voerUit(actie: () => void): boolean {
    try {
      actie();
      return true;
    } catch (fout) {
      if (!(fout instanceof DocumentFout)) throw fout;
      const sleutel = `editor.fouten.${fout.code}`;
      toast.add({ title: te(sleutel) ? t(sleutel) : t("editor.fouten.andere"), color: "error" });
      return false;
    }
  };
}
