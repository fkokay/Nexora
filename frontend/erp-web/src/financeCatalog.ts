import type { FinancePageKey, FinanceGridColumn, LedgerStatementSection } from './erp-types'



export const financePageTitles:Record<FinancePageKey,string>={'finance-accounts':'Kasa & Banka','finance-cash-accounts':'Kasalar','finance-bank-accounts':'Bankalar','finance-statements':'Banka Ekstreleri','finance-cash-flow':'Nakit Akışı','finance-fx':'Kur & Değerleme','finance-ledger':'Genel Muhasebe','finance-budget':'Bütçe Planlama','finance-cash-budget':'Doğrudan nakit bütçesi','finance-exposure':'Döviz Pozisyonu','finance-maturities':'Vade Takibi','finance-instruments':'Çek ve Senet','finance-credit-facilities':'Krediler & Finansman'}

export const financeGridDefaults: Record<string, FinanceGridColumn[]> = {
  'sales-returns': [{key:'code',label:'İade no'},{key:'returnDate',label:'Tarih'},{key:'warehouseName',label:'Depo'},{key:'lineCount',label:'Satır'},{key:'grandTotal',label:'Tutar'},{key:'status',label:'Durum'},{key:'actions',label:'İşlemler'}],
  'finance-account-transactions': [{key:'transactionDate',label:'Tarih'},{key:'source',label:'Kaynak'},{key:'description',label:'Açıklama'},{key:'cashFlowCategory',label:'Nakit akışı'},{key:'reference',label:'Referans'},{key:'inflow',label:'Giriş'},{key:'outflow',label:'Çıkış'},{key:'actions',label:'İşlem'}],
  'finance-journals': [{key:'code',label:'Fiş'},{key:'entryDate',label:'Tarih'},{key:'sourceType',label:'Kaynak'},{key:'description',label:'Açıklama'},{key:'totalDebit',label:'Borç'},{key:'totalCredit',label:'Alacak'}],
  'finance-ledger-accounts': [{key:'code',label:'Kod'},{key:'name',label:'Hesap'},{key:'statementSection',label:'Finansal tablo sınıfı'},{key:'status',label:'Durum'},{key:'actions',label:'İşlemler'}],
  'finance-ledger-mappings': [{key:'sourceAccount',label:'Kaynak hesabı'},{key:'tenantAccount',label:'Eşleştirilen tenant hesabı'},{key:'status',label:'Durum'}],
  'finance-transfer-sources': [{key:'source',label:'Kaynak'},{key:'entryDate',label:'Tarih'},{key:'description',label:'Açıklama'},{key:'amount',label:'Tutar'},{key:'actions',label:'Gerekli eşleştirmeler / işlem'}],
  'finance-statements': [{key:'code',label:'Ekstre'},{key:'account',label:'Hesap'},{key:'period',label:'Dönem'},{key:'openingBalance',label:'Açılış'},{key:'closingBalance',label:'Kapanış'},{key:'matching',label:'Eşleşme'},{key:'status',label:'Durum'},{key:'actions',label:'İşlemler'}],
  'finance-statement-lines': [{key:'lineNumber',label:'Satır'},{key:'transactionDate',label:'Tarih'},{key:'direction',label:'Yön'},{key:'description',label:'Açıklama'},{key:'externalId',label:'Dış işlem no'},{key:'reference',label:'Referans'},{key:'amount',label:'Tutar'},{key:'matchStatus',label:'Eşleştirme'},{key:'actions',label:'İşlem'}],
  'finance-statement-unmatched-book': [{key:'date',label:'Tarih'},{key:'source',label:'Kaynak'},{key:'description',label:'Açıklama'},{key:'amount',label:'Tutar'}],
  'finance-maturities': [{key:'invoice',label:'Fatura'},{key:'counterparty',label:'Cari'},{key:'direction',label:'Yön'},{key:'invoiceDate',label:'Fatura tarihi'},{key:'dueDate',label:'Vade tarihi'},{key:'outstandingAmount',label:'Kalan tutar'},{key:'status',label:'Vade durumu'}],
  'finance-maturity-aging': [{key:'direction',label:'Yön'},{key:'currencyCode',label:'Döviz'},{key:'invoiceCount',label:'Fatura'},{key:'outstandingAmount',label:'Açık tutar'},{key:'notDue',label:'Vadesi gelmemiş'},{key:'days1To30',label:'1–30 gün'},{key:'days31To60',label:'31–60 gün'},{key:'days61To90',label:'61–90 gün'},{key:'over90Days',label:'90+ gün'}],
  'finance-fx-exposure': [{key:'invoice',label:'Fatura'},{key:'counterparty',label:'Cari'},{key:'direction',label:'Yön'},{key:'invoiceDate',label:'Fatura tarihi'},{key:'currencyCode',label:'Döviz'},{key:'outstandingAmount',label:'Kalan tutar'},{key:'invoiceDateRate',label:'Fatura kuru'},{key:'currentRate',label:'Güncel kur'},{key:'estimatedChangeBase',label:'Tahmini değişim'}],
  'finance-income-statement': [{key:'account',label:'Hesap'},{key:'section',label:'Sınıf'},{key:'debit',label:'Borç hareketi'},{key:'credit',label:'Alacak hareketi'},{key:'balance',label:'Dönem tutarı'}],
  'finance-balance-sheet': [{key:'account',label:'Hesap'},{key:'section',label:'Sınıf'},{key:'debit',label:'Borç hareketi'},{key:'credit',label:'Alacak hareketi'},{key:'balance',label:'Net bakiye'}],
  'finance-trial-balance': [{key:'account',label:'Hesap'},{key:'openingDebit',label:'Açılış borç'},{key:'openingCredit',label:'Açılış alacak'},{key:'debit',label:'Dönem borç'},{key:'credit',label:'Dönem alacak'},{key:'balanceDebit',label:'Borç bakiyesi'},{key:'balanceCredit',label:'Alacak bakiyesi'}],
  'finance-cash-flow-report': [{key:'currencyCode',label:'Döviz'},{key:'openingBalance',label:'Dönem başı'},{key:'operating',label:'İşletme'},{key:'investing',label:'Yatırım'},{key:'financing',label:'Finansman'},{key:'internalTransfers',label:'İç transfer'},{key:'unclassified',label:'Sınıflandırılmamış'},{key:'openingAdjustments',label:'Açılış düzeltmesi'},{key:'netChange',label:'Net değişim'},{key:'closingBalance',label:'Dönem sonu'},{key:'reconciles',label:'Kontrol'}],
  'finance-fx-revaluations': [{key:'code',label:'Fiş'},{key:'asOfDate',label:'Dönem sonu'},{key:'lineCount',label:'Döviz kalemi'},{key:'totalDebit',label:'Borç'},{key:'totalCredit',label:'Alacak'},{key:'actions',label:'İşlem'}],
  'finance-fx-revaluation-lines': [{key:'invoice',label:'Fatura / cari'},{key:'direction',label:'Yön'},{key:'outstandingAmount',label:'Açık tutar'},{key:'invoiceDateRate',label:'Fatura kuru'},{key:'closingRate',label:'Dönem kuru'},{key:'adjustmentBase',label:'Değerleme farkı'},{key:'debitBaseAmount',label:'Borç tutarı'},{key:'debitAccount',label:'Borç hesabı'},{key:'creditBaseAmount',label:'Alacak tutarı'},{key:'creditAccount',label:'Alacak hesabı'}]
}

export const auditGridDefaults: FinanceGridColumn[] = [
  {key:'occurredAt',label:'Tarih / saat'}, {key:'user',label:'Kullanıcı'},
  {key:'userId',label:'Kullanıcı kimliği'}, {key:'action',label:'İşlem'},
  {key:'resource',label:'Kaynak'}, {key:'eventId',label:'Olay numarası'}
]

export const ledgerStatementLabels:Record<LedgerStatementSection,string>={Unclassified:'Sınıflandırılmadı',Asset:'Varlık',Liability:'Yükümlülük',Equity:'Özkaynak',Revenue:'Gelir',Expense:'Gider'}
