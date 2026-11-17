# Tanım ekranı düzeni (DefinitionLayout)

Bu klasör yalnızca bir yönlendirmedir: tanım ekranı düzeni liste sayfası setinin parçasıdır ve
`src/list-page/DefinitionLayout.tsx` içindedir (`DefinitionLayout`, `DefinitionEmptyPane`, `DEFINITION_DRAWER_QUERY`;
stiller `src/list-page/list-page-v2.css` içinde `nx-def-*`). Kuralların tamamı `src/list-page/README.md` →
"Tanım ekranı" bölümündedir. Görsel referans: onaylı taslak `docs/design-proposals/erp-design-language/04-rapor-ve-tanim.html`
("2 · Tanım ekranı", "2b · Sil onayı").

Örnek uygulamalar: Depolar (`src/inventory/useWarehouseDefinitionScreen.tsx`, `inventory/components/WarehouseDefinition*.tsx`)
ve Raf ve Konumlar (`src/WarehouseLocationsPage.tsx`, `warehouse-locations/components/`). Testler:
`src/list-page/definitionLayout.test.tsx`, `src/inventory/definitionScreens.test.tsx`.

Sonraki modüller için hangi düzen:

| Ekran türü | Düzen | Taslak |
|---|---|---|
| Liste (kayıt listesi, hareket listesi) | `list-page/` (ListPageHeader, ListToolbar, AdvancedDataGrid, ListFooter) | 01 üst |
| Kayıt (oluştur / düzenle) | `record-form/` (RecordFormPage) | 01 alt |
| Basit tanım (kod / ad / durum + birkaç alan) | `DefinitionLayout` | 04 alt |
| Belge (Satış faturası, sipariş) | ayrı plan | 02 |
| Ekstre (Cari) | ayrı plan | 03 |
| Rapor (Finans) | ayrı plan | 04 üst |

Kısaca: liste solda, seçili kaydın formu sağda aynı ekranda; satır seçmek formu açar, kirli formda önce sorulur;
F2 boş form, Ctrl+S kaydet, Esc vazgeç; 1280px altında form çekmecedir. Silme API'si yoksa Sil nedenini söyler ve
Pasife al'ı önerir. Liste sayfalanmaz (`externalPagination`); "Tümünü seç" / Ctrl+A bu yüzden bir sayfayı değil,
listenin bütün (süzülmüş) kayıtlarını seçer. Form satır sürümünü (`rowVersion`) saklar; Yenile değişmiş formu ezmez.
