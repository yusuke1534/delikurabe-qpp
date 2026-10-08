/**
 * Publicly readable, explicitly permissioned MERCHANT feeds / pages only.
 * The config is server-owned; user requests cannot choose network destinations.
 * Do not point at protected delivery marketplace ordering sites, logged-in pages,
 * or sites whose terms disallow automatic access. No prices are invented.
 */
import fs from 'node:fs/promises';
import {isIP} from 'node:net';

const PROVIDERS = ['direct', 'demae', 'uber', 'rocket'];
const MAX_BYTES = 1_000_000;
const MAX_ITEMS = 120;
const DEFAULT_TTL_MS = 10 * 60 * 1000;
const safeName = value => typeof value === 'string' ? value.trim().slice(0, 150) : '';
function allowedUrl(link, allowedHosts) {
  try {
    const url = new URL(link);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || isIP(url.hostname) ||
        url.hostname === 'localhost' || !Array.isArray(allowedHosts) || !allowedHosts.includes(url.hostname)) return null;
    return url.href;
  } catch { return null; }
}
function yen(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'string' && !/^\d+(?:\.0+)?$/.test(value.trim())) return null;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0 || number > 200000) return null;
  return number;
}
function flattenJsonLd(root) {
  const visited = new WeakSet();
  const entries = [];
  function visit(node, depth = 0) {
    if (!node || typeof node !== 'object' || depth > 24 || visited.has(node)) return;
    visited.add(node);
    if (Array.isArray(node)) { node.forEach(x => visit(x, depth + 1)); return; }
    const rawType = node['@type'];
    const types = Array.isArray(rawType) ? rawType : [rawType];
    if (types.some(t => ['Product', 'MenuItem'].includes(t))) {
      const offers = Array.isArray(node.offers) ? node.offers[0] : node.offers;
      const name = safeName(node.name);
      const price = yen(offers?.price ?? node.price);
      const currency = offers?.priceCurrency ?? node.priceCurrency ?? 'JPY';
      if (name && price !== null && currency === 'JPY') entries.push({name, price});
    }
    for (const [key, val] of Object.entries(node)) {
      if (['@context', 'description', 'image', 'review', 'aggregateRating'].includes(key)) continue;
      if (val && typeof val === 'object') visit(val, depth + 1);
    }
  }
  visit(root);
  return entries;
}
export function extractMenu(body, format, expectedStoreId) {
  let records = [];
  if (format === 'json') {
    let data;
    try { data = JSON.parse(body); } catch { return []; }
    // Require explicit store match so that similar chain branch prices cannot be mixed.
    if (!data || data.storeId !== expectedStoreId || !Array.isArray(data.items)) return [];
    records = data.items.map(x => ({name: safeName(x?.name), price: yen(x?.price), currency: x?.currency || 'JPY'}))
      .filter(x => x.currency === 'JPY');
  } else if (format === 'jsonld') {
    const tags = [...body.matchAll(/<script\b[^>]*type\s*=\s*['"]application\/ld\+json['"][^>]*>([\s\S]*?)<\/script\s*>/gi)].slice(0, 100);
    for (const tag of tags) {
      try { records.push(...flattenJsonLd(JSON.parse(tag[1]))); } catch { /* malformed JSON-LD */ }
    }
  }
  // Dedupe repeated snippets. If a name has conflicting prices, omit it.
  const uniq = new Map();
  const conflict = new Set();
  for (const raw of records) {
    const name = safeName(raw.name);
    const price = yen(raw.price);
    if (!name || price === null) continue;
    const key = name.normalize('NFKC').toLowerCase();
    if (uniq.has(key) && uniq.get(key).price !== price) conflict.add(key);
    else uniq.set(key, {name, price});
  }
  for (const k of conflict) uniq.delete(k);
  return [...uniq.values()].slice(0, MAX_ITEMS);
}
async function getLimitedText(response) {
  const len = Number(response.headers?.get('content-length') || 0);
  if (len > MAX_BYTES) throw new Error('too_large');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('empty_body');
  const chunks = []; let total = 0;
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) { await reader.cancel(); throw new Error('too_large'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total); let offset = 0;
  for (const part of chunks) { bytes.set(part, offset); offset += part.byteLength; }
  return new TextDecoder('utf-8', {fatal: false}).decode(bytes);
}
export function createPublicPriceService({sources = [], fetchImpl = fetch, ttlMs = DEFAULT_TTL_MS} = {}) {
  const registry = new Map();
  const cache = new Map();
  for (const s of sources) {
    if (!s || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,80}$/.test(s.storeId) || !PROVIDERS.includes(s.provider) ||
        !['json', 'jsonld'].includes(s.format) || s.authorized !== true || !s.authorizationNote ||
        !allowedUrl(s.url, s.allowedHosts)) continue;
    const k = `${s.storeId}:${s.provider}`;
    if (!registry.has(k)) registry.set(k, {...s, url: allowedUrl(s.url, s.allowedHosts)});
  }
  async function load(s, force = false) {
    const key = `${s.storeId}:${s.provider}`;
    const found = cache.get(key);
    if (!force && found && Date.now() - found.when < ttlMs) return {...found.result, cache: true};
    try {
      const response = await fetchImpl(s.url, {redirect:'error', signal: AbortSignal.timeout(9000), headers:{Accept: s.format==='json' ? 'application/json' : 'text/html'}});
      if (!response.ok) throw new Error('upstream_error');
      const ct = response.headers.get('content-type') || '';
      if (s.format === 'json' && !ct.includes('json') || s.format === 'jsonld' && !ct.includes('html')) throw new Error('unsupported_type');
      const body = await getLimitedText(response);
      const items = extractMenu(body, s.format, s.storeId);
      const result = {provider:s.provider, status:items.length?'available':'no_prices', items, sourceUrl:s.url,
        sourceType:s.format==='json'?'merchant_authorized_feed':'merchant_public_menu', checkedAt:new Date().toISOString(),
        note:'公開メニューに掲示された商品価格。配達先別手数料・割引・注文可否は未確認'};
      cache.set(key, {when:Date.now(), result});
      return {...result, cache: false};
    } catch { return {provider:s.provider, status:'source_error', items:[]}; }
  }
  async function getPrices(storeId, {refresh=false, item=''}={}) {
    if (typeof storeId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,80}$/.test(storeId)) return null;
    const statuses = await Promise.all(PROVIDERS.map(async provider => {
      const src = registry.get(`${storeId}:${provider}`);
      if (!src) return {provider, status:'no_source', items:[]};
      const res = await load(src, refresh);
      if (!item || !Array.isArray(res.items)) return res;
      const needle = item.normalize('NFKC').toLocaleLowerCase('ja').trim();
      return {...res, items:res.items.filter(x=>x.name.normalize('NFKC').toLocaleLowerCase('ja').includes(needle))};
    }));
    return {storeId, sourcesConfigured:statuses.filter(x=>x.status!=='no_source').length, providers:statuses,
      note:'公開価格であり、注文確定時の支払総額ではありません。表示時刻はページ取得時刻です。'};
  }
  return {getPrices};
}
export async function loadSourceConfig(configUrl = new URL('./public-price-sources.json', import.meta.url)) {
  const data = JSON.parse(await fs.readFile(configUrl, 'utf8'));
  return Array.isArray(data.sources) ? data.sources : [];
}
