import type { ReactNode } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandProvider } from '../commands/CommandProvider';
import { KeepAliveViews } from '../WorkspaceComponents';
import TenantCustomPage from '../TenantCustomPage';
import { CanvasAnchorContext } from '../designer-canvas/anchorContext';
import { ANCHOR_ATTRIBUTE } from '../designer-canvas/canvasProtocol';

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../erpApi', () => ({ api }));

const anchors = () => Array.from(document.querySelectorAll(`template[${ANCHOR_ATTRIBUTE}]`));

function setup(components: unknown[], canvas: boolean) {
  api.mockImplementation(async (endpoint: string) => {
    if (endpoint.endsWith('/published')) {
      return {
        id: 'p', code: 'p', name: 'Sayfa', revision: 1, forms: [], rights: { view: true, insert: true, update: true, delete: true },
        definitionJson: JSON.stringify({ schemaVersion: 2, components, queries: [] }),
      };
    }
    return {};
  });
  const wrap = (node: ReactNode) => <CanvasAnchorContext.Provider value={canvas}>{node}</CanvasAnchorContext.Provider>;
  return render(wrap(
    <CommandProvider>
      <KeepAliveViews activeKey="v" openKeys={['v']}><TenantCustomPage code="p" token="t" /></KeepAliveViews>
    </CommandProvider>,
  ));
}

const definition = [
  { id: 'h1', type: 'heading', props: { title: 'Başlık' } },
  { id: 'tb', type: 'tabs', props: { tabs: ['Genel=t1'] } },
  { id: 't1', type: 'text', props: { text: 'İç metin' } },
];

beforeEach(() => { api.mockReset(); });
afterEach(cleanup);

describe('tasarımcı tuvali işaretçileri', () => {
  it('tuval modunda her bileşenin önünde işaretçi var', async () => {
    setup(definition, true);
    await screen.findByText('İç metin');
    const ids = anchors().map((a) => a.getAttribute(ANCHOR_ATTRIBUTE));
    expect(ids).toContain('h1');
    expect(ids).toContain('t1');
    expect(ids[0]).toBe('h1');
    const heading = anchors().find((a) => a.getAttribute(ANCHOR_ATTRIBUTE) === 'h1')!;
    expect(heading.nextElementSibling?.matches('h2.tenant-page-heading')).toBe(true);
  });

  it('normal modda işaretçi yok', async () => {
    setup(definition, false);
    await screen.findByText('İç metin');
    expect(anchors()).toHaveLength(0);
  });

  it('görünmeyen bileşen için işaretçi yok', async () => {
    setup([
      { id: 'h1', type: 'heading', props: { title: 'Görünür' } },
      { id: 'h2', type: 'heading', props: { title: 'Gizli', visibleWhen: "kullanici.rol == 'Yok'" } },
    ], true);
    await screen.findByText('Görünür');
    expect(anchors().map((a) => a.getAttribute(ANCHOR_ATTRIBUTE))).toEqual(['h1']);
  });
});
