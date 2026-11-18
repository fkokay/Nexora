// Studio kod köprüsü: ERP'deki window.nexora köprüsüyle aynı protokol (sürüm 1), tasarımcı için salt okunur
// bir taklit ana sayfa ile. Ana sayfa iframe'e "*" hedefiyle yazar (yalıtılmış çerçevenin kökeni opaktır);
// bu yüzden çerçeveye hiçbir zaman belirteç ya da başka bileşenin kodu gönderilmez.

export const BRIDGE_VERSION = 1;
export const READ_ONLY_PREVIEW = "Tasarımcıda yalnız okuma önizlenir.";
export const RATE_LIMITED = "Çok fazla istek; biraz bekleyin.";
export const MAX_JAVASCRIPT_LENGTH = 20000;
/** Kayan 60 sn'de en çok 120 istek (setHeight/on muaf; ERP ile aynı). Taklit yanıtlar eşzamanlıdır: uçuşta sınırı gerekmez. */
export const MAX_PER_MINUTE = 120;
export const RATE_WINDOW_MS = 60_000;
const MAX_PAYLOAD_CHARS = 64 * 1024;
const MAX_NAME_CHARS = 512;
const EVENTS = new Set(["load", "select", "beforeSave", "afterSave"]);
/** ERP `isName` ile aynı: boş olmayan, kırpılmayan, en çok 512 karakter metin. */
const isName = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= MAX_NAME_CHARS;

/** Belge başına köprü anahtarı: 16 rastgele bayt, onaltılık (32 karakter). ERP createBridgeNonce ile aynı. */
export function createBridgeNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
const NONCE_PATTERN = /^[0-9a-f]{32}$/;

/**
 * Çerçeveye eklenen köprü betiği; kullanıcı betiğinden önce çalışır. ERP tarafındaki köprüyle aynı API ve anlam:
 * get, setInput, runQuery, callOperation, setHeight (Promise döner) ve on(olay, işleyici) — on bilinmeyen olay ya da
 * işlev olmayan işleyicide eşzamanlı fırlatır, her olay için ana sayfaya yalnız bir kez abone olur. Yalnız
 * `window.parent` kaynaklı ve belge anahtarını (`k`) taşıyan iletileri işler; her isteğe ve yanıta `k` ekler.
 */
export function bridgeScript(nonce: string): string {
  if (!NONCE_PATTERN.test(nonce)) throw new Error("Geçersiz köprü anahtarı.");
  return `(function(){
"use strict";
var host=window.parent,key="${nonce}",seq=0,pending={},handlers={load:[],select:[],beforeSave:[],afterSave:[]},subscribed={};
try{var self=typeof document!=="undefined"&&document.currentScript;if(self&&self.parentNode)self.parentNode.removeChild(self);}catch(ignore){}
function known(event){return typeof event==="string"&&Object.prototype.hasOwnProperty.call(handlers,event);}
function call(type,args){return new Promise(function(resolve,reject){var id=++seq;pending[id]={resolve:resolve,reject:reject};var message={nx:1,k:key,id:id,type:type};for(var name in args){if(Object.prototype.hasOwnProperty.call(args,name))message[name]=args[name];}try{host.postMessage(message,"*");}catch(error){delete pending[id];reject(new Error("İstek gönderilemedi."));}});}
function answer(ask,cancel,message){var reply={nx:1,k:key,answer:ask,cancel:cancel};if(typeof message==="string"&&message)reply.message=message;try{host.postMessage(reply,"*");}catch(ignore){}}
window.addEventListener("message",function(event){
if(event.source!==host)return;var data=event.data;if(!data||typeof data!=="object"||data.nx!==1||data.k!==key)return;
if(typeof data.replyTo==="number"){var entry=pending[data.replyTo];if(!entry)return;delete pending[data.replyTo];if(data.ok===true)entry.resolve(data.result);else entry.reject(new Error(typeof data.error==="string"?data.error:"İstek başarısız."));return;}
if(!known(data.event))return;var list=handlers[data.event].slice();
if(data.event==="beforeSave"){if(typeof data.ask!=="number")return;var ask=data.ask;
Promise.all(list.map(function(handler){return Promise.resolve().then(function(){return handler(data.payload);});})).then(function(results){
for(var i=0;i<results.length;i++){var result=results[i];if(result===false){answer(ask,true);return;}if(result&&typeof result==="object"&&result.cancel===true){answer(ask,true,typeof result.message==="string"?result.message:undefined);return;}}answer(ask,false);
},function(error){answer(ask,true,error&&typeof error.message==="string"?error.message:undefined);});return;}
list.forEach(function(handler){try{handler(data.payload);}catch(error){setTimeout(function(){throw error;});}});
});
window.nexora=Object.freeze({
version:${BRIDGE_VERSION},
get:function(path){return call("get",{path:path});},
setInput:function(name,value){return call("setInput",{name:name,value:value});},
runQuery:function(name){return call("runQuery",{name:name});},
callOperation:function(name,values){return call("callOperation",{name:name,values:values===undefined?{}:values});},
setHeight:function(px){return call("setHeight",{px:px});},
on:function(event,handler){if(!known(event))throw new Error("Bilinmeyen olay: "+event);if(typeof handler!=="function")throw new Error("İşleyici bir işlev olmalı.");handlers[event].push(handler);if(!subscribed[event]){subscribed[event]=true;call("on",{event:event}).catch(function(){subscribed[event]=false;});}}
});
})();`;
}

/** Taklit ana sayfanın veri kaynağı: tuval önizleme kapsamı ve sorgu önizleme satırları. */
export type StubHostData = {
  get: (path: string) => unknown;
  /** Sayfa sorgusu: okuma önizlemesi, yazma sorgusu ya da bilinmeyen. */
  query: (name: string) => { kind: "read"; rows: Record<string, unknown>[]; rowCount: number } | { kind: "write" } | { kind: "noPreview" } | { kind: "unknown" };
  /** Katalog işlemi: okuma/yazma; bilinmiyorsa undefined. */
  operation: (name: string) => "read" | "write" | undefined;
};

export type Reply = { ok: true; result: unknown } | { ok: false; error: string };
export const fail = (error: string): Reply => ({ ok: false, error });
const clone = (value: unknown): unknown => {
  if (value === undefined) return null;
  try { return JSON.parse(JSON.stringify(value)) ?? null; } catch { return null; }
};

/** Çerçeveden gelen tek bir isteği taklit ana sayfa kurallarıyla yanıtlar; hiçbir girdi için fırlatmaz. */
export function answerStubRequest(data: Record<string, unknown>, host: StubHostData, setHeight: (px: number) => void): { reply: Reply } {
  let size = 0;
  try { size = JSON.stringify(data).length; } catch { return { reply: fail("İstek okunamadı.") }; }
  if (size > MAX_PAYLOAD_CHARS) return { reply: fail("İstek çok büyük (en fazla 64 KB).") };
  switch (data.type) {
    case "get": {
      if (!isName(data.path)) return { reply: fail("Yol metin olmalı.") };
      return { reply: { ok: true, result: clone(host.get(data.path)) } };
    }
    case "setInput":
      if (!isName(data.name)) return { reply: fail("Giriş adı metin olmalı.") };
      return { reply: fail(READ_ONLY_PREVIEW) };
    case "runQuery": {
      if (!isName(data.name)) return { reply: fail("Sorgu adı metin olmalı.") };
      const query = host.query(data.name);
      if (query.kind === "write") return { reply: fail(READ_ONLY_PREVIEW) };
      if (query.kind === "unknown") return { reply: fail(`Sayfada "${data.name.slice(0, 64)}" adlı sorgu yok.`) };
      if (query.kind === "noPreview") return { reply: fail("Bu sorgunun önizlemesi yok; Sorgular panelinden çalıştırın.") };
      return { reply: { ok: true, result: clone({ rows: query.rows, rowCount: query.rowCount }) } };
    }
    case "callOperation": {
      if (!isName(data.name)) return { reply: fail("İşlem adı metin olmalı.") };
      if (data.values !== undefined && (data.values === null || typeof data.values !== "object" || Array.isArray(data.values))) return { reply: fail("İşlem değerleri nesne olmalı.") };
      const kind = host.operation(data.name);
      if (kind === "write") return { reply: fail(READ_ONLY_PREVIEW) };
      if (kind === undefined) return { reply: fail(`"${data.name.slice(0, 64)}" adlı ERP işlemi bulunamadı.`) };
      return { reply: fail("ERP işlemleri tasarımcıda çağrılmaz; ERP önizlemesinde deneyin.") };
    }
    case "on": {
      if (typeof data.event !== "string" || !EVENTS.has(data.event)) return { reply: fail("Bilinmeyen olay.") };
      return { reply: { ok: true, result: true } };
    }
    case "setHeight": {
      const px = typeof data.px === "number" && Number.isFinite(data.px) ? Math.max(0, Math.min(2000, Math.round(data.px))) : null;
      if (px === null) return { reply: fail("Yükseklik sayı olmalı.") };
      setHeight(px);
      return { reply: { ok: true, result: true } };
    }
    default:
      return { reply: fail("Bilinmeyen istek türü.") };
  }
}

const CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; form-action 'none';";
/** Yalıtılmış kod önizlemesi belgesi: CSP değişmez; köprü betiği (belge anahtarıyla) kullanıcı betiğinden önce gelir. */
export const codePreviewDocument = (css: string, javascript: string, nonce: string) => `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${CSP}"><style>html,body{margin:0;padding:12px;font:14px system-ui,sans-serif;color:#172554}*{box-sizing:border-box}${css.replace(/<\/style/gi, "<\\/style")}</style></head><body><div id="nexora-root">Özel kod bileşeni</div><script>${bridgeScript(nonce)}</script><script>${javascript.replace(/<\/script/gi, "<\\/script")}</script></body></html>`;

