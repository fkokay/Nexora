# Kayıt formu yapısı (RecordForm)

Bir iş kaydını **oluşturan veya güncelleyen** her ekran bu yapıyı kullanır. Referans uygulama:
`src/customers/components/CustomerCreatePage.tsx` (kapsayıcı tarafı: `src/CustomersPage.tsx`).

## Parçalar (`RecordForm.tsx`)

- `RecordFormPage`: komut çubuğu (başlık, YENİ KAYIT / DÜZENLEME rozeti, Kaydet `F2`, Kaydet ve Yeni `Ctrl+F2`,
  Temizle, Vazgeç), hata şeridi, `<form>` gövdesi ve durum çubuğu. `<form>` etiketini kendisi üretir; içine
  ayrıca `<form>` koymayın. Modal içindeki formlar için `variant="dialog"`.
- `RecordFormGroup`: başlıklı grup kutusu. Alanlar doğrudan içine `<label>Etiket<input/></label>` olarak yazılır.
- `RecordFormTabs`: sekme şeridi + panel. Yalnızca alanlar tek ekrana rahat sığmıyorsa kullanın.
- `RequiredMark`: zorunlu alan yıldızı; etiket metnini `<span>` içine alın: `<span>Kod <RequiredMark /></span>`.

## Yerleşim sınıfları (`record-form.css`)

- `rf-identity`: kaydı tanımlayan 3-4 ana alan için üst şerit (`RecordFormGroup bodyClassName="rf-identity"`).
- `rf-columns`: grup kutularını üç sütuna dizer; `rf-columns-wide` tüm sütunlara yayılır.
- `rf-pair`: iki kısa alanı yan yana koyar. `rf-short`: tek kısa alan. `rf-custom-grid`: üçlü alan ızgarası.
- Alan sınıfları: `rf-must` (zorunlu, sarı zemin), `rf-num` (sağa hizalı sayı), `rf-mono` (kod / IBAN / vergi no),
  `rf-check` (onay kutulu satır etiketi).
- Durum çubuğu: `rf-status-warning`, `rf-status-notice`, `rf-status-end`.

## Kurallar

- Alanları, doğrulamaları, API çağrılarını ve kayıt davranışını değiştirmeyin; yalnızca düzeni taşıyın.
- Ekranın başında kaydı tanımlayan alanlar "kimlik şeridi" olur; diğer alanlar anlamlı gruplara ayrılır.
- "Kaydet ve Yeni" yalnızca oluşturma modunda ve kapsayıcı `onSaveIntent` verdiğinde görünür; kapsayıcı
  başarılı kayıttan sonra formu temizleyip açık bırakır. "Temizle" için `onReset` verin.
- Yeni Türkçe metinlerin İngilizce karşılığını modülün `src/locales/en/*.ts` sözlüğüne ekleyin.
- `RecordForm.tsx` ve `record-form.css` ortaktır; ekrana özel ihtiyaçları modülün kendi CSS dosyasına yazın.
