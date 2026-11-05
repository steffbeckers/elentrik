import {expect,test} from 'vitest';
import {leidingLabel,beveiligingLabel} from '../src/labels';
test('prints supplied fire class exactly once',()=>expect(leidingLabel({id:'l',parentId:null,kinderen:[],type:'leiding',kabeltype:'XVB',doorsnede_mm2:2.5,aantalGeleiders:3,brandreactieklasse:'Cca'})).toBe('XVB 3G2,5 Cca'));
test('differential reference remains distinct from description',()=>expect(beveiligingLabel({id:'f',parentId:null,kinderen:[],type:'differentieel',nominaal_A:40,gevoeligheid_mA:30,polen:2,klasse:'A',referentie:'F',label:'Wasmachine'})).toBe('F · 40/0,03A type A 2P'));
