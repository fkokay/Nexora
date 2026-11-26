// Serbest gövde testlerinin ortak sayfası: iki eylem, üç kolonlu "Özet" bölümü (metin, gösterge, liste) ve boş bir bölüm.

export const freeQueries = [
  { id: 'liste', name: 'liste', kind: 'read', runOn: 'load', sql: 'SELECT Belge FROM T', parameters: [] },
];

export const freeComponents = [
  { id: 'b_aktar', type: 'button', props: { slot: 'actions', text: 'Dışa aktar', actionType: 'query', queryId: 'liste' } },
  { id: 'b_yenile', type: 'button', props: { slot: 'actions', text: 'Yenile', actionType: 'query', queryId: 'liste' } },
  { id: 'blk1', type: 'section', props: { slot: 'block', title: 'Özet', columns: 3, members: ['m_metin', 'm_gosterge', 'm_liste'] } },
  { id: 'blk2', type: 'section', props: { slot: 'block', title: 'Boş bölüm', columns: 2, members: [] } },
  { id: 'm_metin', type: 'text', props: { slot: 'item', text: 'Merhaba serbest gövde' } },
  { id: 'm_gosterge', type: 'metric', props: { slot: 'item', title: 'Açık teklif', value: '12' } },
  { id: 'm_liste', type: 'dataTable', name: 'teklifler', props: { slot: 'item', query: 'liste', title: 'Teklifler', columns: ['Belge'] } },
];

/** Sekmeli sürüm: "Genel" Özet'i, "Diğer" boş bölümü taşır. */
export const freeTabbedComponents = [
  ...freeComponents,
  { id: 't', type: 'tabs', props: { slot: 'tabs', tabs: ['Genel=blk1', 'Diğer=blk2'], tabParam: 'sekme' } },
];

export const freeDefinition = (components: unknown[] = freeComponents) => ({ schemaVersion: 2, template: { name: 'free' }, queries: freeQueries, components });
