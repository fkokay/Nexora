import './ui-designer.css'

export type UiDesignElement={type:'text'|'email'|'number'|'date'|'select'|'textarea'|'stat'|'table';label:string;placeholder:string|null;options:string[]}
export type UiDesignPlan={title:string;description:string;sections:{title:string;description:string;layout:'single'|'two-column';elements:UiDesignElement[]}[];actions:{label:string;style:'primary'|'secondary'}[];responsiveBehaviors:string[];accessibilityNotes:string[]}

export function UiDesignPlanPreview({plan}:{plan:UiDesignPlan}) {
  function renderElement(element:UiDesignElement,index:number) {
    const id=`preview-${index}-${element.label.toLowerCase().replace(/[^a-z0-9]+/g,'-')}`
    if(element.type==='stat')return <article className="ui-preview-stat" key={id}><span>{element.label}</span><strong>{element.placeholder||'—'}</strong></article>
    if(element.type==='table')return <div className="ui-preview-table-wrap" key={id}><table><caption>{element.label}</caption><thead><tr>{element.options.map(option=><th scope="col" key={option}>{option}</th>)}</tr></thead><tbody><tr><td colSpan={element.options.length}>Örnek veri önizlemesi</td></tr></tbody></table></div>
    if(element.type==='select')return <label className="ui-preview-field" htmlFor={id} key={id}>{element.label}<select id={id} defaultValue=""><option value="">{element.placeholder||'Seçin'}</option>{element.options.map(option=><option key={option}>{option}</option>)}</select></label>
    if(element.type==='textarea')return <label className="ui-preview-field" htmlFor={id} key={id}>{element.label}<textarea id={id} placeholder={element.placeholder||''} rows={3}/></label>
    return <label className="ui-preview-field" htmlFor={id} key={id}>{element.label}<input id={id} type={element.type} placeholder={element.placeholder||''}/></label>
  }
  return <div className="ui-design-preview" aria-label="Ekran tasarımının etkileşimsiz önizlemesi"><div className="ui-preview-frame"><header className="ui-preview-header"><div><p>NEXORA ERP · EKRAN TASLAĞI</p><h2>{plan.title}</h2><span>{plan.description}</span></div><span className="ui-preview-breakpoint">Masaüstü önizleme</span></header><div className="ui-preview-sections">{plan.sections.map((section,index)=><section className={`ui-preview-panel ${section.layout==='two-column'?'two-column':''} ${index===0?'lead':''}`} key={`${section.title}-${index}`}><div className="ui-preview-section-title"><h3>{section.title}</h3><p>{section.description}</p></div>{section.elements.map(renderElement)}</section>)}</div>{plan.actions.length>0&&<div className="ui-preview-actions">{plan.actions.map((action,index)=><button type="button" disabled className={`ui-preview-button ${action.style}`} key={`${action.label}-${index}`}>{action.label}</button>)}</div>}<p className="ui-preview-disclaimer">Etkileşimsiz görsel taslak · Örnek tablo ve metrik değerleri canlı veriye bağlı değildir</p></div><div className="ui-design-guidance"><section><h4>Mobil davranış</h4><ul>{plan.responsiveBehaviors.map((note,index)=><li key={index}>{note}</li>)}</ul></section><section><h4>Erişilebilirlik</h4><ul>{plan.accessibilityNotes.map((note,index)=><li key={index}>{note}</li>)}</ul></section></div></div>
}
