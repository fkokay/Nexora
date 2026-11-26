// Kayıt kartı testlerinin ortak sayfası: özet, Kaydet / Ekstre al / Sil, iki sekme (bölüm + not, satır tablosu).

export const recordQueries = [
  { id: 'kayit', name: 'kayit', kind: 'read', runOn: 'load', sql: 'SELECT * FROM C WHERE Code = @kod', parameters: [{ name: 'kod', binding: '{{sayfa.parametre.kod}}', type: 'text' }] },
  { id: 'hareket', name: 'hareket', kind: 'read', runOn: 'load', sql: 'SELECT Belge FROM H', parameters: [] },
  { id: 'ekle', name: 'ekle', kind: 'insert', sql: 'INSERT INTO C DEFAULT VALUES', parameters: [] },
  { id: 'guncelle', name: 'guncelle', kind: 'update', sql: 'UPDATE C SET Name = Name', parameters: [] },
  { id: 'sil', name: 'sil', kind: 'delete', sql: 'DELETE FROM C', parameters: [] },
];

export const recordComponents = [
  { id: 'b_sil', type: 'button', props: { slot: 'actions', text: 'Sil', actionType: 'query', queryId: 'sil' } },
  { id: 'b_ekstre', type: 'button', props: { slot: 'actions', text: 'Ekstre al', actionType: 'query', queryId: 'hareket' } },
  { id: 'b_kaydet', type: 'button', props: { slot: 'actions', text: 'Kaydet', actionType: 'sequence', saveSequence: ['ekle', 'guncelle'],
    sequenceWhen: ['ekle=kayit.rows[0].Code == null', 'guncelle=kayit.rows[0].Code != null'] } },
  { id: 'h', type: 'recordHeader', props: { slot: 'summary', title: '{{kayit.rows[0].Name}}', subtitle: '{{kayit.rows[0].Code}}', fields: ['Bakiye={{kayit.rows[0].Balance}}'] } },
  { id: 't', type: 'tabs', props: { slot: 'tabs', tabs: ['Genel=s1,n1', 'Hareketler=l1'] } },
  { id: 's1', type: 'formCard', props: { slot: 'section', title: 'Kimlik', columns: 3, inputs: ['kod', 'ad', 'adres'], recordKey: '{{kayit.rows[0].Code}}', trackChanges: true } },
  { id: 'kod', type: 'input', name: 'kod', props: { slot: 'field', inputType: 'text', label: 'Cari kodu', defaultValue: '{{kayit.rows[0].Code}}' } },
  { id: 'ad', type: 'input', name: 'ad', props: { slot: 'field', inputType: 'text', label: 'Unvan', defaultValue: '{{kayit.rows[0].Name}}' } },
  // Katalogdan düşen kolon: `Eksik` sorgunun sonucunda yok.
  { id: 'adres', type: 'input', name: 'adres', props: { slot: 'field', inputType: 'text', multiline: true, label: 'Adres', defaultValue: '{{kayit.rows[0].Eksik}}' } },
  { id: 'n1', type: 'text', props: { slot: 'note', text: 'Kredi limiti değişiklikleri finans onayına gider.' } },
  { id: 'l1', type: 'dataTable', name: 'hareketler', props: { slot: 'lines', query: 'hareket', title: 'Son hareketler', columns: ['Belge'] } },
];

export const recordRow = { Code: 'C-1001', Name: 'Akdeniz Gıda A.Ş.', Balance: 48250 };

export const recordDefinition = (components: unknown[] = recordComponents) => ({ schemaVersion: 2, template: { name: 'record' }, queries: recordQueries, components });
