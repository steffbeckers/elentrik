import type { NodeId } from "@elentrik/model";
import { nodeLabel, type LabelTerugval } from "~/situatie/items";
import { useEditorStore } from "~/stores/editor";

/**
 * De ene plek voor de vertaalde labeltekst van een node: het label uit het document, of het type
 * als hij er geen heeft (een punt zonder kring, een naamloos bord). Voor het plan, "Te plaatsen"
 * en meldingen.
 */
export function useNodeTekst() {
  const { t } = useI18n();
  const editor = useEditorStore();

  const terugval: LabelTerugval = (type) => t(`editor.types.${type}`);

  function nodeTekst(nodeId: NodeId): string {
    const doc = editor.document;
    const analyse = editor.analyse;
    return doc && analyse ? nodeLabel(doc, analyse, nodeId, terugval) : "";
  }

  return { terugval, nodeTekst };
}
