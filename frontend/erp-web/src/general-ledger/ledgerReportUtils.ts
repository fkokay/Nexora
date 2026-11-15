/** Shared helpers of the ledger report screens (Yevmiye defteri, Mizan, Bilanço, Hesap planı). */
import { localDateString } from "../dateUtils";

/** Tek Düzen Hesap Planı classes, keyed by the first digit of the account code. */
export const tdhpClassLabels: Record<string, string> = {
  "1": "Dönen varlıklar",
  "2": "Duran varlıklar",
  "3": "Kısa vadeli yabancı kaynaklar",
  "4": "Uzun vadeli yabancı kaynaklar",
  "5": "Özkaynaklar",
  "6": "Gelir tablosu hesapları",
  "7": "Maliyet hesapları",
  "8": "Serbest",
  "9": "Nazım hesaplar",
};

/** Two-digit TDHP group names (hesap grupları). Groups not listed fall back to "Grup NN". */
export const tdhpGroupLabels: Record<string, string> = {
  "10": "Hazır değerler",
  "11": "Menkul kıymetler",
  "12": "Ticari alacaklar",
  "13": "Diğer alacaklar",
  "15": "Stoklar",
  "17": "Yıllara yaygın inşaat ve onarım maliyetleri",
  "18": "Gelecek aylara ait giderler ve gelir tahakkukları",
  "19": "Diğer dönen varlıklar",
  "22": "Ticari alacaklar",
  "23": "Diğer alacaklar",
  "24": "Mali duran varlıklar",
  "25": "Maddi duran varlıklar",
  "26": "Maddi olmayan duran varlıklar",
  "27": "Özel tükenmeye tabi varlıklar",
  "28": "Gelecek yıllara ait giderler ve gelir tahakkukları",
  "29": "Diğer duran varlıklar",
  "30": "Mali borçlar",
  "32": "Ticari borçlar",
  "33": "Diğer borçlar",
  "34": "Alınan avanslar",
  "35": "Yıllara yaygın inşaat ve onarım hakedişleri",
  "36": "Ödenecek vergi ve diğer yükümlülükler",
  "37": "Borç ve gider karşılıkları",
  "38": "Gelecek aylara ait gelirler ve gider tahakkukları",
  "39": "Diğer kısa vadeli yabancı kaynaklar",
  "40": "Mali borçlar",
  "42": "Ticari borçlar",
  "43": "Diğer borçlar",
  "44": "Alınan avanslar",
  "47": "Borç ve gider karşılıkları",
  "48": "Gelecek yıllara ait gelirler ve gider tahakkukları",
  "49": "Diğer uzun vadeli yabancı kaynaklar",
  "50": "Ödenmiş sermaye",
  "52": "Sermaye yedekleri",
  "54": "Kâr yedekleri",
  "57": "Geçmiş yıllar kârları",
  "58": "Geçmiş yıllar zararları",
  "59": "Dönem net kârı (zararı)",
  "60": "Brüt satışlar",
  "61": "Satış indirimleri",
  "62": "Satışların maliyeti",
  "63": "Faaliyet giderleri",
  "64": "Diğer faaliyetlerden olağan gelir ve kârlar",
  "65": "Diğer faaliyetlerden olağan gider ve zararlar",
  "66": "Finansman giderleri",
  "67": "Olağandışı gelir ve kârlar",
  "68": "Olağandışı gider ve zararlar",
  "69": "Dönem net kârı veya zararı",
  "70": "Maliyet muhasebesi bağlantı hesapları",
  "71": "Direkt ilk madde ve malzeme giderleri",
  "72": "Direkt işçilik giderleri",
  "73": "Genel üretim giderleri",
  "74": "Hizmet üretim maliyeti",
  "75": "Araştırma ve geliştirme giderleri",
  "76": "Pazarlama, satış ve dağıtım giderleri",
  "77": "Genel yönetim giderleri",
  "78": "Finansman giderleri",
  "79": "Gider çeşitleri",
};

export const tdhpGroupLabel = (group: string) => tdhpGroupLabels[group] ?? `Grup ${group}`;

/** Contra accounts in TDHP carry "(-)" at the end of their name (e.g. "103 VERİLEN ÇEKLER VE ÖDEME EMİRLERİ (-)"). */
export const isContraAccountName = (name: string) => /\(\s*-\s*\)\s*$/.test(name.trim());

/**
 * Reverse balance (ters bakiye): assets (classes 1–2) with a credit balance, liabilities and
 * equity (classes 3–5) with a debit balance; contra "(-)" accounts are exempt. In IFRS mode the
 * code is not TDHP, so the statement section decides instead.
 */
export function isReverseBalance(
  row: { code: string; name: string; statementSection?: string | null },
  balanceDebit: number,
  balanceCredit: number,
  basis: "TDHP" | "IFRS",
  /** Name of the main account a dotted sub-account belongs to (103.01 → 103): its "(-)" also exempts. */
  mainAccountName?: string,
): boolean {
  if (isContraAccountName(row.name) || (mainAccountName && isContraAccountName(mainAccountName))) return false;
  const debit = round2(balanceDebit),
    credit = round2(balanceCredit);
  if (basis === "IFRS") {
    if (row.statementSection === "Asset") return credit > 0;
    if (row.statementSection === "Liability" || row.statementSection === "Equity") return debit > 0;
    return false;
  }
  const accountClass = row.code.trim().charAt(0);
  if (accountClass === "1" || accountClass === "2") return credit > 0;
  if (accountClass === "3" || accountClass === "4" || accountClass === "5") return debit > 0;
  return false;
}

export const round2 = (value: number) => Math.round(value * 100) / 100;

export const formatAmount = (value: number) =>
  value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Zero amounts show as a dash in the report tables. */
export const formatOrDash = (value: number) => (round2(value) === 0 ? "—" : formatAmount(value));

export const displayDate = (value: string) => value.split("-").reverse().join(".");

export const startOfYear = () => `${new Date().getFullYear()}-01-01`;
export const startOfMonth = () => localDateString().slice(0, 8) + "01";

/** "Title case" for display only: "ALINAN ÇEKLER" → "Alınan çekler" (stored names stay unchanged). */
export function displayAccountName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed || trimmed !== trimmed.toLocaleUpperCase("tr-TR")) return trimmed;
  const lower = trimmed.toLocaleLowerCase("tr-TR");
  return lower.charAt(0).toLocaleUpperCase("tr-TR") + lower.slice(1);
}

type ExportCell = string | number | null | undefined;

const safeText = (value: ExportCell) => {
  const text = value == null ? "" : String(value);
  return typeof value === "string" && /^[\s﻿]*[=+\-@]/u.test(text) ? `'${text}` : text;
};

export function downloadCsv(fileName: string, rows: ExportCell[][]) {
  const csv =
    "﻿" +
    rows
      .map((row) => row.map((cell) => `"${safeText(cell).replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadXlsx(fileName: string, sheetName: string, rows: ExportCell[][]) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(
      rows.map((row) => row.map((cell) => (typeof cell === "number" ? cell : safeText(cell)))),
    ),
    sheetName.slice(0, 31),
  );
  XLSX.writeFileXLSX(workbook, fileName);
}
