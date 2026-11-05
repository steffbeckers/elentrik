import {expect,test} from 'vitest';
import {nieuwProjectDocument,voegToe,STANDAARD} from '@elentrik/model';
import {invoegBestemmingen,doelBijSelectie} from '../app/editor/invoegen';
test('destination menu excludes the main differential and never guesses from invalid selection',()=>{
 const doc=nieuwProjectDocument({klantNaam:'T',stroomtype:'2x230V'}),bord=Object.values(doc.nodes).find(n=>n.type==='verdeelbord')!,hoofd=Object.values(doc.nodes).find(n=>n.type==='differentieel')!;
 const r=voegToe(doc,bord.id,STANDAARD.differentieel);const doelen=invoegBestemmingen(r.doc);
 expect(doelen.map(d=>d.nodeId)).toEqual([bord.id,r.id]);
 expect(doelBijSelectie(doelen,[hoofd.id])).toBeUndefined();expect(doelBijSelectie(doelen,[bord.id])).toEqual({soort:'nieuw-op-bord',nodeId:bord.id});
});
