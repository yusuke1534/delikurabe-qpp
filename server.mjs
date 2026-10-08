import http from 'node:http';
import { getAuthorizedQuote } from './quote-adapters.mjs';
const PORT = Number(process.env.PORT || 8787);
const ORIGIN = process.env.PUBLIC_APP_ORIGIN || ''; // e.g. https://yusuke1534.github.io
const PROVIDERS = new Set(['direct','demae','uber','rocket']);
function send(res,code,obj){res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',... (ORIGIN?{'Access-Control-Allow-Origin':ORIGIN,'Vary':'Origin'}:{})});res.end(JSON.stringify(obj));}
http.createServer(async (req,res)=>{
  if(req.url!=='/api/quotes'){return send(res,404,{error:'Not found'})}
  if(ORIGIN && req.headers.origin && req.headers.origin!==ORIGIN)return send(res,403,{error:'Origin not allowed'});
  if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Vary':'Origin'});return res.end()}
  if(req.method!=='POST')return send(res,405,{error:'Use POST'});
  let raw='';for await (const chunk of req){raw+=chunk;if(raw.length>10000)return send(res,413,{error:'Too large'})}
  let body;try{body=JSON.parse(raw)}catch{return send(res,400,{error:'Invalid JSON'})}
  const valid=body&&typeof body.storeId==='string'&&body.storeId.length<200&&
    typeof body.storeName==='string'&&body.storeName.length<200&&
    typeof body.deliveryAddress==='string'&&body.deliveryAddress.trim().length>0&&body.deliveryAddress.length<=220&&
    Array.isArray(body.items)&&body.items.length>0&&body.items.length<=20&&body.items.every(x=>typeof x.name==='string'&&x.name.length>0&&x.name.length<140&&Number.isSafeInteger(x.quantity)&&x.quantity>=1&&x.quantity<=20)&&
    Array.isArray(body.providers)&&body.providers.length<=4&&body.providers.every(x=>PROVIDERS.has(x));
  if(!valid)return send(res,400,{error:'Invalid quote request'});
  const quotes=[];
  for(const provider of new Set(body.providers)){
    try{const answer=await getAuthorizedQuote(provider,body);quotes.push(answer&&answer.provider===provider?answer:{provider,status:'not_connected'});}
    catch{quotes.push({provider,status:'error'});}
  }
  return send(res,200,{quotes});
}).listen(PORT,()=>console.log(`Quote adapter listening on ${PORT}. No provider adapters configured.`));
