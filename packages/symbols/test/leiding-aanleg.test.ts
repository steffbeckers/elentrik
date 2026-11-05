import {expect,test} from 'vitest';
import {tekenLeiding} from '../src/leiding';
const basis={id:'l',parentId:null,kinderen:[],type:'leiding' as const,kabeltype:'VOB',doorsnede_mm2:1.5,aantalGeleiders:3};
test('combined in-wall conduit retains both independent marks; unknown remains plain',()=>{
 const onbekend=tekenLeiding(basis);const buis=tekenLeiding({...basis,aanleg:{inBuis:true}});const wand=tekenLeiding({...basis,aanleg:{ligging:'inbouw',inBuis:false}});const beide=tekenLeiding({...basis,aanleg:{ligging:'inbouw',inBuis:true}});
 expect(onbekend.svg).not.toContain('<circle');expect(buis.svg).toContain('<circle');expect(beide.svg).toContain('<circle');expect(wand.svg).not.toContain('<circle');
 expect(beide.svg.length).toBeGreaterThan(buis.svg.length);expect(wand.svg.length).toBeGreaterThan(onbekend.svg.length);
 expect(tekenLeiding({...basis,aanleg:{ligging:'opbouw',inBuis:false}}).svg).not.toEqual(wand.svg);
});
