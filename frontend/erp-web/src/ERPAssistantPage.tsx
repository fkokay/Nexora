import React, { useState } from 'react'
import { Send, ShieldCheck, Sparkles } from 'lucide-react'
import { api } from './erpApi'
import type * as AppTypes from './erp-types'
type ERPAssistantTurn=AppTypes.ERPAssistantTurn

export function ERPAssistantPage({token}:{token:string}) {
  const [question,setQuestion]=useState('')
  const [turns,setTurns]=useState<ERPAssistantTurn[]>([])
  const [sharingConfirmed,setSharingConfirmed]=useState(false)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  async function sendQuestion(event:React.FormEvent) {
    event.preventDefault()
    const content=question.trim()
    if(!content||!sharingConfirmed||busy)return
    const history=turns.slice(-10).map(turn=>({role:turn.role,content:turn.content}))
    setBusy(true);setError('');setQuestion('');setSharingConfirmed(false)
    setTurns(previous=>[...previous,{role:'user',content}])
    try {
      const result=await api<{answer:string;readOnly:boolean}>('/api/ai-settings/erp-assistant',token,{method:'POST',body:JSON.stringify({question:content,aiSharingConfirmed:true,history})})
      setTurns(previous=>[...previous,{role:'assistant',content:result.answer}])
    } catch(e) { setError(`${(e as Error).message} Soruyu yeniden göndermek için paylaşım onayını tekrar işaretleyin.`);setQuestion(content) }
    finally { setBusy(false) }
  }
  return <section className="erp-assistant-page">
    <div className="erp-assistant-hero screen-page-header"><div className="erp-assistant-mark"><Sparkles size={22}/></div><div><p className="eyebrow">GELİŞTİRME VE UYARLAMA · AI ARAÇLARI</p><h1>AI ERP Asistanı</h1><p>Stok ve depo bilgilerini doğal dille sorun. Asistan yalnızca hesabınızın erişebildiği kayıtları okur.</p></div><span className="erp-assistant-readonly"><ShieldCheck size={15}/> Salt okunur</span></div>
    <div className="erp-assistant-workspace"><div className="erp-assistant-conversation" aria-live="polite">
      {turns.length===0&&!busy?<div className="erp-assistant-empty"><span><Sparkles size={20}/></span><h2>ERP verileriniz hakkında soru sorun</h2><p>Örneğin “Kahve kodlu ürünün stok durumunu kontrol et” veya “Depoları listele”.</p><div className="erp-assistant-prompts">{['Stok kodu veya ada göre ürün ara','Depoları listele','Cari hesap ara','Seçili depoda kullanılabilir miktarı bul','Cari bakiye sorgula'].map(item=><button key={item} onClick={()=>setQuestion(item)}>{item}<span>↗</span></button>)}</div></div>:<div className="erp-assistant-messages">{turns.map((turn,index)=><article key={index} className={`erp-assistant-message ${turn.role}`}><span className="message-avatar">{turn.role==='assistant'?<Sparkles size={15}/>:((localStorage.getItem('aierp.user')||'K').slice(0,1).toUpperCase())}</span><div><small>{turn.role==='assistant'?'Nexora AI':'Siz'}</small><p>{turn.content}</p></div></article>)}{busy&&<article className="erp-assistant-message assistant" role="status" aria-live="polite"><span className="message-avatar"><Sparkles size={15}/></span><div><small>Nexora AI</small><p className="assistant-thinking">Yetkili ERP kayıtları inceleniyor…</p></div></article>}</div>}
    </div><form className="erp-assistant-composer" onSubmit={sendQuestion}>{error&&<div className="alert" role="alert">{error}</div>}<label className="erp-assistant-consent" htmlFor="erp-assistant-sharing-consent"><input id="erp-assistant-sharing-consent" type="checkbox" checked={sharingConfirmed} onChange={event=>setSharingConfirmed(event.target.checked)} disabled={busy}/><span>Sorumu ve gerekli, erişim kapsamındaki ERP verilerini yanıt üretmek için seçili AI sağlayıcısıyla paylaşmayı onaylıyorum.</span></label><div className="erp-assistant-input-row"><textarea value={question} onChange={event=>setQuestion(event.target.value)} placeholder="ERP verileriniz hakkında sorun…" maxLength={2000} rows={2} disabled={busy}/><button className="primary" type="submit" aria-label="Soruyu gönder" disabled={busy||!sharingConfirmed||!question.trim()}>{busy?'…':<Send size={17}/>}</button></div><div className="erp-assistant-footnote"><span><ShieldCheck size={14}/> Sadece okuma araçları · Değişiklik yapılmaz</span><span>{question.length}/2000</span></div></form></div>
  </section>
}
