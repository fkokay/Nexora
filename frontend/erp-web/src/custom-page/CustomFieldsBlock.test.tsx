import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CustomFieldsBlock } from './CustomFieldsBlock';
import { customFieldSpecs } from './customFields';

afterEach(cleanup);

const specs = customFieldSpecs([
  { code: 'RENK', label: 'Renk', dataType: 'Text', isRequired: true, maxLength: 20 },
  { code: 'AGIRLIK', label: 'Ağırlık', dataType: 'Decimal', isRequired: false },
  { code: 'URETIM', label: 'Üretim tarihi', dataType: 'Date', isRequired: false },
  { code: 'IHRAC', label: 'İhraç', dataType: 'Boolean', isRequired: false },
]);

function block(overrides: Partial<Parameters<typeof CustomFieldsBlock>[0]> = {}) {
  const onChange = vi.fn<(code: string, value: string) => void>();
  render(<CustomFieldsBlock id="ozel" title="Özel alanlar" columns={2} specs={specs} values={{ RENK: 'Mavi', AGIRLIK: '', URETIM: '', IHRAC: 'false' }}
    onChange={onChange} errors={{}} disabled={false} loading={false} style={{}} {...overrides} />);
  return onChange;
}

describe('CustomFieldsBlock', () => {
  it('renders inputs by dataType', () => {
    block();
    const renk = screen.getByLabelText(/Renk/) as HTMLInputElement;
    expect(renk.id).toBe('page-cf-ozel-RENK');
    expect(renk.type).toBe('text');
    expect(renk.maxLength).toBe(20);
    expect(renk.value).toBe('Mavi');
    expect((screen.getByLabelText('Ağırlık') as HTMLInputElement).type).toBe('number');
    expect((screen.getByLabelText('Ağırlık') as HTMLInputElement).step).toBe('any');
    expect((screen.getByLabelText('Üretim tarihi') as HTMLInputElement).type).toBe('date');
    expect((screen.getByLabelText('İhraç') as HTMLInputElement).type).toBe('checkbox');
  });

  it('checkbox writes true/false strings', () => {
    const onChange = block();
    fireEvent.click(screen.getByLabelText('İhraç'));
    expect(onChange).toHaveBeenCalledWith('IHRAC', 'true');
    cleanup();
    const second = block({ values: { RENK: '', AGIRLIK: '', URETIM: '', IHRAC: 'true' } });
    fireEvent.click(screen.getByLabelText('İhraç'));
    expect(second).toHaveBeenCalledWith('IHRAC', 'false');
  });

  it('required error message', () => {
    block({ errors: { RENK: 'Bu alan zorunludur.' } });
    expect(screen.getByText('Bu alan zorunludur.')).toBeTruthy();
    expect(screen.getByLabelText(/Renk/).getAttribute('aria-invalid')).toBe('true');
  });

  it('empty definitions text', () => {
    block({ specs: [] });
    expect(screen.getByText('Tanımlı özel alan yok.')).toBeTruthy();
  });
});
