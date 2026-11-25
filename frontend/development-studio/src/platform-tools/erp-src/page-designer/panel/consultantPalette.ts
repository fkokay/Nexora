// Kalıplı sayfanın danışman paleti (alt proje 5a, taslak 03): 11 öğe, gruplanmadan. Hazır olmayanlar soluk görünür ve gerekçesi gösterilir.
import { AlignLeft, BadgeInfo, ClipboardList, Code2, Gauge, ImageIcon, Info, List, MousePointerClick, Rows3, Table2, type LucideIcon } from "lucide-react";
import type { ModelComponent } from "./listPanelModel";

type PropValue = string | number | boolean | string[];
export type ConsultantKind = "text" | "infoBox" | "indicator" | "list" | "form" | "lineTable" | "recordSummary" | "sections" | "buttons" | "image" | "developer";
export type ConsultantItem = { kind: ConsultantKind; label: string; description: string; icon: LucideIcon };

export const CONSULTANT_PALETTE: ConsultantItem[] = [
  { kind: "text", label: "Metin", description: "Başlık, açıklama, etiket", icon: AlignLeft },
  { kind: "infoBox", label: "Bilgi kutusu", description: "Bilgi, uyarı, madde listesi", icon: Info },
  { kind: "indicator", label: "Gösterge", description: "Sayı, ilerleme, durum", icon: Gauge },
  { kind: "list", label: "Liste", description: "Kayıtları listeler", icon: List },
  { kind: "form", label: "Form", description: "Kayıt alanları", icon: ClipboardList },
  { kind: "lineTable", label: "Satır tablosu", description: "Belge satırları", icon: Table2 },
  { kind: "recordSummary", label: "Kayıt özeti", description: "Kaydın kimlik bilgisi", icon: BadgeInfo },
  { kind: "sections", label: "Bölümler", description: "Sekmeler ya da adımlar", icon: Rows3 },
  { kind: "buttons", label: "Butonlar", description: "Sayfa eylemleri", icon: MousePointerClick },
  { kind: "image", label: "Görsel", description: "Resim ya da logo", icon: ImageIcon },
  { kind: "developer", label: "Yazılımcı bileşeni", description: "Özel çizim, harita, grafik…", icon: Code2 },
];

const KEY_PREFIX = "consultant:";
/** Sol paneldeki öğenin kararlı anahtarı (sürükleme ve ekleme bunu geri çözer). */
export const consultantPaletteKey = (kind: ConsultantKind) => `${KEY_PREFIX}${kind}`;
export const consultantKindFromKey = (key: string): ConsultantKind | null => {
  if (!key.startsWith(KEY_PREFIX)) return null;
  const kind = key.slice(KEY_PREFIX.length);
  return CONSULTANT_PALETTE.find((item) => item.kind === kind)?.kind ?? null;
};

const NEXT_VERSION = "Bu bileşen sonraki sürümde gelir.";
const UNAVAILABLE: Partial<Record<ConsultantKind, string>> = {
  list: "Bu kalıpta tek liste vardır.",
  form: NEXT_VERSION, lineTable: NEXT_VERSION, recordSummary: NEXT_VERSION, sections: NEXT_VERSION,
  buttons: "Düğmeleri Liste panelindeki Eylemler bölümünden ekleyin.",
  developer: "Yazılımcı bileşenleri katalogdan gelecek; henüz hazır değil.",
};

export function consultantAvailability(kind: ConsultantKind): { available: true } | { available: false; reason: string } {
  const reason = UNAVAILABLE[kind];
  return reason ? { available: false, reason } : { available: true };
}

export type CreatableKind = "text" | "infoBox" | "indicator" | "image";
export const isCreatableKind = (kind: ConsultantKind): kind is CreatableKind => kind === "text" || kind === "infoBox" || kind === "indicator" || kind === "image";

/** Palet öğesinden oluşan bileşen; `slot` eklenmez (yerini `addComponent` verir). */
export function createConsultantComponent(kind: CreatableKind, id: string): { id: string; type: string; props: Record<string, PropValue> } {
  switch (kind) {
    case "text": return { id, type: "heading", props: { text: "Başlık" } };
    case "infoBox": return { id, type: "alert", props: { variant: "info", title: "Bilgi", text: "" } };
    case "indicator": return { id, type: "metric", props: { title: "Gösterge" } };
    case "image": return { id, type: "image", props: { title: "", value: "", height: 160 } };
  }
}

const KIND_BY_TYPE: Record<string, ConsultantKind> = {
  heading: "text", text: "text", label: "text", section: "text",
  alert: "infoBox", card: "infoBox", list: "infoBox",
  metric: "indicator", progress: "indicator", badge: "indicator",
  image: "image", button: "buttons",
};

/** Bileşenin danışman türü; yeni panelde açılmayanlar (sayfa başlığı, içi dolu bileşen, detay paneli kartı, öteki tipler) null. */
export function consultantKindOf(component: ModelComponent): ConsultantKind | null {
  const kind = KIND_BY_TYPE[component.type];
  if (!kind) return null;
  if (component.type === "heading" && component.props.pageTitle === true) return null;
  if (Array.isArray(component.children) && component.children.length > 0) return null;
  if (component.type === "card" && component.props.variant === "panel") return null;
  // Simgeli bildirim (ERP durum şeridi) danışman bileşeni değildir; eski panelde açılır.
  if (component.type === "alert" && typeof component.props.icon === "string" && component.props.icon.trim() !== "") return null;
  return kind;
}
