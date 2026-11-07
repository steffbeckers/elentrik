import {expect,test} from 'vitest';
import {migreer,nieuwDocument} from '../src/index';
test('stores calibrated print denominator',()=>{const doc=JSON.parse(JSON.stringify(nieuwDocument()));doc.situatie.paginas=[{id:'p',titel:'p',plaatsingen:[],afdruk:{papier:'A3',orientatie:'liggend',schaalmodus:'gekalibreerd',schaalNoemer:100}}];expect(migreer(doc).situatie.paginas[0]!.afdruk).toHaveProperty('schaalNoemer',100);});
