# ERP tasarım dili — sonraki planlara devredilenler (2026-11-17)

Faz 0, Faz 1 (Task 1–11), Faz 2 Stok (Task 1–8), Faz 3 Satış (Task 1–5: listeler, belge detayları, belge oluşturma ekranları, Kampanyalar, Dağıtım planı, görsel kabul), Faz 4 Satınalma (Task 1–6: 9 liste, 5 belge, 4 oluşturma ekranı, görsel kabul) ve aynı daldaki modül geçişleri (taslak 08 Cari & CRM, taslak 09 Finans, taslak 10 Üretim / İK / Dış Ticaret / Duran Varlık; kullanıcı üç taslağı 2026-11-17'de onayladı) tamamlandı. Aşağıdakiler bilinçli olarak sonraki planlara bırakıldı.

**Doğrulama düzeyi (bu dalın tamamı için):** Vitest bileşen testleri (istek gövdeleri için önce karakterizasyon testleri) ve sahte API'li ekran görüntüleri (Edge, 1440 açık / koyu, 390). Playwright UI denetimi hiç çalışmadı; gerçek API ve gerçek kiracı verisiyle görsel doğrulama yapılmadı. Aşağıda "doğrulandı" yazan yerler bu düzeydedir.

## Kullanıcı kararı bekleyenler
Bunlar uygulayıcı / kontrolcü kararıyla yapıldı ya da bilerek yapılmadı; kullanıcının açık bir kararı kayıtlı değil.
- **Aktarılabilir Kaynaklar › Seçilenleri aktar çalışmıyor (eski hata, bilerek düzeltilmedi).** `FinanceStudioGrid` işaretli satırları iç React anahtarlarıyla (`.0:$SalesInvoice-…`) bildiriyor, sayfa kendi anahtarlarıyla karşılaştırıyor; sayaç hep (0) kalıyor ve hiçbir POST gitmiyor. Tek satırlık düzeltme denendi ve geri alındı: toplu yolda kapalı dönem önizleme denetimi yok, düzeltme kapalı döneme takılan kaynak için de POST gönderiyordu (yalnız sunucu durduruyor). Bugünkü davranış `transferSources.test.tsx` ile sabit ("ticked rows are not recognised, so no POST is sent"); kod yorumu hatayı adlandırıyor. Düzeltmek için toplu yola kapalı dönem denetimi eklenmeli; kullanıcı kararı bekliyor.
- **Hesap Planı › Pasifleştir PUT gövdesi değişti.** Önceden form kapalıyken pasifleştirme hesabın tipini "Unclassified", çalışma şeklini "Both" yapıyor ve IFRS eşlemesini siliyordu (form varsayılanları gönderiliyordu). Tanım ekranında seçili hesap karta yüklendiği için gövde artık hesabın gerçek değerlerini taşıyor. Veri kaybını önleyen bir düzeltme, ama "istek değişmez" kuralının istisnası. Kontrolcü kabul etti ve kullanıcıya söylendi; kullanıcının onayı kayıtlı değil.
- **CRM Fırsatları özet kartları ve paneldeki "Aşama akışı" uygulayıcı tasarımı** (taslak 08'de CRM için çizim yok). Kartlar: Açık fırsat, Kazanıldı, Açık fırsat değeri, Takibi geçmiş (ilk ikisi çip sayılarını tekrarlıyor; istenmezse kaldırılabilir). Aşama akışı `CrmEndpoints.CanTransition` kuralına göre çiziliyor (Kaybedildi'de yalnız o adım işaretli). Kullanıcıya gösterilmedi.
- **İK › İşyeri ve takvim seçim şeridi uygulayıcı tasarımı:** üç tanım (İşyeri atamaları / İşyeri takvimleri / Personel istisnaları) alt menüye ayrılmadan tek sekmede bir seçim şeridiyle. Kullanıcıya gösterilmedi.
- **Finans raporları parametre değişince kendiliğinden yeniden çalışıyor** (Mizan, Bilanço, Nakit Akışı, Döviz Pozisyonu, Vade Takibi). Taslak 04 "F9 ile çalıştır" diyor; "davranış değişmez" kuralı gereği bugünkü otomatik çalıştırma korundu, F9 / Yenile ek bir istek gönderir. İK Dönem özeti ise F9 bekliyor (her yükleme denetim kaydına yazılıyor). Kullanıcıya gösterilmedi.
- **Krediler sekme ızgaralarındaki satır işlemleri satırda kaldı** (taksit Öde / İptal, hareket Ters kayıt, teminat Serbest bırak / Çağır). Taslaktaki "Hareket ters kaydı → İşlemler" karşılanmadı; sekme satırında belge düzeyi İşlemler belirsiz olacağı için (Satınalma'daki Faturala kararıyla aynı gerekçe) kontrolcü satırda bıraktı. Kullanıcıya gösterilmedi.
- **Vazgeç sorusu modüller arasında farklı.** Finans formlarında (Yevmiye Fişi, kredi formları, teminat) başlıktaki Vazgeç değişiklik varsa soruyor (`confirmCancel`); Satınalma, Cari, CRM, Üretim, İK ve DV formlarında sormadan atıyor (Satınalma Task 5 "kit eşliği" kararı). Esc her yerde soruyor. Tek kural seçilmeli.

## Sonraki planda mutlaka ele alınacaklar
- **Kalan modül geçişleri (Faz 1 Task 12–18'in devamı):** Ayarlar, low-code ekranları ve bu dalda taşınmayan diğer ekranlar; her modül işlem çubuğu + ekran düzeniyle birlikte ve modül onay kapısından geçerek taşınacak. Satış (Faz 3), Satınalma (Faz 4), Cari & CRM, Finans ve Üretim / İK / Dış Ticaret / Duran Varlık bu dalda taşındı. Ticari sözleşmeler (ayrı ekran tipi) hiçbir fazda taşınmadı: Krediler liste tipine geçerken paylaştığı düzen kuralları kredi CSS'inden silinmişti; son düzeltme turunda bu kurallar ekranın kendi stil dosyasına (`commercial-contracts/commercial-contracts.css`) taşındı ve 15ab1af3 ile sahte API'li ekran görüntüsüyle karşılaştırıldı (renkler `--nx-*` belirteçleri; seçili öğe ve etiket renkleri belirteç değerlerine göre çok az farklı).
- **Eski `global-components.css` temizliği ("Task 2b"):** `.app-shell * { box-shadow:none … } !important` (satır ~66-70) ve h1–h4 / label / small `!important` boyutları (~58-64). Tüm ekran taramasıyla kaldırılmalı; yeni bileşenler şimdilik outline / pseudo-element ile çalışıyor.
- **Faz 1 Task 2 artıkları:** `platform-tenant-provisioning.css` içe aktarılmayan `index.css`'teki `--accent`/`--surface` değişkenlerini kullanıyor; çakışan `.nav-item.active` kuralları; ölü `.credit-overview-title` kuralı.
- **Kabuk:** finance-workbench / ai-settings yapışkan (sticky) ofsetleri eski üst çubuğa göre; alt menü 1280 altında katlanmak yerine gizleniyor ve daraltılamıyor; alt menü sırası tenant'ın menü sıralamasını izlemiyor.
- **Platform yönetim sayfası:** iki form varken ve odak hiçbirinde değilken Ctrl+S tarayıcının "Sayfayı kaydet" penceresini açıyor (kabuk dışında tarayıcı tuşları serbest bırakıldı).
- **Gerçek ortam doğrulaması:** Playwright UI denetimi (`npm run test:ui-design`) bu dalda hiç çalıştırılamadı (test ortamı/kimlik bilgisi yok); tüm görsel kontroller sahte API ile yapıldı.

## Satış'tan kalanlar (Faz 3, veri / karar bekleyen)
- **Fatura listesinde vade ve kalan yok:** `/api/sales/invoices/` liste cevabında vade tarihi, tahsil edilen / kalan tutar yok → Vade ve Kalan sütunları, "Tahsil edilmemiş" / "Vadesi geçen" özet kartları, "Vadesi geçti" etiketi ve "bu ay" filtresi çizilmiyor (Kalan yalnız sağ panelde, detay cevabından). Uç nokta genişletilirse eklenecek (Faz 4 Satınalma'da bu veri alış faturası listesinde vardı; satış uç noktası genişletilmedi — sonraki plan).
- **Fatura durumlarında Taslak / Onaylı / e-Fatura / Tahsil edildi yok:** fatura kaydedilince Kesildi olur; akış tek adım (Kesildi, İptal). Oluşturma ekranında geçerli adım yok. Bu durumlar arka uçta tanımlanırsa akışa eklenecek.
- **Cari bakiye / risk uç noktası yok:** belge bağlam panelinde ve oluşturma ekranında cari bakiye, risk limiti, vadesi geçen çizilmiyor (yalnız kod, VKN, plasiyer).
- **Belge satırında depo stoku yok:** taslak 02'deki "aktif satırın stoku" (depolara göre mevcut / rezerve) için belge cevaplarında veri yok; çizilmiyor.
- **Satır tuşları:** taslaktaki Ins / Ctrl+D / F9 / F4 / Alt+↑↓ satır kısayolları bugün yok (yalnız Ctrl+Shift+Enter satır ekle); eklenirse F1 listesine de girmeli.
- **Liste durum filtreleri:** teklif dışındaki satış liste uç noktalarında durum filtresi yok → çip yok.
- **Teklif / sipariş oluşturma ızgarası:** 14 sütun korunduğu için 1440'ta kart içinde yatay kayıyor (sayfa kaymıyor) — sütun sadeleştirmesi kullanıcı kararı.
- **Kampanyalar:** rowVersion yok (eşzamanlı düzenleme denetimi yok), son değiştiren / tarih bilgisi yok; Performans raporu modu yeniden tasarlanmadı (yalnız renkler).
- **Eski gövde parçaları:** fatura "Vergi mevzuatı" bloğu, özel alan formları, tahsilat / iade formları ve iade ızgarasının kendi sayfalayıcısı detay gövdesinde tek kart olarak eski biçimiyle duruyor; kit parçalarına dönüştürülmedi.
- **Ölü eski CSS:** `sales-purchasing-workbench.css` içinde artık çizilmeyen `.invoice-detail-layout`, `.invoice-detail-modal`, `.sales-delivery-detail-modal`, `.sales-invoice-detail-backdrop` kuralları (~144 satır) duruyor; bunlara bağlı `.invoice-collection-form` / `.invoice-return-form` boşluk ve tek sütun ayarları artık uygulanmıyor. Temizlikte silinmeli ve tahsilat / iade formları bir kez kontrol edilmeli.
- **PgUp / PgDn:** hiçbir belge sayfası `recordNav` vermediği için F1 listesinden çıkarıldı (alt bilgi satırı zaten koşullu); listeden açılan belgede önceki / sonraki gezinme bağlanınca geri eklenecek.

## Satınalma'dan kalanlar (Faz 4, veri / karar bekleyen)
- **Ekran görünümü düzenleyicisi eski varsayılanı gösteriyor:** Ayarlar › yerleşik ekran görünümlerinde `purchase-invoices` için hâlâ sunucu kataloğunun 13 sütunluk varsayılanı (eski adlarla: Toplam / Ödenmemiş / Fatura tarihi; Sipariş no, Döviz, Satır görünür) çıkıyor. Liste, kiracı görünümü yayınlanmamışken taslak 07'nin 9 sütununu kullanıyor; kiracı düzenleyiciden bir görünüm yayınlarsa liste o 13 sütuna döner ve 1440'ta yatay kayabilir. Kalıcı çözüm arka uç kataloğunun varsayılan görünürlük / adlarını taslak 07'ye çekmek.
- **"Yeni ▾" menüsü yok:** `CommandSpec` menü taşımıyor; Satınalma Faturaları'nda F2 = Mal kabulünden fatura, "Mal kabulsüz fatura" İşlemler'de. Çubuğa menülü komut eklenirse taslaktaki gibi tek Yeni ▾ olmalı.
- **Satınalma Faturaları tedarikçi filtresi:** taslaktaki "Tedarikçi: Tümü ▾" açılır filtresi yok; yalnız cari ekranından gelen tedarikçi çipi.
- **Talepler / Siparişler / Mal kabul faturası girişi satırları iki satırlı:** numaranın altında açıklama / tarih, tedarikçinin altında depo (kiracı alan düzeni korunduğu için); diğer Satış / Satınalma listeleri tek satırlı (30px). Tek satıra indirmek görünen bilgiyi azaltır — kullanıcı kararı.
- **Talepler ve Siparişler'de satır "⋯" sütunu duruyor** (öğeleri İşlemler'de de var; Satış Siparişleri gibi).
- **Talep / sipariş silinemez:** silme uç noktası yok; çubuğun Sil'i "Bu ekranda kullanılamaz".
- **Sipariş belgesindeki mal kabul ızgarası 1440'ta bölüm içinde yatay kayıyor** (kiracı ekran görünümü genişlikleri, 1120 > 826px); sayfa kaymıyor. Faturala ızgaranın satırında kaldı (İşlemler'de değil — mal kabul başına işlem).
- **`canReceiveOrder` Onay bekliyor ve Reddedildi siparişte de "Mal kabul ekle"ye izin veriyor** (mevcut davranış, değiştirilmedi); akış onay kullanmayan kiracıda da Onay bekliyor adımını çiziyor.
- **Mal kabulleri araması yalnız bu sayfada:** liste uç noktasında arama parametresi yok.
- **Siparişsiz mal kabul formu:** satır kartları grup kartının içinde (iç içe kart) — form içeriği, yalnız çerçeve taşındı.
- **Tedarikçi irsaliyesi oluşturma:** sipariş listesinde ham durum ("PartiallyReceived"), "Satın alma" yazımı, Ara / Yenile / Önceki / Sonraki eski düğme boyları; belge ve oluşturma ekranındaki kiracı satır ızgaraları kendi araç çubuğu ve sayfalayıcısıyla (Satış kiracı ızgaraları gibi).
- **Bağımsız fatura taslakları:** tarihler ISO biçiminde (2026-11-12), Kaydedilme saniyeli; sayfalayıcı yok (ilk 50 kayıt, "Gösterilen N / toplam"), arama yok; taslak formunda "Belge toplamları" elle girilen alanlar (`DocumentTotals` / genel toplam satırı yok — tutarlar tedarikçi belgesinden aynen aktarılır).
- **Yeni satınalma siparişi tutarları "TL"** (Satış oluşturma ekranlarıyla aynı), belgeler ve listeler "TRY" yazıyor — iki modülde birlikte düzeltilmeli.
- **Siparişsiz mal kabul formu `commandsActive`:** gizliyken boş komut yuvası kaydediyordu; son düzeltme turunda kayıt defteri komutsuz form yuvalarını yok sayıyor (kapandı, testli).

## Cari & CRM'den kalanlar (taslak 08, veri / karar bekleyen)
- **Liste sütunları Yetkili, Telefon, e-Fatura çizilmedi:** ekran düzeni kataloğuna (`TenantScreenViewEndpoints.CustomerFields`) `contactName` ve `phone` anahtarları eklenmeli (sunucu değişikliği; "veri boşluğu çizilmez" kuralı).
- **Pencerede kalanlar:** Adresler kart bölümü oldu (düzeltme turu); Özel alan tanımları / geçmişi pencerede kaldı (kiracı geneli, kart verisi değil — kontrolcü kararı). Satış faturaları penceresi cariye süzülmüş Satış Faturaları listesiyle değiştirilmedi; `MasterDataImportDialog` ve `CustomerSalesInvoicesPanel` biçimlenmedi.
- **Cari grupları** tanım (04-alt) ekranına geçmedi; bağlı cari sayısı için uç nokta gerekiyor (bugün sunucunun 409 iletisi gösteriliyor).
- **Cari kartı:** PgUp / PgDn gezintisi ve "N alan değişti" sayacı yok.
- **Veri boşlukları (çizilmedi):** ekstrede belge türü / no, vade, yaşlandırma; listede bakiye; çok dövizli bakiye (`/balance` ve `/statement` dövizleri ayırmıyor; ekstre "farklı dövizli hareket var" uyarısı veriyor); toplu bakiye / sayım uç noktaları.
- **Kit README'si:** `list-page/README.md` Cari Hesaplar'ı eski haliyle (kod adın altında, satır menüsü) referans gösteriyor; güncellenmeli.
- **CRM katman sırası:** `crm-opportunities.css`'teki `.crm-delete-backdrop { z-index:1400 }` ve `.crm-customer-picker-backdrop { z-index:1300 }` (+ seçici pencere genişliği 620px) kuralları kalktı. Oluşturma formu artık sayfa olduğu için yığılma muhtemelen sorun değil; silme penceresi ve müşteri seçicisi görsel olarak doğrulanmadı.
- **İngilizce sözlük:** `customers-crm` grubu `locales/en/index.ts`'te sonda; ilk tanımlayan grup kazandığı için aynı Türkçe metnin CRM'e özgü çevirisi bu sözlük yapısında verilemez (gölgelenen 16 yineleme son düzeltme turunda silindi).

## Finans'tan kalanlar (taslak 09, veri / karar bekleyen)
- **Muavin ekstre (03) ve değerleme fişi belge (02) yapılmadı:** ikisi de bugünkü bileşenleriyle sağ yarıda açılıyor (`AccountMovementsAside.tsx`; `fx-revaluation/components/*`). Muavin cevabında açılış borç / alacak var, devir satırı çizilebilir.
- **Ortak rapor çerçevesi:** `LedgerReportFrame` Finans'a yerel; İK Dönem özeti ayrı yazıldı. İkisi ortak kite birleştirilmeli (çalıştırma modeli farkı yukarıda, kullanıcı kararı bekliyor).
- **Hesap sınıflandırması sekmesi** (Nakit Akışı) seçim değişince hemen PUT ediyor; tanım (04-alt) gibi ayrı kart / Kaydet yok ("davranış değişmez" kuralı).
- **Eski ızgara araçları:** `FinanceStudioGrid` / `AdvancedDataGrid` araçları (Sütun filtreleri, Sütunlar, Pivot, XLSX / CSV) ve sayfalayıcılar birçok Finans yüzeyinde eski görünüşte; değerleme fişi ızgarası eski görünüşte. Kredi sekme ızgaralarının araç satırı belge yüzeyinde iri duruyor.
- **Eski paneller:** `CashForecastPanel`, `StatutoryCashFlowStatementPanel` iç form ve düğmeleri eski görünüşte (40px kontroller); nakit bütçesi tahmin kartı listenin altında tek kart.
- **Çek ve Senet:** Portföyde / Verilen kartları yalnız bilgi (kit README'si özet kartlarını uyarı / filtreyle sınırlıyor); Karşılıksız kartı filtre değil; Portföyde / Verilen filtresi tür çipini ve aramayı temizliyor; kayıt yüzeyinde PgUp / PgDn yok.
- **Yeni kasa** zaten tam sayfa `RecordFormPage`; POST gövdesi için karakterizasyon testi yok, değiştirilmedi.
- **Ölü / eski CSS:** `credit-facilities.css` ve `finance-workbench.css` içinde hâlâ kullanılan ama eski sınıf adlarına bağlı kurallar; `credit-overview`, `credit-balance-grid`, `collection-form` gibi artık hiçbir öğeye uymayan bloklar. Silmeden önce tüm TSX'lere karşı tarama gerekir (Ticari sözleşmeler kırılması bu tür bir silmeden çıktı).
- **Finans yeniden incelemesi 1'in açık minor'ları** (düşük etkili, davranış değiştireceği için bu turda yapılmadı):
  - Çek-Senet satırında iki Tab durağı (satır `tabIndex=0` + numara düğmesi).
  - Çek-Senet `openedCopy`: liste Yenile'de kayıt artık gelmezse eski `rowVersion` ile gösterilir (işlem sunucuda eşzamanlılıkla reddedilir; yalnız bayat görünüm).
  - `LedgerMappingsView` `requestRow`, kayıt sürerken `true` dönüyor (↑↓ sırasında odak geri alınmaz; `AccountChartView`'de de aynı).
  - `JournalLedgerView` `firstLoad` sonrası Yenile / filtre yüklenirken kartlar önceki sayıları gösteriyor.
  - Çek-Senet'te Enter iki yerde işleniyor: çubuğun Aç'ı yakalama evresinde önce çalışır ve olayı tüketir; satır işleyicisi yalnız Aç kapalıyken (seçili kayıt yokken) yedek. Kod yorumu bu sırayla uyumlu; `openDocument` idempotent. Değişiklik gerekmedi.
- **Değerleme / Defter ayrıntıları (inceleme minor'ları, gerekçeyle atlandı):** grup hesabında klavyeyle açma yok (tabanda da yoktu); Yeni / Vazgeç tarihi koruyor (mevcut davranış); Nakit Akışı Excel'i 11 sütun; değerleme fişi açıkken Excel.

## Üretim / İK / Dış Ticaret / Duran Varlık'tan kalanlar (taslak 10, veri / karar bekleyen)
- **Üretim emirleri eksik sütunlar** (İyi / fire, Rota, Planlanan maliyet): ekran düzeni kataloğuna yeni anahtar ister (sunucu değişikliği); çizilmedi.
- **Üretim:** MRP iç düzeni ve Maliyet analizi tablo hücreleri eski stilde; oluşturma sayfaları (Yeni üretim emri, İş merkezi tanımla) menüde ayrı sayfa olarak duruyor (menüden çıkarmak paylaşılan navigasyon ve sunucu değişikliği ister); kurulum kuralı satırları aile kodlarıyla anahtarlanıyor (`key={from-to}`, yazarken odak kaybı riski — önceden var olan davranış).
- **İK:** tanım listelerinde AdvancedDataGrid'in kendi arama kutusu ve "Görünüm" düğmesi (ListToolbar'a geçmedi); bordro taslakları listesinde sağ panel yok; grid'in kendi istemci sayfalayıcısı eski görünüşte.
- **İK Dönem özeti:** parametreler gizliyken F9 / İşlemler › Raporu çalıştır boş tarihle istek gönderiyordu; son düzeltme turunda kapandı (istek gitmez, parametreler açılır, ilk boş alan odaklanır; testli). Not: istemci yalnız boş tarihi denetliyor (formun `required` kuralı); başlangıç > bitiş ve 366 gün sınırı bugünkü gibi sunucuda.
- **Duran Varlık kıymet kartı:** salt okunur kayıtta künyede "DÜZENLEME" etiketi (kit `mode` yalnız create / edit); kart tablolarında satır ~44px (kabuğun genel kuralı); edinim karşı hesabı seçilince Esc "kaydedilmemiş değişiklik" soruyor; `disposal` ucu 404 dönen elden çıkarılmış kıymette "Elden çıkarma kaydı yüklenmedi".
- **Dış Ticaret:** koyu temada "Stok belgesi" bölümünün zemini hafif farklı.
- **Ölü CSS:** `.fixed-asset-status`, `.fixed-asset-danger`, `.manufacturing-cancel` hiçbir bileşende kullanılmıyor; `manufacturing.css` / `fixed-assets.css` içinde eski hex renkli kurallar.
- **Dosya büyüklüğü:** `HumanResourcesPage.tsx` ~7k, `ManufacturingPage.tsx` ~5,4k satır; başka modüllerden içe aktarmalar (`SalesDocumentGrid`, `useStockDetailPanelOpen`) ortak kite taşınmalı.

## Modüller arası (son tüm dal incelemesi)
- **Devre dışı nedenlerinin yazımı tutarsız:** "Önce bir kayıt seçin" / "Önce bir kredi seçin" / "Önce bir kaynak seçin"; silme kalıpları üç türlü ("… silinemez — İşlemler › …", "… silinmez; İşlemler › İptal", "…; İşlemler'den iptal edin."). Bir yazım kılavuzu turunda eşitlenmeli.
- **Satınalma'nın kit CSS cilası Finans / Üretim yüzeylerine de uygulanıyor:** `document-detail.css` `td button.row-action` (26px / 12px) ve `th:is(.nx-num, .dd-num)` sağa yaslama, o modüller bu kurallar yokken onaylandı. Son düzeltme turunda Kredi Hareketler / Teminatlar (açık ve koyu) ve Çek ve Senet listesi sahte API ile çekildi: sayı başlıkları artık sayıların üstünde, satır düğmeleri okunur boyda, kırılma görülmedi. Banka Ekstreleri ve Üretim / İK ızgaraları birleştirmeden sonra çekilmedi.

## Kapananlar (Faz 4)
- Eski `actions` başlık yuvası `DocumentSurface`'ten kaldırıldı (Satış ve Satınalma belgelerinin tamamı İşlemler menüsünde).
- PurchaseInvoiceModal açıkken çubukta komutlar var (Yenile belgeyi yeniler, Sil soluk + neden, İşlemler: Ödeme ekle / İade oluştur / Faturayı iptal et).
- İadeler: "İade, fatura detayından oluşturulur" ipucu başlık satırında geri (Satış ve Satınalma İadeleri).
- Bağımsız fatura taslakları listesi giriş listesinden ~12px aşağıda duruyordu: Mal kabul faturası girişi de standart liste sayfası oldu.
- Görsel kabulde düzeltilen tutarsızlıklar: alış faturası belgesinde tarih / "Satırlar" başlığı / # sütunu; belgelerde bölüm ve satır düğmesi boyları; talep / sipariş / giriş listelerinde eş aralıklı belge numarası; tüm listelerde sayı sütunu başlıkları sağa dayalı.

## Bekleyebilir
- Kısayol ayrıştırma boşlukları (Alt+Shift+ı, `Ctrl++`, Mac'te Delete), `void run()` işlenmeyen ret, kısayol yardım penceresinde odak tuzağı, İşlemler menüsü konumunun kaydırmada güncellenmemesi.
- Üst çubuk z-index ile şifre bildirimi, `/api/custom-menus/` çift istek, sabit Türkçe aria-label.
- Satır `:focus-visible`, varsayılan 160px sütunların taşması (ör. Satış Faturaları Durum), seçimdeyken kısa listede 57px büyüme.
- Yük altında hassas testler için zaman aşımı genişletildi (`vitest.config.ts`); kök neden incelenebilir.

## Kullanıcıya bildirilen davranış değişiklikleri
- Satış Faturaları / İadeler / Talepler: satıra tek tık artık belgeyi açmıyor, satırı seçili yapıyor (sağ panel); açmak için çift tık, Enter, Aç ya da numara bağlantısı.
- Satış belge detaylarında başlıktaki iş akışı düğmeleri (Kabul et, Siparişe dönüştür, Faturayı iptal et…) kaldırıldı; aynı koşullarla İşlemler menüsünde (Alt+İ).
- Kampanyalar tanım ekranı oldu: ilk kampanya kendiliğinden seçilmiyor; kampanya silinmez, Sil Pasifleştir'i önerir.
- Teklifler listesinde 1440'ta araç satırı tek satır: arama kutusu daraldı; geniş ekranda tablo araçları Görünüm menüsünde toplanıyor.
- Stok Kartları tablosunun kayıt kimliği değişti (`inventory-stock-list`): kullanıcıların tarayıcıda kayıtlı sütun ayarları bir kez sıfırlanır.
- F2 her yerde "Yeni"; kaydetme Ctrl+S / çubuktaki Kaydet. Formda Esc = Vazgeç (değişiklik varsa onay).
- **Satınalma (Faz 4):**
  - Satınalma Faturaları, Talepleri, Siparişleri, İrsaliyeleri, Mal kabulleri, Mal kabul faturası girişi, Bağımsız fatura taslakları: tek tık satırı seçiyor (sağ panel), açmak için çift tık, Enter, Aç ya da numara bağlantısı. Listelerde yüklenince ilk satır kendiliğinden seçilmiyor.
  - Satınalma Faturaları: "Fatura ekle" başlık menüsü yok; F2 / Yeni doğrudan Mal kabulünden fatura, "Mal kabulsüz fatura" İşlemler'de. Satır "⋯" menüsü yok; Ödeme ekle / İade oluştur / İptal et İşlemler'de; ödemeli faturada İptal et soluk + neden. Varsayılan sütunlar değişti (Sipariş no, Döviz, Satır gizli; adlar Tarih / Vade / Genel toplam / Kalan), durum etiketi ödeme durumunu gösteriyor (İşlendi / Kısmen ödendi / Ödendi / Vadesi geçti / İptal), iptal faturada Kalan "—". Tablo kimliği `purchase-invoices-v2`: tarayıcıda kayıtlı sütun genişlik / gizleme ayarları bir kez sıfırlanır.
  - Alış faturası belgesi: başlıktaki İade oluştur / Ödeme ekle / ⋯ İptal düğmeleri İşlemler'de (Alt+İ); belge açıkken çubuk dolu (Yenile belgeyi yeniler, Sil soluk + neden).
  - Talepler / Siparişler: başlık düğmeleri (Talep oluştur, Yeni satınalma siparişi) çubuğun Yeni'si (F2); Alanlar, Talep oluştur (siparişlerde) ve Talep üzerinden teklif gir (Teklifler) İşlemler'de. Listeden Onayla / Reddet talep belgesini karar bölümünde açıyor. Siparişlerdeki "gecikti" yazısı yerine kırmızı Gecikmiş etiketi.
  - Teklifler: Aç belirli talebi açıyor (önceden yalnız talep ekranına genel bağlantı vardı); Yenile eklendi.
  - "Kısmi mal kabul" her yerde "Kısmen alındı". Hata ve bildirimler belge açıkken de görünüyor.
  - İrsaliyeler: siparişin irsaliye çalışma alanı Yeni (F2) / İşlemler › Siparişi aç arkasında; sipariş aramasında Enter arar (kaydetmez). Mal kabulleri: "Detayları aç" tek mal kabulü belge olarak açıyor (siparişin mal kabul listesi değil).
  - Mal kabul faturası girişi: tek tık satır içi formu açmıyor; form Aç / Enter / çift tıkla tam sayfa açılıyor, Vazgeç girilen değerleri atıyor.
  - Bağımsız fatura taslakları: form listenin üstünde sürekli durmuyor; F2 ya da Düzenle tam sayfa açar, kaydet / vazgeç listeye döner; satır düğmeleri (Düzenle, Muhasebeleştir) İşlemler'de; üst etiket, rol çipi ve "Taslak · muhasebeleştirilmedi" bandı kaldırıldı.
  - Yeni satınalma siparişi toplamları Satış oluşturma dökümüyle: KDV oranlarına göre, "Mal / hizmet toplamı", "Genel toplam · Ödenecek tutar".
  - Belgelerdeki bölüm düğmeleri ve tablo satırı düğmeleri (Fatura oluştur, İptal et, Bu teklifle sipariş) tek boyda; satır düğmelerinin yazısı okunur boyda (Satış belgelerinde de).
- **Cari & CRM, Finans, Üretim / İK / Dış Ticaret / Duran Varlık (modül geçişleri; modül raporlarında listelendi, kullanıcıya birleştirmeden önce bildirilmeli):**
  - Ortak: tek tık satırı seçer; çift tık / Enter / Aç açar. Listeler açılınca ilk satır kendiliğinden seçilmez (Cari Hesaplar, Yevmiye Defterleri, Kasalar / Bankalar, Banka Ekstreleri, Bütçe, Çek ve Senet, Krediler, Üretim emirleri, İş merkezleri, Duran Varlık, Dış Ticaret). Başlık, panel ve satır düğmeleri İşlem Çubuğu'na (Yeni F2, Excel Ctrl+E) ve İşlemler menüsüne taşındı; CSV İşlemler'de.
  - Cari: "Both" türü her yerde "Müşteri & Tedarikçi" (çipte önceden "Diğer"). Dar ekranda panel modal pencere değil, Ctrl+. ile açılan çekmece. Ekstrede "Ters kayıt" etiketi artık görünüyor (`reversalOfId`), tutarlar para simgesiz ("86.400,00"), bakiye "B / A" ekiyle, dönem çipleri eklendi; tablonun XLSX düğmesi çubuğun Excel'i. Mutabakat penceresinde tutarlar sağa hizalı.
  - CRM: aşama düğmeleri İşlemler'de; kapanmış fırsatta Aç soluk ve nedenli; Sil çubukta (hedef Aç ile aynı: odaklı / geçerli / tek işaretli satır).
  - Finans · Yevmiye: tek "Tutar" sütunu Borç / Alacak olarak ayrıldı; salt okunur fiş ekranı yeni (önceden yoktu); Yevmiye Fişi'nin Kaydet'i çubukta, Vazgeç değişiklik varsa soruyor.
  - Finans · Kasalar / Bankalar: Hareketler penceresi yerine tam sayfa hesap ekstresi; hareket / transfer formları sağdan çekmece; iptal ekstrede seçilen satıra İşlemler'den. Tablo kimliği `studio-finance-finance-accounts` → `studio-finance-finance-accounts-cash-v2` / `-bank-v2`: kayıtlı sütun ayarları bir kez sıfırlanır. Banka Ekstreleri, Bütçe, Nakit bütçesi ve Krediler listeleri de yeni kimliklerle (`studio-finance-*-v2`, `studio-finance-credit-facilities-v1`); önceki kimlikleri bu turda karşılaştırılmadı.
  - Finans · Hesap Planı: Pasifleştir PUT gövdesi hesabın gerçek değerlerini gönderiyor (yukarıda, kullanıcı kararı bekliyor). Hesap Eşleştirmeleri seçim anında değil Kaydet ile kaydediyor (istek aynı). Mizan'ın özet kutucukları kalktı (rakamlar toplam satırında ve alt bilgide).
  - Finans · Raporlar: Vade Takibi yaşlandırma hücresi düzeltildi (Fatura ve Açık tutar ayrı sütun; eskiden başlıklar kayıyordu). Nakit Akışı TMS 7 / sınıflandırma, Vade Takibi ve kur listesine Excel / CSV eklendi (yeni istek yok).
  - Finans · Çek ve Senet / Krediler: ilk satır seçilmiyor ve açılıştaki `/events` GET kalktı (yalnız seçilen kayıt için). Çek ve Senet satır "⋯" menüsü kalktı (işlemler İşlemler'de); kayıt Aç / Enter / çift tıkla kendi yüzeyinde açılıyor. Krediler liste tipinde; açık kredi belge yüzeyinde; "Geri ödeme kaydet" yeni giriş; Yenile yüklenirken kapalı; İşlemler'deki faiz komutları Faiz sekmesine geçer; teminat ve kredi formları tam sayfa kayıt formu.
  - Finans · Aktarılabilir Kaynaklar: Seçilenleri aktar İşlemler'de (toplu aktarım hatası değişmedi, yukarıda).
  - Üretim: emir kodu hücresi düğme değil; emir paneli Aç / Enter / çift tıkla açılıyor, liste 1440'tan darsa panel varsayılan kapalı; iş akışı adımları İşlemler'de; reçete satır düğmeleri kalktı; iş merkezleri tanım ekranı (Yeni sağda form açar, Esc kapatır, 1280 altında çekmece); Malzeme planlama "Plan geçmişi" İşlemler'de; reçete bileşen / rota tabloları kit satır tablosu.
  - İK: satır düğmeleri (Düzenle / Düzelt / Onayla / Reddet / İptal, "⋯") Aç ve İşlemler'de; satır seçince sağda özet paneli; toplu düzenlemede çift tık yalnız hücreyi düzenler; "OnLeave" yerine "İzinde". Dönem özeti rapor ekranı (F9 ile çalışır, parametre değişince "güncel değil" der); kural setleri ve İşyeri ve takvim tanım ekranı, Onayla / Reddet İşlemler'de.
  - Dış Ticaret: aşama kartları yerine çipler; Düzenle / İptal / İlerle İşlemler'de, iptal onayı pencerede; stok belgesi bağlama İşlemler › "Stok belgesi bağla…" seçim penceresiyle; alt bilgi "ilk 100 / toplam N".
  - Duran Varlık: başlık "Duran Varlıklar"; satır menüsü ve panel düğmeleri İşlemler'de; edinim formu tam sayfa; kıymet kartı salt okunur kayıt (bölümler, amortisman tablosu ekstre biçiminde); Amortismanı kaydet / Elden çıkar / Zimmetle diyalogda.
- Taslaktaki ama veri kaynağı olmayan alanlar (açık belgeler, stok seyri grafiği, depo türü/şube/sorumlu, sipariş önerisi, kayıtlı görünümler, gruplama) çizilmiyor; Faz 4 Satınalma da bunları eklemedi, veri kaynağı gelene kadar bekliyor.
