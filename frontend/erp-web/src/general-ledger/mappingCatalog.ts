/**
 * Display metadata of the ledger mapping keys (LedgerMappingKeys in the domain): module group,
 * a one-line description of where the account is used and the TDHP code prefixes the account
 * usually has (only used to list those accounts first; nothing is suggested or saved from it).
 */
export type MappingModule =
  | "sales"
  | "purchase"
  | "inventory"
  | "finance"
  | "credit"
  | "instrument"
  | "tax"
  | "payroll"
  | "other";

export const mappingModuleLabels: Record<MappingModule, string> = {
  sales: "Satış",
  purchase: "Satınalma",
  inventory: "Stok",
  finance: "Finans",
  credit: "Kredi ve finansman",
  instrument: "Çek/senet",
  tax: "Vergi",
  payroll: "Bordro",
  other: "Diğer",
};
export const mappingModuleOrder: MappingModule[] = [
  "sales",
  "purchase",
  "inventory",
  "finance",
  "credit",
  "instrument",
  "tax",
  "payroll",
  "other",
];

type MappingMeta = { module: MappingModule; description: string; prefixes: string[] };

const mappingMeta: Record<string, MappingMeta> = {
  "sales.receivable": { module: "sales", description: "Satış faturası borç, tahsilat alacak", prefixes: ["120"] },
  "sales.revenue": { module: "sales", description: "Satış faturasında satış tutarı alacak", prefixes: ["600", "601", "602"] },
  "sales.cost": { module: "sales", description: "Satış irsaliyesinde satılan malın maliyeti borç", prefixes: ["620", "621"] },
  "sales.tax-payable": { module: "tax", description: "Satış faturasında hesaplanan KDV alacak", prefixes: ["391"] },
  "sales.withholding-receivable": { module: "tax", description: "Satış faturasında alıcının tevkif ettiği vergi borç", prefixes: ["136", "193", "191"] },
  "collection.card-clearing": { module: "finance", description: "Kartlı tahsilatta banka hesabına geçene kadar borç", prefixes: ["108", "127"] },
  "collection.check-clearing": { module: "finance", description: "Çekle tahsilatta portföydeki çek borç", prefixes: ["101"] },
  "purchase.payable": { module: "purchase", description: "Alış faturası alacak, tedarikçi ödemesi borç", prefixes: ["320"] },
  "purchase.cost": { module: "purchase", description: "Alış faturasında mal/hizmet maliyeti borç", prefixes: ["153", "150", "740", "770"] },
  "purchase.tax-recoverable": { module: "tax", description: "Alış faturasında indirilecek KDV borç", prefixes: ["191"] },
  "purchase.withholding-payable": { module: "tax", description: "Alış faturasında tevkif edilen vergi alacak", prefixes: ["360"] },
  "purchase.receipt-accrual": { module: "purchase", description: "Mal kabulde faturası henüz gelmeyen tutar alacak", prefixes: ["329", "381"] },
  "payment.card-clearing": { module: "finance", description: "Kartlı tedarikçi ödemesinde kart borcu alacak", prefixes: ["309", "300"] },
  "payment.check-clearing": { module: "finance", description: "Çekle tedarikçi ödemesinde verilen çek alacak", prefixes: ["103"] },
  "instrument.receivable-portfolio": { module: "instrument", description: "Alınan çek/senet portföye girişte borç", prefixes: ["101", "121"] },
  "instrument.payable-portfolio": { module: "instrument", description: "Verilen çek/senet çıkışında alacak", prefixes: ["103", "321"] },
  "instrument.receivable-offset": { module: "instrument", description: "Alınan çek/senedin karşı cari hesabı alacak", prefixes: ["120"] },
  "instrument.payable-offset": { module: "instrument", description: "Verilen çek/senedin karşı cari hesabı borç", prefixes: ["320"] },
  "instrument.endorsement-offset": { module: "instrument", description: "Alınan çekin ciro edildiği cari borç", prefixes: ["320"] },
  "fx.receivable": { module: "finance", description: "Kur değerlemede döviz alacak farkı", prefixes: ["120"] },
  "fx.payable": { module: "finance", description: "Kur değerlemede döviz borç farkı", prefixes: ["320"] },
  "fx.gain": { module: "finance", description: "Kur değerlemede kambiyo kârı alacak", prefixes: ["646"] },
  "fx.loss": { module: "finance", description: "Kur değerlemede kambiyo zararı borç", prefixes: ["656"] },
  "inventory.asset": { module: "inventory", description: "Stok giriş/çıkış maliyet hareketlerinde stok hesabı", prefixes: ["153", "150", "152"] },
  "inventory.return-cost-offset": { module: "inventory", description: "İade stok hareketinde maliyet karşı hesabı", prefixes: ["621", "620"] },
  "inventory.revaluation-offset": { module: "inventory", description: "Stok maliyet düzeltmesinde karşı hesap", prefixes: [] },
  "inventory.landed-cost-offset": { module: "inventory", description: "Ek maliyet dağıtımında karşı hesap", prefixes: ["320", "329"] },
  "inventory.reversal-offset": { module: "inventory", description: "Stok hareketi ters kaydında karşı hesap", prefixes: [] },
  "fixed-assets.depreciation-expense": { module: "other", description: "Amortisman ayırmada gider borç", prefixes: ["770", "730", "760"] },
  "fixed-assets.accumulated-depreciation": { module: "other", description: "Amortisman ayırmada birikmiş amortisman alacak", prefixes: ["257", "268"] },
  "fixed-assets.tax-depreciation-expense": { module: "other", description: "Vergi amortismanında gider borç", prefixes: ["770", "730", "760"] },
  "fixed-assets.tax-accumulated-depreciation": { module: "other", description: "Vergi amortismanında birikmiş amortisman alacak", prefixes: ["257", "268"] },
  "fixed-assets.cost": { module: "other", description: "Duran varlık ediniminde maliyet borç", prefixes: ["25", "26"] },
  "fixed-assets.disposal-proceeds": { module: "other", description: "Duran varlık satışında tahsil edilecek tutar borç", prefixes: ["120", "136", "102"] },
  "fixed-assets.disposal-gain": { module: "other", description: "Duran varlık satış kârı alacak", prefixes: ["679", "649"] },
  "fixed-assets.disposal-loss": { module: "other", description: "Duran varlık satış zararı borç", prefixes: ["689", "659"] },
  "credit-facility.principal": { module: "credit", description: "Kredi kullandırımında alacak, geri ödemede borç", prefixes: ["300", "400"] },
  "credit-facility.interest-expense": { module: "credit", description: "Kredi geri ödemesinde faiz gideri borç", prefixes: ["780", "660"] },
  "credit-facility.accrued-interest": { module: "credit", description: "Aylık faiz tahakkukunda faiz borcu alacak", prefixes: ["381", "300"] },
  "credit-facility.fee-expense": { module: "credit", description: "Kredi ücret ve komisyonları gider borç", prefixes: ["780", "660"] },
  "payroll.net-pay-payable": { module: "payroll", description: "Bordroda personele ödenecek net ücret alacak", prefixes: ["335"] },
};

export function mappingInfo(key: string): MappingMeta {
  const known = mappingMeta[key];
  if (known) return known;
  if (key.startsWith("tax-rule."))
    return { module: "tax", description: "Vergi kuralına göre hesaplanan vergi tutarı", prefixes: ["391", "191", "360"] };
  if (key.startsWith("financial-account."))
    return { module: "finance", description: "Kasa/banka hareketlerinde nakit hesabı", prefixes: ["100", "102"] };
  const prefix = key.split(".")[0];
  const module: MappingModule =
    prefix === "sales"
      ? "sales"
      : prefix === "purchase"
        ? "purchase"
        : prefix === "inventory"
          ? "inventory"
          : prefix === "payroll"
            ? "payroll"
            : prefix === "instrument"
              ? "instrument"
              : prefix === "credit-facility"
                ? "credit"
                : prefix === "fx" || prefix === "collection" || prefix === "payment"
                  ? "finance"
                  : "other";
  return { module, description: "", prefixes: [] };
}
