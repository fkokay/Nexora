import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ContractRegister from './components/ContractRegister';
import { statusLabel, type Contract } from './types';

afterEach(cleanup);

// Ticari sözleşmeler used to borrow the column / detail layout from credit-facilities.css. Krediler moved to the list
// type and those rules were removed there, so the screen now owns them; this pins both halves of that contract.
const contract = (id: string, code: string, status: Contract['status']): Contract => ({
  id,
  code,
  type: 'Sales',
  counterpartyId: `c-${id}`,
  counterpartyName: 'Ege Gıda Dağıtım A.Ş.',
  effectiveFrom: '2026-01-01',
  effectiveThrough: '2026-12-31',
  currencyCode: 'TRY',
  status,
  salesQuoteId: null,
  salesOrderId: null,
  purchaseSupplierQuoteId: null,
  purchaseOrderId: null,
  revision: 1,
  createdAt: '2026-01-01T09:00:00Z',
  updatedAt: '2026-01-01T09:00:00Z',
});

const contracts = [contract('k1', 'SZ-2026-001', 'Active'), contract('k2', 'SZ-2026-002', 'Suspended')];

function renderRegister() {
  const noop = vi.fn();
  return render(
    <ContractRegister
      contracts={contracts}
      visibleContracts={contracts}
      selected={contracts[0]}
      detail={{ contract: contracts[0], transitions: [] }}
      detailLoading={false}
      loading={false}
      today="2026-11-18"
      tab="summary"
      search=""
      typeFilter=""
      statusFilter=""
      labels={statusLabel}
      en={false}
      canEdit
      busy={false}
      tx={(value) => value}
      onSearchChange={noop}
      onTypeFilterChange={noop}
      onStatusFilterChange={noop}
      onRefresh={noop}
      onSelect={noop}
      onTabChange={noop}
      onTransition={noop}
      onClearFilters={noop}
      onCreate={noop}
    />,
  );
}

describe('Ticari sözleşmeler layout', () => {
  it('renders the list column and the selected contract with the layout classes', () => {
    const { container } = renderRegister();
    const layout = container.querySelector('.cf-layout.ctr-layout');
    expect(layout).not.toBeNull();
    expect(layout!.querySelector(':scope > .cf-list-column .cf-filters .cf-search')).not.toBeNull();
    expect(layout!.querySelectorAll('.cf-items .cf-item')).toHaveLength(2);
    expect(layout!.querySelector('.cf-item.is-selected')?.textContent).toContain('SZ-2026-001');
    expect(layout!.querySelector('.cf-state.is-active')).not.toBeNull();
    expect(layout!.querySelector('.cf-state.is-warning')).not.toBeNull();
    expect(layout!.querySelector('.cf-bar > i')).not.toBeNull();
    const detail = layout!.querySelector('.cf-detail');
    expect(detail?.querySelector('.cf-detail-head .cf-detail-title h2')?.textContent).toContain('SZ-2026-001');
    expect(detail?.querySelector('.cf-tabbody .cf-info')).not.toBeNull();
  });

  it('the screen stylesheet defines the layout itself, scoped to the contracts page', () => {
    const css = readFileSync(resolve(__dirname, 'commercial-contracts.css'), 'utf8');
    const rule = (selector: string) => {
      const start = css.indexOf(`${selector} {`);
      expect(start, selector).toBeGreaterThanOrEqual(0);
      return css.slice(start, css.indexOf('}', start));
    };
    const scope = '#root .cf-page.commercial-contracts-page';
    expect(rule(`${scope} .cf-layout`)).toMatch(/display:\s*grid/);
    expect(rule(`${scope} .cf-list-column`)).toMatch(/display:\s*flex/);
    expect(rule(`#root .app-shell .cf-page.commercial-contracts-page .cf-item.is-selected`)).toMatch(/--cf-select-line/);
    expect(rule(`${scope} .cf-state`)).toMatch(/border-radius:\s*999px/);
    expect(rule(`${scope} .cf-bar`)).toMatch(/--cf-bar-track/);
    expect(rule(`${scope} .cf-detail-head`)).toMatch(/display:\s*grid/);
    expect(rule(scope)).toMatch(/--cf-select-line:\s*var\(--nx-/);
  });

  it('the page no longer depends on the credit stylesheet', () => {
    const page = readFileSync(resolve(__dirname, '..', 'CommercialContractsPage.tsx'), 'utf8');
    expect(page).toContain('./commercial-contracts/commercial-contracts.css');
    expect(page).not.toContain('credit-facilities.css');
  });
});
