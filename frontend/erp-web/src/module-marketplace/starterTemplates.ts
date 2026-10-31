import type { ModuleStarterTemplate } from './types'

const rustModuleStarter = (action: string, expression: string) => `use serde_json::{json, Value};
use std::{alloc::{alloc, Layout}, ptr::copy_nonoverlapping, slice};

#[no_mangle]
pub extern "C" fn aierp_alloc(length: i32) -> i32 {
    if length <= 0 { return 0; }
    let Ok(layout) = Layout::from_size_align(length as usize, 8) else { return 0; };
    unsafe { alloc(layout) as i32 }
}

#[no_mangle]
pub extern "C" fn aierp_invoke(request_pointer: i32, request_length: i32) -> i64 {
    if request_pointer < 0 || request_length <= 0 { return 0; }
    let bytes = unsafe { slice::from_raw_parts(request_pointer as *const u8, request_length as usize) };
    let request: Value = serde_json::from_slice(bytes).unwrap_or(Value::Null);
    let action = request.get("action").and_then(Value::as_str).unwrap_or("");
    let data = request.get("data").cloned().unwrap_or(Value::Null);
    let result = match action {
        "${action}" => { ${expression} },
        _ => json!({ "error": "Unknown action" }),
    };
    let Ok(output) = serde_json::to_vec(&result) else { return 0; };
    let Ok(layout) = Layout::from_size_align(output.len(), 8) else { return 0; };
    let output_pointer = unsafe { alloc(layout) };
    if output_pointer.is_null() { return 0; }
    unsafe { copy_nonoverlapping(output.as_ptr(), output_pointer, output.len()); }
    (((output_pointer as u32 as u64) << 32) | output.len() as u64) as i64
}
`
export const moduleStarterTemplates: ModuleStarterTemplate[] = [
  {
    code: 'greeting', name: 'Selamlama modülü', description: 'Bir ad alır ve kişiselleştirilmiş bir karşılama mesajı döndürür.',
    manifest: { moduleCode: 'ornek.selamlama', displayName: 'Selamlama Modülü', version: '1.0.0', publisher: 'ornek', minimumPlatformVersion: '1.0.0', dependencies: [], permissions: [{ code: 'greeting.read', description: 'Selamlama ekranını kullanır.' }], menuEntries: [{ code: 'greeting.show', label: 'Selamlama', route: '/greeting', permissionCode: 'greeting.read', view: { inputMode: 'form', inputFields: [{ code: 'name', label: 'Adınız', type: 'text', required: true, maxLength: 80 }], resultMode: 'json', resultColumns: [] } }], migrations: [] },
    cargo: '[package]\nname = "ornek_selamlama"\nversion = "1.0.0"\nedition = "2021"\n\n[lib]\ncrate-type = ["cdylib"]\n\n[dependencies]\nserde_json = { version = "1", default-features = false, features = ["alloc"] }',
    source: rustModuleStarter('greeting.show', 'let name = data.get("name").and_then(Value::as_str).unwrap_or("dünya");\n            json!({ "message": format!("Merhaba, {name}!"), "module": "selamlama" })'),
  },
  {
    code: 'price', name: 'Fiyat hesaplama modülü', description: 'Birim fiyat, adet ve indirim oranından net tutarı hesaplar.',
    manifest: { moduleCode: 'ornek.fiyat-hesapla', displayName: 'Fiyat Hesaplama', version: '1.0.0', publisher: 'ornek', minimumPlatformVersion: '1.0.0', dependencies: [], permissions: [{ code: 'price.calculate', description: 'Fiyat hesaplama aracını kullanır.' }], menuEntries: [{ code: 'price.calculate', label: 'Fiyat hesapla', route: '/price-calculator', permissionCode: 'price.calculate', view: { inputMode: 'form', inputFields: [{ code: 'unitPrice', label: 'Birim fiyat', type: 'number', required: true }, { code: 'quantity', label: 'Adet', type: 'number', required: true }, { code: 'discountPercent', label: 'İndirim (%)', type: 'number' }], resultMode: 'json', resultColumns: [] } }], migrations: [] },
    cargo: '[package]\nname = "ornek_fiyat_hesapla"\nversion = "1.0.0"\nedition = "2021"\n\n[lib]\ncrate-type = ["cdylib"]\n\n[dependencies]\nserde_json = { version = "1", default-features = false, features = ["alloc"] }',
    source: rustModuleStarter('price.calculate', 'let unit = data.get("unitPrice").and_then(Value::as_f64).unwrap_or(0.0);\n            let quantity = data.get("quantity").and_then(Value::as_f64).unwrap_or(0.0);\n            let discount = data.get("discountPercent").and_then(Value::as_f64).unwrap_or(0.0).clamp(0.0, 100.0);\n            let subtotal = unit * quantity;\n            json!({ "subtotal": subtotal, "discount": subtotal * discount / 100.0, "total": subtotal * (1.0 - discount / 100.0) })'),
  },
  {
    code: 'text-summary', name: 'Metin özeti modülü', description: 'Metindeki kelime ve karakter sayısını hesaplar; saf bir örnek eylem sunar.',
    manifest: { moduleCode: 'ornek.metin-ozeti', displayName: 'Metin Özeti', version: '1.0.0', publisher: 'ornek', minimumPlatformVersion: '1.0.0', dependencies: [], permissions: [{ code: 'text.analyze', description: 'Metin özetleme aracını kullanır.' }], menuEntries: [{ code: 'text.analyze', label: 'Metin özeti', route: '/text-summary', permissionCode: 'text.analyze', view: { inputMode: 'form', inputFields: [{ code: 'text', label: 'Metin', type: 'text', required: true, maxLength: 1000 }], resultMode: 'json', resultColumns: [] } }], migrations: [] },
    cargo: '[package]\nname = "ornek_metin_ozeti"\nversion = "1.0.0"\nedition = "2021"\n\n[lib]\ncrate-type = ["cdylib"]\n\n[dependencies]\nserde_json = { version = "1", default-features = false, features = ["alloc"] }',
    source: rustModuleStarter('text.analyze', 'let text = data.get("text").and_then(Value::as_str).unwrap_or("");\n            json!({ "characters": text.chars().count(), "words": text.split_whitespace().count() })'),
  },
]

