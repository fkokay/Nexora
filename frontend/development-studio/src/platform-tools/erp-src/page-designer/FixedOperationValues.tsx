import type { ErpOperation } from "./erpOperations";

/** İşlemin katalogdan gelen sabit değerleri (gövde: fixedBody, sorgu: fixedQuery); sayfada bağlanmaz, yalnız gösterilir. */
export function fixedOperationValues(operation: ErpOperation): { place: "Gövde" | "Sorgu"; name: string; value: string }[] {
  const text = (value: unknown) => typeof value === "string" ? value : JSON.stringify(value);
  return [
    ...Object.entries(operation.fixedBody ?? {}).map(([name, value]) => ({ place: "Gövde" as const, name, value: text(value) })),
    ...Object.entries(operation.fixedQuery ?? {}).map(([name, value]) => ({ place: "Sorgu" as const, name, value: text(value) })),
  ];
}

export function FixedOperationValues({ operation }: { operation: ErpOperation }) {
  const rows = fixedOperationValues(operation);
  if (rows.length === 0) return null;
  return <div className="pd-field">Sabit değerler<small>İşlemden gelir; her istekte gönderilir, sayfada değiştirilemez.</small>
    <table className="pd-query-params pd-query-fixed"><thead><tr><th scope="col">Ad</th><th scope="col">Değer</th><th scope="col">Yer</th></tr></thead><tbody>
      {rows.map((row) => <tr key={`${row.place}:${row.name}`}><td><code>{row.name}</code></td><td><code>{row.value}</code></td><td><small>{row.place}</small></td></tr>)}
    </tbody></table>
  </div>;
}
