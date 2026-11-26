import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandProvider } from '../commands/CommandProvider';
import TenantCustomPage from '../TenantCustomPage';

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../erpApi', () => ({ api }));

const result = { rows: [{ a: 112, b: 100, goal: 200, done: 130 }], rowCount: 1, columns: [{ code: 'a', label: 'A' }], truncated: false };
const queries = [{ id: 'qk', name: 'kart', kind: 'read', sql: 'SELECT 1', parameters: [], runOn: 'load' }];
let components: unknown[] = [];

beforeEach(() => {
  api.mockReset();
  api.mockImplementation(async (endpoint: string) => endpoint.endsWith('/published')
    ? { id: 'p', code: 'p', name: 'Sayfa', revision: 1, forms: [], rights: { view: true }, definitionJson: JSON.stringify({ schemaVersion: 2, components, queries }) }
    : result);
});
afterEach(cleanup);

const show = async (list: unknown[], ready: string) => {
  components = list;
  const view = render(<CommandProvider><TenantCustomPage code="p" token="t" /></CommandProvider>);
  await screen.findByText(ready);
  return view;
};

describe('bileşen paneli özellikleri', () => {
  it('metric shows compare line and lg size', async () => {
    const { container } = await show([{ id: 'm', type: 'metric', props: { title: 'Ciro', value: '{{kart.rows[0].a}}', compareValue: '{{kart.rows[0].b}}', size: 'lg' } }], 'Ciro');
    await waitFor(() => expect(container.querySelector('.tenant-metric-compare')?.textContent).toBe('▲ %12 önceki değere göre'));
    expect(container.querySelector('.tenant-page-metric')!.classList.contains('is-lg')).toBe(true);
  });

  it('metric without usable compare shows no compare line', async () => {
    const { container } = await show([{ id: 'm', type: 'metric', props: { title: 'Ciro', value: '{{kart.rows[0].a}}', compareValue: '0' } }], 'Ciro');
    await waitFor(() => expect(container.querySelector('.tenant-page-metric strong')?.textContent).toBe('112'));
    expect(container.querySelector('.tenant-metric-compare')).toBeNull();
  });

  it('progress uses total when given and shows value over total', async () => {
    const { container } = await show([{ id: 'p1', type: 'progress', props: { title: 'Hedef', value: '{{kart.rows[0].done}}', progressTotal: '{{kart.rows[0].goal}}' } }], 'Hedef');
    await waitFor(() => expect(container.querySelector('.tenant-page-progress')!.textContent).toContain('130 / 200'));
    expect((container.querySelector('progress') as HTMLProgressElement).value).toBe(65);
    expect(container.querySelector('.tenant-page-progress')!.textContent).toContain('65%');
  });

  it('progress without total keeps value as percent', async () => {
    const { container } = await show([{ id: 'p1', type: 'progress', props: { title: 'Hedef', value: 40 } }], 'Hedef');
    expect((container.querySelector('progress') as HTMLProgressElement).value).toBe(40);
    expect(container.querySelector('.tenant-page-progress')!.textContent).not.toContain(' / ');
  });

  it('text align center applies to heading text label section', async () => {
    await show([
      { id: 'h', type: 'heading', props: { text: 'Başlık', textAlign: 'center' } },
      { id: 't', type: 'text', props: { text: 'Paragraf', textAlign: 'center' } },
      { id: 'l', type: 'label', props: { text: 'Etiket', textAlign: 'center' } },
      { id: 's', type: 'section', props: { title: 'Bölüm', textAlign: 'center' } },
      { id: 'h2', type: 'heading', props: { text: 'Sol' } },
    ], 'Başlık');
    for (const text of ['Başlık', 'Paragraf', 'Etiket']) expect(screen.getByText(text).style.textAlign).toBe('center');
    expect((screen.getByText('Bölüm').closest('section') as HTMLElement).style.textAlign).toBe('center');
    expect(screen.getByText('Sol').style.textAlign).toBe('');
  });

  it('alert with items renders list instead of text', async () => {
    const { container } = await show([{ id: 'a', type: 'alert', props: { title: 'Not', text: 'gizli metin', items: ['bir', 'iki'] } }], 'Not');
    expect(container.querySelectorAll('.tenant-page-alert li').length).toBe(2);
    expect(screen.queryByText('gizli metin')).toBeNull();
  });

  it('alert with blank items skips them', async () => {
    const { container } = await show([
      { id: 'a', type: 'alert', props: { title: 'Not', text: 'gizli', items: ['bir', '  ', '', 'iki'] } },
      { id: 'b', type: 'alert', props: { title: 'Bos', text: 'gorunur', items: ['', '   '] } },
    ], 'Not');
    expect(container.querySelectorAll('.tenant-page-alert')[0].querySelectorAll('li').length).toBe(2);
    expect(container.querySelectorAll('.tenant-page-alert')[1].querySelector('ul')).toBeNull();
    expect(screen.getByText('gorunur')).toBeTruthy();
  });

  it('card with items renders list', async () => {
    const { container } = await show([{ id: 'c', type: 'card', props: { title: 'Kart', items: ['x'] } }], 'Kart');
    expect(container.querySelectorAll('.tenant-page-card li').length).toBe(1);
  });

  it('dismissible alert hides after Kapat', async () => {
    await show([{ id: 'a', type: 'alert', props: { title: 'Not', text: 'metin', dismissible: true } }], 'Not');
    fireEvent.click(screen.getByRole('button', { name: 'Kapat' }));
    expect(screen.queryByText('Not')).toBeNull();
  });

  it('components without new props render as before', async () => {
    const { container } = await show([
      { id: 'a', type: 'alert', props: { title: 'Not', text: 'metin' } },
      { id: 'm', type: 'metric', props: { title: 'Ciro', value: '{{kart.rows[0].a}}' } },
      { id: 'p1', type: 'progress', props: { title: 'Hedef', value: 40 } },
      { id: 'h', type: 'heading', props: { text: 'Başlık' } },
    ], 'Not');
    await waitFor(() => expect(container.querySelector('.tenant-page-metric strong')?.textContent).toBe('112'));
    expect(container.querySelector('.tenant-page-alert')!.innerHTML).toBe('<strong>Not</strong><p>metin</p>');
    expect(container.querySelector('.tenant-page-alert button')).toBeNull();
    expect(container.querySelector('.tenant-metric-compare')).toBeNull();
    expect(container.querySelector('.tenant-page-metric')!.className).not.toContain('is-lg');
    expect(container.querySelector('.tenant-page-progress')!.innerHTML).toBe('<div><strong>Hedef</strong><span>40%</span></div><progress max="100" value="40" aria-label="Hedef"></progress>');
    expect((screen.getByText('Başlık') as HTMLElement).style.textAlign).toBe('');
  });
});
