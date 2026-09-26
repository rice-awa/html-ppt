import test from 'node:test';
import assert from 'node:assert/strict';
import { selectWorks, readFilters, filterParams } from '../site/filters.js';
const works=[{id:'1',title:'Campus',description:'三维校园',categoryId:'experiments',category:'交互实验',route:'/campus',tags:['3D','空间']},{id:'2',title:'AI deck',description:'讲解',categoryId:'presentations',category:'演示文稿',route:'/ai',tags:['AI']},{id:'3',title:'Game',description:'game',categoryId:'games',category:'游戏',route:'/game',tags:['3D']}];
const base={q:'',category:'all',tags:[],sort:'curated',list:false};
test('search, type and tags compose with AND semantics',()=>{
 assert.deepEqual(selectWorks(works,{...base,q:'校园',tags:['3D','空间'],category:'experiments'}).map(w=>w.id),['1']);
 assert.equal(selectWorks(works,{...base,tags:['3D','AI']}).length,0);
 assert.deepEqual(selectWorks(works,{...base,q:'ＡＩ'}).map(w=>w.id),['2']);
});
test('sorting does not mutate collection ordering',()=>{const order=works.map(w=>w.id);selectWorks(works,{...base,sort:'name'});assert.deepEqual(works.map(w=>w.id),order)});
test('URL state roundtrips Unicode tags and rejects unknown filter values',()=>{
 const categories=[{id:'experiments'}],tags=['3D','空间'];const state={...base,q:'校园 & 3D',category:'experiments',tags,sort:'name',list:true};
 assert.deepEqual(readFilters(filterParams(state).toString(),categories,tags),state);
 assert.deepEqual(readFilters('?category=wrong&sort=wrong&tag=unknown&tag=3D&tag=3D',categories,tags),{...base,tags:['3D']});
});
