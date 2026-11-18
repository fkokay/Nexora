// Varyant taslakları (eski stok kartı ekranı ve özel sayfa varyant tablosu aynı kodu kullanır).
export type VariantDimensionDraft = { name: string; values: string };
export function variantToken(value: string) {
  return value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[ıİ]/g, "I").replace(/[ğĞ]/g, "G").replace(/[şŞ]/g, "S")
    .replace(/[çÇ]/g, "C").replace(/[öÖ]/g, "O").replace(/[üÜ]/g, "U")
    .toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "") || "SECENEK";
}
export function makeVariantDrafts(code: string, name: string, dimensions: VariantDimensionDraft[]) {
  const axes = dimensions.map((dimension) => ({
    name: dimension.name.trim(),
    values: [...new Set(dimension.values.split(",").map((value) => value.trim()).filter(Boolean))],
  })).filter((axis) => axis.name && axis.values.length);
  if (!axes.length) return [];
  const rows: Array<Record<string, string>> = [{}];
  for (const axis of axes) {
    const prior = [...rows];
    rows.length = 0;
    for (const row of prior) for (const value of axis.values) rows.push({ ...row, [axis.name]: value });
  }
  return rows.slice(0, 200).map((attributes) => {
    const suffix = axes.map((axis) => variantToken(attributes[axis.name])).join("-");
    const details = axes.map((axis) => `${axis.name}: ${attributes[axis.name]}`).join(" · ");
    return { code: `${code.trim().toUpperCase()}-${suffix}`.slice(0, 64), name: `${name.trim()} · ${details}`.slice(0, 200), barcode: null, attributes };
  });
}
