import { expect, test } from 'vitest';
import { NodeSchema, nieuwDocument, migreer, voegToe } from '../src/index';

test('leiding keeps combined installation and explicit fire classification', () => {
  const r = NodeSchema.safeParse({id:'l',parentId:null,kinderen:[],type:'leiding',kabeltype:'VOB',doorsnede_mm2:1.5,aantalGeleiders:3,brandreactieklasse:'Cca-s1,d2,a1',aanleg:{ligging:'inbouw',inBuis:true}});
  expect(r.success).toBe(true);
});
test.each(['buis','inbouw','opbouw','grond',undefined])('migrates old installation %s without guessing', (plaatsing) => {
  const d=nieuwDocument(); const teller=d.nodes[d.rootId]!.kinderen[0]!;
  const r=voegToe(d,teller,{type:'leiding',kabeltype:'XVB',doorsnede_mm2:2.5,aantalGeleiders:3});
  const old=JSON.parse(JSON.stringify(r.doc));old.schemaVersion=1;if(plaatsing)old.nodes[r.id].plaatsing=plaatsing;
  const node=migreer(old).nodes[r.id]!;
  expect(node).not.toHaveProperty('plaatsing');
  expect(node).toMatchObject({kabeltype:'XVB',doorsnede_mm2:2.5,aantalGeleiders:3});
  expect('aanleg' in node ? node.aanleg : undefined).toEqual(plaatsing===undefined?undefined:plaatsing==='buis'?{inBuis:true}:{ligging:plaatsing,inBuis:false});
  expect(old.nodes[r.id].plaatsing).toBe(plaatsing);
});
test('persists source crop and print options',()=>{
 const old=JSON.parse(JSON.stringify(nieuwDocument()));
 old.situatie.paginas=[{id:'p',titel:'Verdieping',referentie:true,afdruk:{papier:'A3',orientatie:'liggend',schaalmodus:'passend'},plaatsingen:[],achtergrond:{origineelBestandId:'o',rasterBestandId:'r',breedte_px:100,hoogte_px:100,bronUitsnede:{x:0,y:0,breedte:50,hoogte:60,rotatie:90}}}];
 expect(migreer(old).situatie.paginas[0]).toEqual(old.situatie.paginas[0]);
});
