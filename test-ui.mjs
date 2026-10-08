import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const page=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const js=page.match(/<script>([\s\S]*?)<\/script>/)[1];
const inject=js.replace('render();\n})();',`{
const s=findStore('seed-fujinomiya-01');
if(!s || !s.name.includes('ドミノ'))throw Error('seed 14 stores missing');
if(!renderPublicPrice(s).includes('公開されているメニュー価格'))throw Error('public price UI missing');
const all=PROVIDERS.map(p=>({provider:p.id,status:'no_source',items:[]}));
publicResult={storeId:s.id,providers:all};
if(!renderPublicResults(s).includes('情報源未登録'))throw Error('disconnected state not shown');
const quote={provider:'direct',status:'available',items:[{name:'ピザ',price:1500}],sourceType:'merchant_authorized_feed',sourceUrl:'https://merchant.example/menu.json',checkedAt:new Date().toISOString()};
if(!validPublicPrices(quote,'direct'))throw Error('valid price rejected');
if(validPublicPrices({...quote,items:[{name:'ピザ',price:-1}]},'direct'))throw Error('invalid price accepted');
if(validPublicPrices({...quote,checkedAt:'2024-01-01T00:00:00Z'},'direct'))throw Error('stale public price accepted');
if(validPublicPrices({...quote,sourceType:'scrape'},'direct'))throw Error('unapproved source accepted');
}
render();\n})();`);
assert.notEqual(inject,js);
const store=new Map();const app={innerHTML:''};
const document={getElementById:id=>id==='app'?app:null,querySelectorAll:()=>[],addEventListener:()=>{}};
vm.runInNewContext(inject,{document,localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)},window:{},console,URL,Date,Intl,setTimeout(){},Math}, {timeout:4000});
assert.equal(JSON.parse(store.get('delikurabe_v1')).length,14);
assert.match(app.innerHTML,/ドミノ・ピザ 富士宮店/);
assert.match(page,/ロケットナウ/);
console.log('PASS: 14 stores retained, price tab rendered, provider statuses, stale and invalid quotes rejected');
