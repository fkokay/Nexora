import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import catalog from './hrEmployeeCreateOperations.fixture.json';
import { createHarness, T } from './purchasingStandardHarness';

// "Personel kartı" standart tanımı (hr-employee-create.json): yeni ve düzenleme tek tanım. `{{sayfa.parametre.employeeId}}`
// boşsa yeni kayıt (ik.personel.olustur), doluysa o kayıt düzenlenir (ik.personel.getir + ik.personel.guncelle).

vi.mock('../erpApi', () => ({ api: vi.fn() }));

const KEY = 'hr-employee-create';
const E1 = '44444444-0000-0000-0000-000000000001';
const NEW = '44444444-0000-0000-0000-0000000000aa';
const U1 = '55555555-0000-0000-0000-000000000001';
const h = createHarness(KEY, catalog);

const card = (extra: Record<string, unknown> = {}) => ({
  id: E1, personnelCode: 'P-0001', fullName: 'Ayşe Yılmaz', department: 'Depo', jobTitle: 'Operatör', employmentCategory: 'Mavi yaka',
  workEmail: 'ayse@firma.com.tr', hireDate: '2024-03-01', terminationDate: null, status: 'Active', userId: U1, rowVersion: 'rv-1', ...extra,
});
const respond = (path: string, method: string) => {
  if (method === 'GET' && path === `/api/hr/employees/${E1}`) return card();
  if (method === 'POST' && path === '/api/hr/employees') return { ...card(), id: NEW };
  if (method === 'PUT' && path === `/api/hr/employees/${E1}`) return card();
  return undefined;
};
const today = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; };
const input = (id: string) => document.getElementById(`page-input-${id}`) as HTMLInputElement;
const type = (id: string, value: string) => fireEvent.change(input(id), { target: { value } });
const title = () => document.querySelector('.tenant-custom-page-header h1, .list-v2-title h1')?.textContent;
const posts = () => h.writes().filter((call) => call.method === 'POST' && call.url === '/api/hr/employees');
const puts = () => h.writes().filter((call) => call.method === 'PUT');

const openNew = async () => {
  h.setup(respond);
  await waitFor(() => expect(input('kod')).toBeTruthy(), T);
  await h.ready('save');
};
const openCard = async () => {
  h.setup(respond, { params: { employeeId: E1 } });
  await waitFor(() => expect(input('ad').value).toBe('Ayşe Yılmaz'), T);
};

beforeEach(() => h.before());
afterEach(() => h.after(['hr-employees']));

describe('Personel kartı standart tanımı', { timeout: 30000 }, () => {
  it('uses only operations from the catalog fixture', () => h.usesOnlyCatalog());

  it('new: title, hire date today, linked user GUID input, no termination date and no card read', async () => {
    await openNew();
    expect(title()).toBe('Yeni personel');
    expect(input('iseGirisYeni').value).toBe(today());
    expect(input('istenCikis')).toBeNull();
    expect(input('bagliKullanici')).toBeTruthy();
    expect(h.state.calls.filter((call) => call.url.startsWith('/api/hr/employees'))).toEqual([]);
  });

  it('new: posts the body without rowVersion and goes back to the list with refresh', async () => {
    await openNew();
    type('kod', 'p-0003');
    type('ad', 'Zeynep Demir');
    type('departman', 'Muhasebe');
    type('isEpostasi', 'zeynep@firma.com.tr');
    type('bagliKullanici', U1);
    fireEvent.click(h.command('save'));
    await waitFor(() => expect(posts()).toHaveLength(1), T);
    const body = h.bodyOf(posts()[0]);
    expect(body).toMatchObject({ personnelCode: 'P-0003', fullName: 'Zeynep Demir', department: 'Muhasebe', workEmail: 'zeynep@firma.com.tr',
      hireDate: today(), userId: U1 });
    expect(body).not.toHaveProperty('rowVersion');
    expect(puts()).toEqual([]);
    await waitFor(() => expect(h.state.navigations).toHaveLength(1), T);
    expect(h.state.navigations[0]).toMatchObject({ page: 'hr-employees', replace: true, refresh: true });
  });

  it('new: an employee without e-mail posts workEmail null (optional text sent as null, not "")', async () => {
    await openNew();
    type('kod', 'p-0004');
    type('ad', 'Ali Veli');
    fireEvent.click(h.command('save'));
    await waitFor(() => expect(posts()).toHaveLength(1), T);
    const body = h.bodyOf(posts()[0]);
    expect(body).toMatchObject({ personnelCode: 'P-0004', fullName: 'Ali Veli', workEmail: null, department: null, userId: null });
  });

  it('every input has an accessible name from its label', async () => {
    await openNew();
    for (const name of ['Personel kodu', 'Ad soyad', 'Departman', 'Görev', 'Çalışan kategorisi', 'İş e-postası', 'Bağlı kullanıcı kimliği']) {
      expect(screen.getByRole('textbox', { name: new RegExp(`^${name}`) })).toBeTruthy();
    }
    expect(screen.getByLabelText(/^İşe giriş/)).toBe(input('iseGirisYeni'));
  });

  it('new: required fields block the save', async () => {
    await openNew();
    type('kod', 'P-9');
    fireEvent.click(h.command('save'));
    await h.settle(100);
    expect(posts()).toEqual([]);
  });

  it('Kaydet ve yeni (new only) creates and stays on an empty card', async () => {
    await openNew();
    type('kod', 'P-A');
    type('ad', 'Birinci');
    fireEvent.click(await h.menuItem(/Kaydet ve yeni/));
    await waitFor(() => expect(posts()).toHaveLength(1), T);
    await waitFor(() => expect(input('kod').value).toBe(''), T);
    expect(h.state.navigations.filter((request) => request.page === 'hr-employees')).toEqual([]);
  });

  it('edit: loads the card, shows the termination date and the linked user read-only; PUT carries rowVersion and userId from the source', async () => {
    await openCard();
    await waitFor(() => expect(title()).toBe('Ayşe Yılmaz'), T);
    expect(input('kod').value).toBe('P-0001');
    expect(input('iseGiris').value).toBe('2024-03-01');
    expect(input('istenCikis')).toBeTruthy();
    expect(input('istenCikis').placeholder).toContain("Doluysa kayıt 'Ayrıldı' olur");
    expect(input('bagliKullanici')).toBeNull();
    expect(document.body.textContent).toContain(U1);
    await h.ready('save');
    type('gorev', 'Vardiya amiri');
    type('istenCikis', '2026-12-31');
    fireEvent.click(h.command('save'));
    await waitFor(() => expect(puts()).toHaveLength(1), T);
    expect(puts()[0].url).toBe(`/api/hr/employees/${E1}`);
    expect(h.bodyOf(puts()[0])).toMatchObject({ personnelCode: 'P-0001', fullName: 'Ayşe Yılmaz', department: 'Depo', jobTitle: 'Vardiya amiri',
      employmentCategory: 'Mavi yaka', workEmail: 'ayse@firma.com.tr', hireDate: '2024-03-01', terminationDate: '2026-12-31',
      userId: U1, rowVersion: 'rv-1' });
    expect(posts()).toEqual([]);
  });

  it('edit: no Kaydet ve yeni', async () => {
    await openCard();
    await h.ready('save');
    fireEvent.click(h.command('more'));
    await h.settle(50);
    expect(screen.queryByRole('menuitem', { name: /Kaydet ve yeni/ })).toBeNull();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
  });
});
