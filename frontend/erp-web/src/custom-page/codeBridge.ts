/**
 * Kod bileşeni köprüsü: yalıtılmış (`sandbox="allow-scripts"`, opak köken) iframe ile sayfa arasında postMessage protokolü.
 * Bu modül saftır: istek ayrıştırma/doğrulama, istek işleme, hız sınırı ve iframe belgesi. Çerçeve kaynağı (event.source)
 * denetimi ve yanıt gönderimi CodeFrame'dedir. Çerçeveye hiçbir zaman belirteç ya da başka bileşenin kodu gönderilmez.
 */
export const BRIDGE_VERSION = 1;

export type BridgeEvent = "load" | "select" | "beforeSave" | "afterSave";
export type BridgeRequest =
  | { nx: 1; id: number; type: "get"; path: string }
  | { nx: 1; id: number; type: "setInput"; name: string; value: string | number | boolean | null }
  | { nx: 1; id: number; type: "runQuery"; name: string }
  | { nx: 1; id: number; type: "callOperation"; name: string; values: Record<string, unknown> }
  | { nx: 1; id: number; type: "on"; event: BridgeEvent }
  | { nx: 1; id: number; type: "setHeight"; px: number };

export type BridgeHost = {
  get(path: string): unknown;
  setInput(name: string, value: string | number | boolean | null): void;
  runQuery(name: string): Promise<unknown>;
  callOperation(name: string, values: Record<string, unknown>): Promise<unknown>;
  subscribe(event: string): void;
  setHeight(px: number): void;
};

export const MAX_REQUEST_CHARS = 65536;
export const MAX_FRAME_HEIGHT = 2000;
export const MAX_IN_FLIGHT = 4;
export const MAX_PER_MINUTE = 120;
export const RATE_WINDOW_MS = 60_000;
export const BRIDGE_EVENTS: readonly BridgeEvent[] = ["load", "select", "beforeSave", "afterSave"];
const MAX_NAME_CHARS = 512;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isName = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= MAX_NAME_CHARS;
const isInputValue = (value: unknown): value is string | number | boolean | null =>
  value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));

/**
 * Çerçeveden gelen iletiyi doğrular. `null`: bizim iletimiz değil (yok sayılır). `{ error, id? }`: reddedilir; kimlik
 * varsa çerçeveye hata yanıtı gider. Hiçbir girdi için fırlatmaz.
 */
export function parseBridgeRequest(data: unknown): BridgeRequest | { error: string; id?: number } | null {
  if (!isRecord(data) || data.nx !== 1) return null;
  const id = typeof data.id === "number" && Number.isSafeInteger(data.id) ? data.id : undefined;
  const fail = (error: string) => (id === undefined ? { error } : { error, id });
  let size: number;
  try { size = JSON.stringify(data)?.length ?? 0; } catch { return fail("Geçersiz istek."); }
  if (size > MAX_REQUEST_CHARS) return fail("İstek çok büyük.");
  if (id === undefined) return fail("Geçersiz istek.");
  const type = data.type;
  const invalid = () => fail(`Geçersiz istek: ${String(type)}`);
  switch (type) {
    case "get": return isName(data.path) ? { nx: 1, id, type, path: data.path } : invalid();
    case "setInput": return isName(data.name) && isInputValue(data.value) ? { nx: 1, id, type, name: data.name, value: data.value } : invalid();
    case "runQuery": return isName(data.name) ? { nx: 1, id, type, name: data.name } : invalid();
    case "callOperation": {
      const values = data.values === undefined ? {} : data.values;
      return isName(data.name) && isRecord(values) ? { nx: 1, id, type, name: data.name, values } : invalid();
    }
    case "on": return BRIDGE_EVENTS.includes(data.event as BridgeEvent) ? { nx: 1, id, type, event: data.event as BridgeEvent } : invalid();
    case "setHeight": return typeof data.px === "number" && Number.isFinite(data.px) ? { nx: 1, id, type, px: data.px } : invalid();
    default: return fail(`Bilinmeyen istek: ${String(type).slice(0, 64)}`);
  }
}

/** Yanıt değeri JSON gidiş-dönüşüyle klonlanır (işlev, döngü ve sınıf örnekleri çerçeveye geçmez); tanımsız → null. */
const cloneResult = (value: unknown): unknown => {
  if (value === undefined) return null;
  const text = JSON.stringify(value);
  return text === undefined ? null : JSON.parse(text);
};

export async function handleBridgeRequest(request: BridgeRequest, host: BridgeHost): Promise<{ ok: true; result: unknown } | { ok: false; error: string }> {
  try {
    let result: unknown;
    switch (request.type) {
      case "get": result = host.get(request.path); break;
      case "setInput": host.setInput(request.name, request.value); result = true; break;
      case "runQuery": result = await host.runQuery(request.name); break;
      case "callOperation": result = await host.callOperation(request.name, request.values); break;
      case "on": host.subscribe(request.event); result = true; break;
      case "setHeight": host.setHeight(Math.round(Math.max(0, Math.min(MAX_FRAME_HEIGHT, request.px)))); result = true; break;
    }
    return { ok: true, result: cloneResult(result) };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : typeof cause === "string" ? cause : "";
    return { ok: false, error: message || "İstek tamamlanamadı." };
  }
}

/** Çerçeve başına hız sınırı: aynı anda en çok 4 çağrı, kayan 60 sn'de en çok 120 çağrı. */
export function createRateLimiter(now: () => number): { tryAcquire(): boolean; release(): void } {
  let inFlight = 0;
  const started: number[] = [];
  return {
    tryAcquire() {
      const current = now();
      while (started.length > 0 && started[0] <= current - RATE_WINDOW_MS) started.shift();
      if (inFlight >= MAX_IN_FLIGHT || started.length >= MAX_PER_MINUTE) return false;
      inFlight += 1;
      started.push(current);
      return true;
    },
    release() { inFlight = Math.max(0, inFlight - 1); },
  };
}

/**
 * Çerçeve içinde kullanıcı kodundan önce çalışan `window.nexora` API'si. Yalnız `window.parent` kaynaklı iletileri
 * işler. İçeriği `</script` barındırmamalıdır (ayrı <script> içinde gömülür).
 */
export const bridgeScript = `(function(){
"use strict";
var host=window.parent,nextId=1,pending={},handlers={load:[],select:[],beforeSave:[],afterSave:[]},subscribed={};
function call(type,args){return new Promise(function(resolve,reject){var id=nextId++;pending[id]={resolve:resolve,reject:reject};var message={nx:1,id:id,type:type};for(var key in args){if(Object.prototype.hasOwnProperty.call(args,key))message[key]=args[key];}try{host.postMessage(message,"*");}catch(cause){delete pending[id];reject(new Error("İstek gönderilemedi."));}});}
function cancelOf(value){if(value===false)return{cancel:true,message:"Kod bileşeni işlemi iptal etti."};if(value&&typeof value==="object"&&value.cancel===true)return{cancel:true,message:typeof value.message==="string"&&value.message?value.message:"Kod bileşeni işlemi iptal etti."};return null;}
function answerBeforeSave(ask,payload){var list=handlers.beforeSave.slice();Promise.all(list.map(function(handler){try{return Promise.resolve(handler(payload)).then(cancelOf,function(cause){return{cancel:true,message:cause&&cause.message?String(cause.message):"Kod bileşeni hata verdi."};});}catch(cause){return Promise.resolve({cancel:true,message:cause&&cause.message?String(cause.message):"Kod bileşeni hata verdi."});}})).then(function(results){var first=null;for(var i=0;i<results.length;i++){if(results[i]){first=results[i];break;}}var answer=first?{nx:1,answer:ask,cancel:true,message:first.message}:{nx:1,answer:ask,cancel:false};try{host.postMessage(answer,"*");}catch(ignore){}});}
window.addEventListener("message",function(event){if(event.source!==host)return;var data=event.data;if(!data||typeof data!=="object"||data.nx!==1)return;
if(typeof data.replyTo==="number"){var entry=pending[data.replyTo];if(!entry)return;delete pending[data.replyTo];if(data.ok===true)entry.resolve(data.result);else entry.reject(new Error(typeof data.error==="string"?data.error:"İstek başarısız."));return;}
if(data.event==="beforeSave"&&typeof data.ask==="number"){answerBeforeSave(data.ask,data.payload);return;}
var list=typeof data.event==="string"&&Object.prototype.hasOwnProperty.call(handlers,data.event)?handlers[data.event].slice():[];for(var i=0;i<list.length;i++){try{list[i](data.payload);}catch(cause){setTimeout(function(){throw cause;});}}});
window.nexora=Object.freeze({version:1,
get:function(path){return call("get",{path:path});},
setInput:function(name,value){return call("setInput",{name:name,value:value});},
runQuery:function(name){return call("runQuery",{name:name});},
callOperation:function(name,values){return call("callOperation",{name:name,values:values===undefined?{}:values});},
setHeight:function(px){return call("setHeight",{px:px});},
on:function(event,handler){if(!Object.prototype.hasOwnProperty.call(handlers,event))throw new Error("Bilinmeyen olay: "+event);if(typeof handler!=="function")throw new Error("İşleyici bir işlev olmalı.");handlers[event].push(handler);if(!subscribed[event]){subscribed[event]=true;call("on",{event:event}).catch(function(){subscribed[event]=false;});}}});
})();`;

const CODE_FRAME_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; form-action 'none';";

/** Yalıtılmış kod bileşeni belgesi: CSP değişmedi; köprü betiği kullanıcı kodundan önce, ayrı bir betikte çalışır. */
export function isolatedCodeDocument(css: string, javascript: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${CODE_FRAME_CSP}"><style>html,body{margin:0;padding:12px;font:14px system-ui,sans-serif;color:#172554;min-height:24px;box-sizing:border-box}*{box-sizing:border-box}${css.replace(/<\/style/gi, "<\\/style")}</style></head><body><div id="nexora-root">Özel kod bileşeni</div><script>${bridgeScript}</script><script>${javascript.replace(/<\/script/gi, "<\\/script")}</script></body></html>`;
}
