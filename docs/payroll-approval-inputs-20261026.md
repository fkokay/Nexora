# Türkiye bordro: ürün ve mali müşavir onay girdileri

**Durum:** Onay için bekleyen girdi listesi; bu belge tek başına ürün veya mevzuat onayı değildir.
**Tarih:** 26 Ekim 2026
**Kapsam:** İlk profil olarak kararlaştırılmış özel sektör 4/a; manuel yetkili operatör teslim yolu.

Bu formu doldururken gerçek çalışan kimlikleri, bordro belgeleri, vergi/SGK sicil bilgileri veya başka kişisel/gizli veri eklemeyin. Kabul örneklerinde sentetik ve anonim değer kullanın. Resmî parametreler ve dış şemalar için güncel resmî kaynağı ve sürümü belirtin. Onaysız, eksik veya çelişkili girdiler hesaplama ve payload üretimini açmaz.

## Onay sırası

### 1. Parametre ve formül kaynakları

- [ ] Her parametre/formül için resmî kaynak URL’si, belge ve madde/ek numarası eklendi.
- [ ] Yayım/doğrulama tarihi, yürürlük başlangıcı-bitişi, birim, çalışan/işyeri profili ve varsa koşullar belirtildi.
- [ ] Firma politikası olan girdiler mevzuat girdilerinden ayrıldı ve dayanak belge/referansı gösterildi.
- [ ] Hariç tutulan profiller ve koşullu istisnalar açıklandı.
- Mali müşavir/reviewer: ____________________  Tarih: __________

### 2. Beyan türü, dönem ve dış şema

- [ ] Firma/işyeri profili için beyan türü seçildi: 1003A / `MUHSGK_21` veya 1003B / `MUHSGK2_12` (ya da gerekçeli başka onaylı seçenek).
- [ ] Resmî paket sürümü, dosya formatı ve güncel şema/kod listesi kaynağı belirtildi.
- [ ] Resmî dönem kuralı ve kapsanan dönem tanımlandı; iç bordro dönemiyle farkı açıklandı.
- [ ] Zorunlu alanlar, firma/işyeri alan eşlemeleri, kod listeleri ve XSD dışındaki iş kuralları sağlandı.
- [ ] Manuel gönderim, ikinci yetkili onayı, ret/düzeltme/iptal ve kanıt saklama süreci onaylandı.
- Firma/işyeri profili (kişisel veri içermeyen kod): ____________________
- Mali müşavir/reviewer: ____________________  Tarih: __________

### 3. Kabul örnekleri

- [ ] Sentetik girdiler ve beklenen kalem/matrah/toplam sonuçları sağlandı.
- [ ] Normal durum, sınır değerleri, dönem/profil uyuşmazlığı, eksik girdi ve birim/eşleme hatası için beklenen kabul/ret sonucu yazıldı.
- [ ] Beyan türüne göre sentetik dosya örneği ile XSD/kod listesi ve iş kuralı doğrulama beklentisi sağlandı.
- [ ] Resmî kabul vakası varsa resmî kaynağı ve sürümü belirtildi; sentetik örnekler resmî kabul kanıtı olarak etiketlenmedi.
- [ ] Örnekler gerçek TCKN/VKN, SGK işyeri sicili, çalışan belgesi veya gerçek bordro içermiyor.
- Ek/fixture referansları: ____________________
- Mali müşavir/reviewer: ____________________  Tarih: __________

### 4. Ücret kalemleri, brüt/net ve yuvarlama

- [ ] Her firma kalemi sınıflandırıldı; SGK/PEK, gelir vergisi, damga vergisi ve net ücret matrahlarına dahil olma durumu ayrı belirtildi.
- [ ] Brüt hedef ve net hedef akışları için formül girdileri, sıra ve beklenen sonuçlar onaylandı.
- [ ] Her hesap aşaması ve nihai toplam için hassasiyet/yuvarlama kuralı belirtildi.
- [ ] Onaylı dönem değişikliği için yeniden hesaplama veya fark/düzeltme bordrosu seçildi; eski onaylı snapshot'ın korunma şekli açıklandı.
- [ ] Teşvik, istisna ve özel durumlar yalnızca koşulları ve kaynakları onaylandığında kapsama alındı.
- Mali müşavir: ____________________  Ürün sahibi: ____________________  Tarih: __________

### 5. Puantaj, çalışma takvimi, izin ve mesai

- [ ] İzin türü başına ücret etkisi ve firma politikası onaylandı; tanımlanmayan tür için varsayılan ücret etkisi yok.
- [ ] Fazla mesai, hafta tatili, ulusal bayram, ücretsiz izin ve puantaj düzeltmesi için ücret dönüşüm kuralı sağlandı.
- [ ] Eksik puantaj, eksik çalışma takvimi ve dönem içi işyeri/takvim değişiminde beklenen bloke/ret davranışı onaylandı.
- [ ] Çalışan bazlı istisnalar gerekiyorsa profil, yürürlük tarihleri ve ikinci onay sahibi tanımlandı.
- Firma politika belgesi/referansı: ____________________
- Ürün sahibi: ____________________  Mali müşavir: ____________________  Tarih: __________

### 6. Önceki veya çoklu işveren matrahı

- [ ] Çalışan-yıl bazında kullanılacak firma onaylı `baseCode`, birim ve geçerlilik dönemi tanımlandı.
- [ ] Sentetik örnekte kod/birim eşleşmesi ve beklenen davranış gösterildi; hukukî kod sınıflandırmasının kim tarafından yapılacağı belirtildi.
- [ ] Önceki işveren yokluğu için açık `NoPriorEmployer` beyanı ve çoklu işveren durumunun onay akışı belirlendi.
- [ ] Gerekli kanıt türü ve yetkili ikinci onay rolü tanımlandı; dosya veya kişisel veri eklenmedi.
- Ürün/mali müşavir onaylı kod ve birim referansı: ____________________
- Reviewer: ____________________  Tarih: __________

### 7. Muhasebe hesap eşlemeleri

- [ ] Her bordro kalemi ve toplam için firma hesap kodu, borç/alacak yönü ve para birimi eşlendi.
- [ ] Gerekliyse masraf merkezi/proje boyutu, mutabakat ve ters kayıt/düzeltme davranışı belirtildi.
- [ ] Kazanç, çalışan kesintisi, işveren maliyeti, vergi/prim borcu ve net ödeme eşlemeleri ayrı incelendi.
- [ ] Hesap kodu yaratma veya varsayılan eşleme gerektiren açık nokta kalmadı; eksik/onaysız eşlemenin bloke davranışı kabul edildi.
- Muhasebe sorumlusu: ____________________  Ürün sahibi: ____________________  Tarih: __________

## Uygulamaya geçiş kapısı

Ürün sahibi ve mali müşavir, kapsamlarına giren bölümleri tarihli olarak onaylamadan bordro sonucu veya resmî payload üretimi açılmaz. Uygulama öncesinde girdiler şema/birim/yürürlük/profil ve kaynak denetiminden geçirilir; ardından kabul vakaları beklenen sonuçlarla birlikte test planına bağlanır. Resmî kaynak arşivinin yerel kopyası güncel resmî sürümle yeniden karşılaştırılır.

## Dayanak repo belgeleri

- `docs/turkiye-payroll-2026-readiness.md`
- `docs/decision-readiness-20261026.md`
- `docs/payroll-2026-source-validation-scenarios.md`
- `docs/payroll-manual-submission-package-design-20261026.md`
