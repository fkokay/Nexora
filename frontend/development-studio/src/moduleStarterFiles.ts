export type ModuleStarterFile = { path: string; content: string }

function rustModule(action: string, expression: string) {
  return `use serde_json::{json, Value};
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
}

const starterDefinitions = {
  greeting: {
    action: 'greeting.show',
    permission: { code: 'greeting.read', description: 'Selamlama ekranını kullanır.' },
    menu: { code: 'greeting.show', label: 'Selamlama', route: '/greeting', permissionCode: 'greeting.read', view: { inputMode: 'form', inputFields: [{ code: 'name', label: 'Adınız', type: 'text', required: true, maxLength: 80 }], resultMode: 'json', resultColumns: [] } },
    expression: 'let name = data.get("name").and_then(Value::as_str).unwrap_or("dünya");\n            json!({ "message": format!("Merhaba, {name}!"), "module": "selamlama" })',
  },
  price: {
    action: 'price.calculate',
    permission: { code: 'price.calculate', description: 'Fiyat hesaplama aracını kullanır.' },
    menu: { code: 'price.calculate', label: 'Fiyat hesapla', route: '/price-calculator', permissionCode: 'price.calculate', view: { inputMode: 'form', inputFields: [{ code: 'unitPrice', label: 'Birim fiyat', type: 'number', required: true }, { code: 'quantity', label: 'Adet', type: 'number', required: true }, { code: 'discountPercent', label: 'İndirim (%)', type: 'number' }], resultMode: 'json', resultColumns: [] } },
    expression: 'let unit = data.get("unitPrice").and_then(Value::as_f64).unwrap_or(0.0);\n            let quantity = data.get("quantity").and_then(Value::as_f64).unwrap_or(0.0);\n            let discount = data.get("discountPercent").and_then(Value::as_f64).unwrap_or(0.0).clamp(0.0, 100.0);\n            let subtotal = unit * quantity;\n            json!({ "subtotal": subtotal, "discount": subtotal * discount / 100.0, "total": subtotal * (1.0 - discount / 100.0) })',
  },
  'text-summary': {
    action: 'text.analyze',
    permission: { code: 'text.analyze', description: 'Metin özetleme aracını kullanır.' },
    menu: { code: 'text.analyze', label: 'Metin özeti', route: '/text-summary', permissionCode: 'text.analyze', view: { inputMode: 'form', inputFields: [{ code: 'text', label: 'Metin', type: 'text', required: true, maxLength: 1000 }], resultMode: 'json', resultColumns: [] } },
    expression: 'let text = data.get("text").and_then(Value::as_str).unwrap_or("");\n            json!({ "characters": text.chars().count(), "words": text.split_whitespace().count() })',
  },
} as const

export function moduleStarterFiles(templateId: string, moduleCode: string, displayName: string): ModuleStarterFile[] {
  const template = starterDefinitions[templateId as keyof typeof starterDefinitions]
  if (!template || !/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/.test(moduleCode)) return []
  const packageName = moduleCode.replace(/[.-]/g, '_')
  const manifest = {
    moduleCode,
    displayName,
    version: '1.0.0',
    publisher: 'ornek',
    minimumPlatformVersion: '1.0.0',
    dependencies: [],
    permissions: [template.permission],
    menuEntries: [{ ...template.menu, permissionCode: template.permission.code }],
    migrations: [],
  }
  return [
    { path: `modules/${moduleCode}/manifest.json`, content: JSON.stringify(manifest, null, 2) },
    { path: `modules/${moduleCode}/Cargo.toml`, content: `[package]\nname = "${packageName}"\nversion = "1.0.0"\nedition = "2021"\n\n[lib]\ncrate-type = ["cdylib"]\n\n[dependencies]\nserde_json = { version = "1", default-features = false, features = ["alloc"] }\n` },
    { path: `modules/${moduleCode}/src/lib.rs`, content: rustModule(template.action, template.expression) },
  ]
}
