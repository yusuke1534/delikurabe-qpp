import assert from 'node:assert/strict';
import {extractMenu, createPublicPriceService} from '../api/public-menu.mjs';

const id='seed-fujinomiya-01';
const good = JSON.stringify({storeId:id,items:[
  {name:'マルゲリータ Mサイズ',price:1900,currency:'JPY'},
  {name:'ポテト',price:350,currency:'JPY'},
  {name:'ダメな価格',price:null,currency:'JPY'},
  {name:'欠損',currency:'JPY'},
  {name:'ドル価格',price:5,currency:'USD'}
]});
assert.deepEqual(extractMenu(good,'json',id),[
  {name:'マルゲリータ Mサイズ',price:1900},{name:'ポテト',price:350}
]);
assert.deepEqual(extractMenu(good,'json','seed-fujinomiya-02'),[]);
assert.deepEqual(extractMenu('{bad','json',id),[]);
assert.deepEqual(extractMenu(JSON.stringify({storeId:id,items:[{name:'同じ商品',price:100},{name:'同じ商品',price:250}]}),'json',id),[]);
const html=`<html><script type="application/ld+json">${JSON.stringify({'@context':'https://schema.org','@graph':[
  {'@type':'Restaurant',name:'参考店舗',hasMenuSection:{'@type':'MenuSection',hasMenuItem:{'@type':'MenuItem',name:'カレー',offers:{'@type':'Offer',price:'750',priceCurrency:'JPY'}}}},
  {'@type':'Product',name:'ラーメン',offers:{'@type':'Offer',price:'850',priceCurrency:'JPY'}}
]})}</script></html>`;
assert.deepEqual(extractMenu(html,'jsonld',id),[{name:'カレー',price:750},{name:'ラーメン',price:850}]);
console.log('PASS: feed and merchant JSON-LD parsing, missing price & wrong store are not mistaken for zero yen');
let calls=0;
const fetchImpl=async (url,opts)=>{
  calls++;
  assert.equal(url,'https://merchant.example/menu.json');
  assert.equal(opts.redirect,'error');
  return new Response(good,{status:200,headers:{'content-type':'application/json'}});
};
const sources=[
 {storeId:id, provider:'direct',authorized:true,authorizationNote:'承諾を得た店舗専用フィード',format:'json',url:'https://merchant.example/menu.json',allowedHosts:['merchant.example']},
 {storeId:id, provider:'rocket',authorized:true,authorizationNote:'invalid hostname',format:'json',url:'https://127.0.0.1/private',allowedHosts:['127.0.0.1']},
 {storeId:id, provider:'uber',authorized:false,authorizationNote:'not authorized',format:'json',url:'https://merchant.example/menu.json',allowedHosts:['merchant.example']},
];
const service=createPublicPriceService({sources,fetchImpl,ttlMs:60000});
const first=await service.getPrices(id);
assert.equal(first.providers.length,4);
assert.equal(first.sourcesConfigured,1);
assert.equal(first.providers[0].status,'available');
assert.equal(first.providers[0].items.length,2);
assert.equal(first.providers[1].status,'no_source');
assert.equal(first.providers[2].status,'no_source');
assert.equal(first.providers[3].status,'no_source');
assert.equal(calls,1);
const second=await service.getPrices(id,{item:'ポテト'});
assert.equal(second.providers[0].cache,true);
assert.deepEqual(second.providers[0].items,[{name:'ポテト',price:350}]);
assert.equal(calls,1);
await service.getPrices(id,{refresh:true});
assert.equal(calls,2);
assert.equal(await service.getPrices('../../../etc/passwd'),null);
console.log('PASS: authorized hosts, permission gating, 4 providers, search, cache and refresh');
const disconnected=createPublicPriceService({sources:[],fetchImpl});
const empty=await disconnected.getPrices(id);
assert.equal(empty.sourcesConfigured,0);
assert.ok(empty.providers.every(x=>x.status==='no_source'));
assert.equal(calls,2);
console.log('PASS: without permissions and configured sources, zero prices are fetched or invented');
