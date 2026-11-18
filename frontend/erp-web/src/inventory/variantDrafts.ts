// Varyant taslakları (eski stok kartı ekranı ve özel sayfa varyant tablosu aynı kodu kullanır).
export type VariantDimensionDraft = { name: string; values: string };
export function variantToken(value: string) {
  return value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[ıİ]/g, "I").replace(/[ğĞ]/g, "G").replace(/[şŞ]/g, "S")
    .replace(/[çÇ]/g, "C").replace(/[öÖ]/g, "O").replace(/[üÜ]/g, "U")
    .toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "") || "SECENEK";
}
export const MAX_VARIANT_DRAFTS = 200;
function variantAxes(dimensions: VariantDimensionDraft[]) {
  return dimensions.map((dimension) => ({
    name: dimension.name.trim(),
    values: [...new Set(dimension.values.split(",").map((value) => value.trim()).filter(Boolean))],
  })).filter((axis) => axis.name && axis.values.length);
}
/** Kesilmeden oluşacak varyant sayısı ("En fazla 200" iletisi için; satır üretmez). */
export function countVariantDrafts(dimensions: VariantDimensionDraft[]) {
  const axes = variantAxes(dimensions);
  return axes.length ? axes.reduce((count, axis) => count * axis.values.length, 1) : 0;
}
/** Kartezyen çarpımın ilk 200 satırı; üretim 200 satırda durur (büyük çarpımlar belleği doldurmaz). */
export function makeVariantDrafts(code: string, name: string, dimensions: VariantDimensionDraft[]) {
  const axes = variantAxes(dimensions);
  if (!axes.length) return [];
  let rows: Array<Record<string, string>> = [{}];
  for (const axis of axes) {
    const next: Array<Record<string, string>> = [];
    outer: for (const row of rows) {
      for (const value of axis.values) {
        next.push({ ...row, [axis.name]: value });
        if (next.length >= MAX_VARIANT_DRAFTS) break outer;
      }
    }
    rows = next;
  }
  return rows.map((attributes) => {
    const suffix = axes.map((axis) => variantToken(attributes[axis.name])).join("-");
    const details = axes.map((axis) => `${axis.name}: ${attributes[axis.name]}`).join(" · ");
    return { code: `${code.trim().toUpperCase()}-${suffix}`.slice(0, 64), name: `${name.trim()} · ${details}`.slice(0, 200), barcode: null, attributes };
  });
}
