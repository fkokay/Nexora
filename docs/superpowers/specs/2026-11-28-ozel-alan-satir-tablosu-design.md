# Özel alan bloğu ve pencerede satır tablosu (tasarım taslağı)

Durum: onay bekliyor (kod yok). Tarih: 2026-11-28. Taslak: `docs/design-proposals/studio-sadelestirme/17-ozel-alan-satir-tablosu.html`. Üst belgeler: `2026-11-27-pencere-grup-5b2b-design.md` (pencere/grup kuralları), `2026-11-25-kayit-karti-design.md`.

## 1. Amaç ve ölçüm

Yeniden tasarlanan ekranlar iki kalıp özelliğini ortak ister: Satış & cari (cari kartı özel alanları), Stok & Depo (stok kartı ve depo penceresi özel alanları; lot/seri girişi satırları). Bugün kalıplı sayfa `customFieldsBlock` ve `editableGrid`'i reddeder (Kayıt kartı yerlerinde yok; pencere izinli türlerinde yok). Standartlarda:

- `customFieldsBlock`: `customer-create`, `inventory-stock-create`, `inventory-warehouses`, `sales-order-create`, `sales-invoice-create`, `sales-deliveries`. Her biri `definitionsQuery` (+ isteğe `valuesQuery`), `columns`, `disabledWhen` taşır; değerler kayıt dizisindeki bir yazma sorgusunun `map` parametresine `{{blok.degerler}}` ile gider.
- `editableGrid` lot/seri satırı: `inventory-stock.json` `izlemeSatirlari` (`gridMode: "list"`, 3 sütun, `maxRows: 200`); sorguya `{{izlemeSatirlari.satirlar}}` (`list`) olarak bağlanır. Belge kalıbı `editableGrid` kullanmaz (satırlar modelden gelir; kural korunur).

İkisi de ERP'de bugün çalışıyor; bu adım yalnız **kalıplarda yer açar**, davranış ve metinler değişmez.

## 2. Özel alan bloğu (`customFieldsBlock`)

### 2.1 Nerede durur

- **Kayıt kartı:** yeni `customFields` yeri; yalnız `customFieldsBlock`; sayfada en çok bir. Bölüm gibi tam bir sekmede yer almalı (sekme listesinde `"Özel alanlar=ozelAlanlar"`).
- **Pencere:** `dialog` yerinde, izinli türlere eklenir; pencerede en çok bir. Pencerenin `contains` listesinde ya da sekmesinde yer alır. Grup (`section`/`card` + `children`) çocuğu olamaz (grup çocuk türleri değişmez).
- **Dışı:** Liste, Serbest gövde, Belge (Belge'deki sipariş özel alanları boşluğu ayrı tasarım; §2.6).

### 2.2 Sayfa tanımı biçimi (eski adlar)

```json
{ "id": "ozelAlanlar", "type": "customFieldsBlock", "name": "ozelAlanlar",
  "props": { "slot": "customFields", "title": "Özel alanlar", "definitionsQuery": "ozelTanimlar",
             "valuesQuery": "ozelDegerler", "columns": 2, "disabledWhen": "…", "visibleWhen": "…" } }
```

Pencerede `slot: "dialog"`. Ayarlar eski şemanınkiyle aynı (`title`, `definitionsQuery`, `valuesQuery`, `columns` 1–3, `disabledWhen`/`disabledReason`, `visibleWhen`); `width` dönüşümde silinir. Dönüştürücü eşleyemezse (ikinci blok, grup içinde blok, izinsiz yer) sayfayı taşımaz ve gerekçe yazar.

### 2.3 Sunucu doğrulaması (yeni, `PageTemplateRules`)

Bugünkü şema denetimleri (okuma sorguları, `code`/`label`/`dataType` ve `code`/`value` sütunları, ad zorunluluğu) aynen kalır. Yeni:

| Durum | İleti |
|---|---|
| Blok Kayıt kartında `customFields` yeri dışında, ya da Liste/Serbest gövdede | "Özel alan bloğu yalnız Kayıt kartında 'customFields' yerinde ve pencerenin içinde durabilir." |
| Sayfada ya da pencerede ikinci blok | "Bir sayfada ve bir pencerede en fazla bir özel alan bloğu olabilir." |
| Kayıt kartında blok sekmede değil | mevcut "Kayıt kartında her bölüm, tablo ve açıklama tam bir sekmede yer almalı." (blok da sayılır) |
| Grup içinde blok | mevcut `GrupTuru`: "customFieldsBlock grubun içinde kullanılamaz." |
| Değerleri kaydeden adım yok (kartta işlem çubuğunun `saveQuery`/`saveSequence`'i; pencerede pencerenin) | "Özel alan bloğunun değerleri kaydedilmiyor: kayıt adımlarından birinde '{{ad.degerler}}' bağlanmalı." |

"Değerleri kaydeden adım": kayıt sorgularından en az biri `map` parametresini `{{blok.degerler}}`'e bağlar (şemanın bugünkü blok takibi). `valuesQuery` verilmese de kayıt adımı gerekir.

### 2.4 ERP çizimi

- Bugünkü `CustomFieldsBlock` çizicisi: başlık, 1–3 kolon (kutu daralınca kendiliğinden azalır), tür başına giriş (metin, sayı, tarih, onay kutusu), zorunlu işareti, alan altında hata.
- **Kartta:** sekmenin içinde bölüm gibi tek kutu. **Pencerede:** alanlardan sonra, gövdede; pencerenin Kaydet'i bloğu da yazar; "açılışta temizle" yazılan değerleri sıfırlar.
- Metinler bugünküyle aynı: "Yükleniyor…", "Tanımlı özel alan yok.", okuma hatası kutusu, "Bu alan zorunludur.", "Geçerli bir sayı girin."; kayıt bu hatalarla durur. `disabledWhen` bloğu salt okunur yapar.
- Yeni kayıtta blok açıktır; değerler ana kayıttan sonraki adımda yazılır (standartların bugünkü `olustur` → `ozelKaydet` sırası; kalıp değiştirmez).

### 2.5 Studio paneli

- Kayıt kartında "+ Özel alan bloğu ekle" (sekmeye); pencerede içerik listesine. Panel: başlık, alan kaynağı (modül özel alanları; seçince tanım/değer sorguları bağlanır), kolon sayısı 1/2/3, "Ne zaman salt okunur", "Ne zaman görünsün", "Kaydet bloğu da kaydeder" göstergesi.
- Kayıt adımı yoksa uyarı ve "Kayıt adımını ekle" (kayıt sırasına özel alan adımını koyar).
- Tuvalde alan adları tanım sorgusu önizlemesinden gelir (bugünkü `CanvasPreviews`).

### 2.6 Hedef dışı

Belge kalıbında özel alan; özel alan tanımı yönetimi; bir sayfada birden çok blok; grupta blok; Liste/Serbest gövdede blok; yeni veri türleri.

## 3. Pencerede satır tablosu (`editableGrid`, küçük küme)

### 3.1 Nerede durur

Yalnız pencerenin içeriğinde (`dialog` yeri, üst düzey), pencerede en çok bir. Kayıt kartı, Liste, Serbest gövde, grup içi ve Belge'de yok (Belge'deki mevcut yasak sürer). Pencerenin bir kayıt eylemi (`saveQuery`/`saveSequence`) olmalı.

### 3.2 Sayfa tanımı biçimi (eski adlar)

```json
{ "id": "izlemeSatirlari", "type": "editableGrid", "name": "izlemeSatirlari",
  "props": { "slot": "dialog", "gridMode": "list", "title": "Lot / seri satırları", "description": "…",
             "gridColumns": ["trackingCode|Lot / seri kodu|text|required,unique,maxLength:80",
                             "quantity|Miktar|number|required,min:0.0001", "expiryDate|Son kullanma tarihi|date"],
             "minRows": 1, "maxRows": 200, "addLabel": "Satır ekle", "disabledWhen": "…", "visibleWhen": "…" } }
```

İzinli: `gridMode: "list"`, `title`, `description`, `gridColumns` (1–8 sütun; tür `text`/`number`/`date`/`checkbox`; kurallar `required`, `unique`, `maxLength`, `min`, `max`, `upperCase`), `minRows`, `maxRows` (1–200), `addLabel`, `disabledWhen`/`disabledReason`, `visibleWhen`. Satırlar sorguya `{{ad.satirlar}}` ile gider.

**Pencerede yasak:** `stage` ve `matrix` kipleri, `sourceQuery`, `rowKey`, seçim (`lookup:`) ve hesap (`calc:`) sütunları, `readOnly` kuralı, `totals`, `formulas`, `fillQuery`/`fillColumns`/`skipWhenZero`, `lookupFills`, `columnOptionsWhen`/`columnStaticOptions`, `fixedRowLabel`, `rowNumberColumn`, `lockColumnsWhen`.

### 3.3 Sunucu doğrulaması (yeni)

Bugünkü şema denetimleri (sütun biçimi, benzersiz kod, `minRows` ≤ `maxRows`) aynen kalır. Yeni:

| Durum | İleti |
|---|---|
| Satır tablosu pencere dışında (Liste, Kayıt kartı, Serbest, grup içi) | "Satır tablosu (editableGrid) yalnız pencerenin içinde kullanılabilir." (Belge'de mevcut ileti kalır) |
| Pencerede ikinci tablo | "Bir pencerede en fazla bir satır tablosu olabilir." |
| `stage`/`matrix` kipi | "Pencerede satır tablosu yalnız 'list' kipinde kullanılabilir." |
| Seçim/hesap sütunu | "Pencerede satır tablosu yalnız metin, sayı, tarih ve onay kutusu sütunlarını alır: {sütun}." |
| Yasak ayar | "'{ayar}' pencerede satır tablosunda kullanılamaz." |
| `maxRows` yok ya da 200'den büyük | "Pencerede satır tablosu için 'maxRows' 1–200 olmalıdır." |
| Satırlar kayıt sorgusuna bağlı değil | "Satır tablosunun satırları kaydedilmiyor: pencerenin kayıt adımlarından birinde '{{ad.satirlar}}' bağlanmalı." |
| Pencerede kayıt eylemi yok | "Satır tablosu olan pencerenin bir kayıt eylemi olmalı." |

### 3.4 ERP çizimi

Bugünkü `EditableGrid` çizicisi `list` kipinde: formdan sonra tek sütun genişliğinde; üstte başlık ve açıklama, satırlar (her satırda ✕), altta "Satır ekle" (`addLabel`) ve satır sayacı. Metinler bugünküyle aynı: "Bu alan zorunludur.", "Bu değer başka bir satırda da var.", "En fazla N satır eklenebilir.", "En az N kalem girin."; kayıt hatalı hücreyle durur. Sunucudaki lot/seri toplam denetimi (hareket miktarı = satır toplamı) değişmez.

### 3.5 Studio paneli

"+ Satır tablosu" pencere içeriğine (en çok bir). Panel yalnız izinli ayarları gösterir: başlık, açıklama, ekle düğmesi adı, en az/en çok satır, "Ne zaman salt okunur"; sütun listesi (ekle/çıkar/sırala; ad, tür, zorunlu, benzersiz, en az/en çok/uzunluk). Satırlar kayıt eylemine bağlı değilse uyarı ve "Bağla" (kayıt sorgusunun liste parametresine bağlar).

### 3.6 Hedef dışı

Seçim/hesap sütunu, toplam satırı, formül, sorgudan doldurma, `stage`/`matrix`, Kayıt kartında/Liste'de/Serbest gövdede satır tablosu, Belge satır modeli, pencerede sihirbaz.

## 4. Dönüştürücü ve eşdeğerlik

- Dönüştürücü yeni yerleri (`customFields`, pencere içi) doldurur; yasak ayar, ikinci örnek ya da yanlış yer varsa sayfayı taşımaz ve §2.3/§3.3 gerekçesini yazar.
- `BehaviorEquivalence`: blok ve tablonun ayarları (`width` hariç hepsi), bağlı sorgular ve parametre bağları önce/sonra aynı; gevşetilmez.
- Rapor: "özel alan bloğu kalıpta yok" ve "satır tablosu kalıpta yok" nedenleri kalkar.
- Bu iki özellik Satış & cari ve Stok & Depo yeniden tasarım dallarından önce birleşmeli; onlar yalnız kullanır.

## 5. Onay için sorular

1. Kayıt kartında blok yalnız bir sekmede (önerilen) mi dursun, yoksa her sekmede bölüm gibi mi?
2. Belge kalıbında sipariş özel alanları bu adımda yok; ertelenmesi uygun mu?
3. Pencerede satır sınırı 200 (lot/seri ihtiyacı) uygun mu?

## 6. Builder'a bırakılanlar

ERP/Studio bileşen yapısı, ileti metinlerinin son sözü, `PageTemplateRules` ve `TenantCustomPageSchema` değişikliklerinin bölümlemesi, PR sırası.
