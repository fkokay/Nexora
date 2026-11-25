import { describe, expect, it } from 'vitest';
import { LEDGER_SOURCE_LABELS, ledgerSourceTarget } from './customerLedgerSource';

describe('ledgerSourceTarget', () => {
  it.each([
    ['SalesInvoice', 'sales-invoices', { invoiceId: 'x' }],
    ['CustomerCollection', 'sales-invoices', { invoiceId: 'x', tab: 'transactions' }],
    ['SalesReturn', 'sales-returns', { returnId: 'x' }],
    ['PurchaseInvoice', 'sales-purchase-invoices', { invoiceId: 'x' }],
    ['SupplierPayment', 'sales-purchase-invoices', { invoiceId: 'x' }],
    ['PurchaseInvoiceDraft', 'sales-purchase-invoice-drafts', { draftId: 'x' }],
    ['SupplierReturn', 'sales-purchase-returns', { returnId: 'x' }],
  ])('%s opens %s', (sourceType, page, params) => {
    expect(ledgerSourceTarget({ sourceType, sourceOpenId: 'x' })).toEqual({ page, params });
    expect(LEDGER_SOURCE_LABELS[sourceType]).toBeTruthy();
  });

  it('is null without a document or without the record to open', () => {
    expect(ledgerSourceTarget({ sourceType: null, sourceOpenId: null })).toBeNull();
    expect(ledgerSourceTarget({ sourceType: 'CustomerCollection', sourceOpenId: null })).toBeNull();
    expect(ledgerSourceTarget({ sourceType: 'Unknown', sourceOpenId: 'x' })).toBeNull();
  });
});
