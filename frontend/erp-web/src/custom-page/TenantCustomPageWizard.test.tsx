import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { ConfirmDialogHost } from '../confirmDialog';
import { KeepAliveViews } from '../WorkspaceComponents';
import TenantCustomPage from '../TenantCustomPage';
import { activeStepIndex, stepLabels, StepsIndicator } from './StepsIndicator';
import { RecordHeader, recordHeaderFields, templateText } from './RecordHeader';
import { assignmentsValid, parseAssignments, resolveAssignments } from './setInputAction';

// Seçim → ayrıntı (sihirbaz) parçaları: `steps`, `recordHeader`, `setInput` düğmesi, `rowOpenAction`, gizli giriş.

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../erpApi', () => ({ api }));

const token = `h.${btoa(JSON.stringify({ sub: 'u', role: 'TenantAdmin' })).replace(/=+$/, '')}.s`;
const rows = [{ id: 'r1', kod: 'A-1', ad: 'Alfa' }, { id: 'r2', kod: 'B-2', ad: 'Beta' }];

function setup(components: unknown[], queries: unknown[] = []) {
  api.mockImplementation(async (endpoint: string) => {
    if (endpoint.endsWith('/published')) {
      return {
        id: 'p', code: 'p', name: 'Sayfa', revision: 1, forms: [], rights: { view: true, insert: false, update: false, delete: false },
        definitionJson: JSON.stringify({ schemaVersion: 2, components, queries }),
      };
    }
    if (/queries\/liste\/run/.test(endpoint)) {
      return { columns: [{ code: 'id', label: 'Kimlik' }, { code: 'kod', label: 'Kod' }, { code: 'ad', label: 'Ad' }], rows, rowCount: rows.length, truncated: false };
    }
    throw new Error(`unexpected ${endpoint}`);
  });
  return render(
    <CommandProvider>
      <ActionBar locale="tr" />
      <KeepAliveViews activeKey="v" openKeys={['v']}><TenantCustomPage code="p" token={token} /></KeepAliveViews>
      <ConfirmDialogHost />
    </CommandProvider>,
  );
}

beforeEach(() => { api.mockReset(); });
afterEach(() => cleanup());

describe('setInput atamaları (saf)', () => {
  it('splits on the first "=", allows an empty template and keeps the last duplicate', () => {
    expect(parseAssignments(['secim={{t.seciliSatir.id}}', 'not=a=b', 'secim=', 'bozuk', '=x', 3])).toEqual([
      { inputId: 'not', template: 'a=b' }, { inputId: 'secim', template: '' },
    ]);
    expect(parseAssignments(Array.from({ length: 10 }, (_, index) => `g${index}=x`))).toHaveLength(8);
  });

  it('is valid only with at least one assignment and every target an input of the page', () => {
    const inputs = new Set(['secim', 'acik']);
    expect(assignmentsValid(['secim=1'], inputs)).toBe(true);
    expect(assignmentsValid(['secim=1', 'yok=2'], inputs)).toBe(false);
    expect(assignmentsValid([], inputs)).toBe(false);
  });

  it('resolves every template against the same scope; empty clears and checkboxes become booleans', () => {
    const scope = { t: { seciliSatir: { id: 'r1' } } };
    expect(resolveAssignments(['secim={{t.seciliSatir.id}}', 'acik=true', 'kapali=', 'diger={{yok.value}}'], scope, (id) => id === 'acik' || id === 'kapali'))
      .toEqual([{ inputId: 'secim', raw: 'r1' }, { inputId: 'acik', raw: true }, { inputId: 'kapali', raw: false }, { inputId: 'diger', raw: '' }]);
  });
});

describe('Adımlar (steps)', () => {
  it('takes the LAST step whose condition holds, or 0', () => {
    const when = ['secim.value == null', 'secim.value != null', "secim.value == 'son'"];
    expect(activeStepIndex(3, when, { secim: { value: '' } })).toBe(0);
    expect(activeStepIndex(3, when, { secim: { value: 'x' } })).toBe(1);
    expect(activeStepIndex(3, when, { secim: { value: 'son' } })).toBe(2);
    expect(activeStepIndex(3, ['false', 'false', 'false'], {})).toBe(0);
    expect(stepLabels([' Bir ', '', 3, 'İki'])).toEqual(['Bir', 'İki']);
  });

  it('marks earlier steps done, the active one aria-current and later ones muted', () => {
    render(<StepsIndicator labels={['Seç', 'İncele', 'Onayla']} active={1} />);
    const list = screen.getByRole('list', { name: 'Adımlar' });
    expect(list.tagName).toBe('OL');
    const items = within(list).getAllByRole('listitem');
    expect(items.map((item) => item.className.split(' ').pop())).toEqual(['is-done', 'is-active', 'is-next']);
    expect(items.map((item) => item.getAttribute('aria-current'))).toEqual([null, 'step', null]);
    expect(items[2].textContent).toContain('3');
  });
});

describe('Kayıt özeti (recordHeader)', () => {
  const scope = { kart: { rows: [{ kod: 'KLM', miktar: 1100, deger: 5500, birim: 'EA', para: 'TRY', bos: null }] } };

  it('formats fields, appends units and shows "—" for empty values', () => {
    expect(recordHeaderFields({
      fields: ['Mevcut={{kart.rows[0].miktar}}', 'Değer={{kart.rows[0].deger}}', 'Boş={{kart.rows[0].bos}}', 'Sabit=Yerinde', 'bozuk'],
      fieldFormats: ['Mevcut=number', 'Değer=money', 'Boş=number', 'Sabit=tarih'],
      fieldUnits: ['Mevcut={{kart.rows[0].birim}}', 'Değer={{kart.rows[0].para}}', 'Boş={{kart.rows[0].birim}}'],
    }, scope)).toEqual([
      { label: 'Mevcut', text: '1.100 EA' }, { label: 'Değer', text: '5.500,00 TRY' }, { label: 'Boş', text: '—' }, { label: 'Sabit', text: 'Yerinde' },
    ]);
    expect(recordHeaderFields({ fields: ['Mevcut={{yok.rows[0].miktar}}'], fieldUnits: ['Mevcut={{yok.birim}}'] }, {})).toEqual([{ label: 'Mevcut', text: '—' }]);
  });

  it('drops a template whose bindings are all empty (no half " · birim" line while loading)', () => {
    expect(templateText('{{kart.rows[0].kod}} · birim {{kart.rows[0].birim}}', scope)).toBe('KLM · birim EA');
    expect(templateText('{{kart.rows[0].kod}} · birim {{kart.rows[0].birim}}', {})).toBe('');
    expect(templateText('Sabit başlık', {})).toBe('Sabit başlık');
  });

  it('draws icon, title, subtitle, key/value pairs and the buttons; empty title is "—"', () => {
    render(<RecordHeader icon="box" title="" subtitle="Kalem" fields={[{ label: 'Mevcut', text: '5 EA' }]} buttons={<button type="button">Değiştir</button>} />);
    const header = document.querySelector('.tenant-page-record-header') as HTMLElement;
    expect(header.querySelector('.tenant-page-record-header-icon svg')).not.toBeNull();
    expect(within(header).getByText('—').tagName).toBe('B');
    expect(within(header).getByRole('term').textContent).toBe('Mevcut');
    expect(within(header).getByRole('definition').textContent).toBe('5 EA');
    expect(within(header).getByRole('button', { name: 'Değiştir' })).toBeTruthy();
  });
});

describe('Sihirbaz çalışma zamanı', () => {
  const page = [
    { id: 'secim', type: 'input', name: 'secim', props: { inputType: 'text', label: 'Seçim', hidden: true, required: true } },
    { id: 'adimlar', type: 'steps', name: 'adimlar', props: { steps: ['Seç', 'Ayrıntı'], activeWhen: ['secim.value == null', 'secim.value != null'] } },
    { id: 'git', type: 'button', name: 'git', props: { text: 'Aç ›', actionType: 'setInput', assignments: ['secim={{tablo.seciliSatir.kod}}'] } },
    { id: 'tablo', type: 'dataTable', name: 'tablo', props: { query: 'liste', columns: ['kod', 'ad'], rowActions: ['git'], rowOpenAction: 'git', visibleWhen: 'secim.value == null' } },
    { id: 'geri', type: 'button', name: 'geri', props: { text: '‹ Geri', actionType: 'setInput', assignments: ['secim='] } },
    { id: 'ozet', type: 'recordHeader', name: 'ozet', props: { visibleWhen: 'secim.value != null', icon: 'box', title: '{{secim.value}}', subtitle: 'Seçili kayıt', fields: ['Kod={{secim.value}}'], buttons: ['geri'] } },
  ];
  const queries = [{ id: 'liste', name: 'liste', kind: 'read', runOn: 'load', parameters: [] }];
  const header = () => document.querySelector('.tenant-page-record-header') as HTMLElement | null;
  const active = () => within(screen.getByRole('list', { name: 'Adımlar' })).getAllByRole('listitem').find((item) => item.getAttribute('aria-current') === 'step')?.textContent;

  it('a row action writes the hidden input, a header button clears it; header buttons are not drawn at top level', async () => {
    setup(page, queries);
    await screen.findByText('A-1');
    expect(document.getElementById('page-input-secim')).toBeNull();
    expect(active()).toContain('Seç');
    // The header-owned button is not on the page while the header is hidden.
    expect(screen.queryByRole('button', { name: '‹ Geri' })).toBeNull();

    const row = screen.getByText('B-2').closest('tr') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: 'Aç ›' }));
    await waitFor(() => expect(header()).not.toBeNull());
    expect(within(header()!).getByText('B-2', { selector: 'b' })).toBeTruthy();
    expect(active()).toContain('Ayrıntı');
    expect(screen.queryByText('A-1')).toBeNull();
    expect(screen.getAllByRole('button', { name: '‹ Geri' })).toHaveLength(1);

    fireEvent.click(within(header()!).getByRole('button', { name: '‹ Geri' }));
    await screen.findByText('A-1');
    expect(header()).toBeNull();
    expect(active()).toContain('Seç');
  });

  it('rowOpenAction runs the button on double-click and on Enter', async () => {
    setup(page, queries);
    fireEvent.doubleClick((await screen.findByText('A-1')).closest('tr') as HTMLElement);
    await waitFor(() => expect(header()?.textContent).toContain('A-1'));
    fireEvent.click(within(header()!).getByRole('button', { name: '‹ Geri' }));
    fireEvent.keyDown((await screen.findByText('B-2')).closest('tr') as HTMLElement, { key: 'Enter' });
    await waitFor(() => expect(header()?.textContent).toContain('B-2'));
  });

  it('a setInput button with an unknown input has no action and is drawn disabled', async () => {
    setup([{ id: 'b', type: 'button', name: 'b', props: { text: 'Ata', actionType: 'setInput', assignments: ['yok=1'] } }]);
    expect(((await screen.findByRole('button', { name: 'Ata' })) as HTMLButtonElement).disabled).toBe(true);
  });
});
