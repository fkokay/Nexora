import { createContext, useContext, useRef, type ReactNode } from "react";
import { CanvasAnchorContext } from "../designer-canvas/anchorContext";
import { PageShell, type ShellAction } from "./PageShell";
import { sectionColumns, useBoxWidth } from "./RecordTemplate";
import { freeFullRow, type FreeLayout } from "./freeTemplateModel";
import type { Component } from "./listTemplateModel";

/** Serbest gövdenin dar kip eşiği: kutu ≤ 480 px'te `hideOnMobile` bölüm ve üyeler çizilmez. */
export const FREE_NARROW = 480;
export const FREE_EMPTY_PLACEHOLDER = "Bu bölüme bileşen ekleyin.";

/** Kalıbın gövdesi dar kipte mi (bölümün `hideOnMobile`'ı bununla uygulanır). */
const FreeNarrowContext = createContext(false);

/**
 * Serbest gövdenin bölümü: başlığı varsa `h3`, üyeleri kolonlu ızgarada. Bölüm kutusu `container-type: inline-size` taşır ve
 * kendi genişliğini ölçer (`data-cols`; Kayıt kartının `sectionColumns` eşikleri). Her üye bir hücrededir (bileşenin kendi
 * `grid-column`'u ızgaraya karışmaz); Liste, Görsel ve maddeli kutular tam satırdır. Üyesiz bölüm tuvalde yer tutucuyla
 * görünür, canlıda hiç çizilmez. Dar kipte `hideOnMobile` üye (bölüm kutusu ≤ 480 px) ve bölüm (kalıp gövdesi ≤ 480 px)
 * çizilmez; gizli bölümün kutusu yerinde kalır ki ölçüm ve tuval işareti kopmasın.
 */
export function FreeSection<C extends Component>({ block, title, members, render }: {
  block: C; title: string; members: C[]; render: (member: C) => ReactNode;
}) {
  const canvas = useContext(CanvasAnchorContext);
  const pageNarrow = useContext(FreeNarrowContext);
  const ref = useRef<HTMLElement>(null);
  const width = useBoxWidth(ref);
  if (members.length === 0 && !canvas) return null;
  const chosen = block.props?.columns === 1 || block.props?.columns === 3 ? block.props.columns : 2;
  const shown = width === null ? chosen : sectionColumns(chosen, width);
  const hidden = pageNarrow && block.props?.hideOnMobile === true;
  const narrow = width !== null && width <= FREE_NARROW;
  const cells = hidden ? [] : members
    .filter((member) => !(narrow && member.props?.hideOnMobile === true))
    .flatMap((member) => {
      const node = render(member);
      return node === null || node === undefined ? [] : [<div key={member.id} className={`free-cell${freeFullRow(member) ? " is-full" : ""}`}>{node}</div>];
    });
  return <section ref={ref} className="free-section" data-cols={shown} hidden={hidden || undefined} aria-label={title || undefined}>
    {!hidden && <>
      {title && <h3>{title}</h3>}
      <div className={`free-section-grid is-cols-${chosen}`}>
        {cells}
        {members.length === 0 && <p className="free-section-placeholder">{FREE_EMPTY_PLACEHOLDER}</p>}
      </div>
    </>}
  </section>;
}

/**
 * Serbest gövde kalıbı: ortak kabuk içinde başlık → işlem çubuğu → sekme çubuğu (varsa) → bölümler. Bileşenleri çizen
 * `render` sayfanın kendi çizicisidir (tuval işaretleri onunla gelir). Sekmeli sayfada sekme bileşeni çizilir: bölümleri
 * kendi panellerinde taşır, sekme seçimi `tabParam` ve tuvalin `showTab`'ıyla çalışır. Basamak her zaman 3.
 */
export function FreeTemplate<C extends Component>({ layout, render, title, crumbs, actions, notices }: {
  layout: FreeLayout<C>; render: (component: C) => ReactNode; title: string; crumbs: string[];
  actions: ShellAction[]; notices?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const width = useBoxWidth(ref);
  const narrow = width !== null && width <= FREE_NARROW;
  return <div className="free-template" data-level={3}>
    <PageShell title={title} crumbs={crumbs} actions={actions}>
      {notices}
      <div ref={ref} className="free-template-body">
        <FreeNarrowContext.Provider value={narrow}>
          {layout.tabsComponent ? render(layout.tabsComponent) : layout.blocks.map((entry) => render(entry.block))}
        </FreeNarrowContext.Provider>
      </div>
    </PageShell>
  </div>;
}
