# ERP tasarım dili — sonraki planlara devredilenler (2026-11-17)

Faz 0, Faz 1 (Task 1–11), Faz 2 Stok (Task 1–8), Faz 3 Satış (Task 1–5: listeler, belge detayları, belge oluşturma ekranları, Kampanyalar, Dağıtım planı, görsel kabul) ve Faz 4 Satınalma (Task 1–6: 9 liste, 5 belge, 4 oluşturma ekranı, görsel kabul) tamamlandı. Aşağıdakiler bilinçli olarak sonraki planlara bırakıldı.

## Sonraki planda mutlaka ele alınacaklar
- **Modül geçişleri (Faz 1 Task 12–18 durduruldu):** Cari/CRM, Finans, Üretim, diğer modüller, Ayarlar, low-code ekranları; her modül işlem çubuğu + ekran düzeniyle birlikte ve modül onay kapısından geçerek taşınacak. Satış (Faz 3) ve Satınalma (Faz 4) tamamlandı; Ticari sözleşmeler (ayrı ekran tipi) Satınalma fazına girmedi.
- **Eski `global-components.css` temizliği ("Task 2b"):** `.app-shell * { box-shadow:none … } !important` (satır ~66-70) ve h1–h4 / label / small `!important` boyutları (~58-64). Tüm ekran taramasıyla kaldırılmalı; yeni bileşenler şimdilik outline / pseudo-element ile çalışıyor.
- **Faz 1 Task 2 artıkları:** `platform-tenant-provisioning.css` içe aktarılmayan `index.css`'teki `--accent`/`--surface` değişkenlerini kullanıyor; çakışan `.nav-item.active` kuralları; ölü `.credit-overview-title` kuralı.
- **Kabuk:** finance-workbench / ai-settings yapışkan (sticky) ofsetleri eski üst çubuğa göre; alt menü 1280 altında katlanmak yerine gizleniyor ve daraltılamıyor; alt menü sırası tenant'ın menü sıralamasını izlemiyor.
- **Platform yönetim sayfası:** iki form varken ve odak hiçbirinde değilken Ctrl+S tarayıcının "Sayfayı kaydet" penceresini açıyor (kabuk dışında tarayıcı tuşları serbest bırakıldı).
- **Gerçek ortam doğrulaması:** Playwright UI denetimi (`npm run test:ui-design`) bu dalda hiç çalıştırılamadı (test ortamı/kimlik bilgisi yok); tüm görsel kontroller sahte API ile yapıldı.

## Satış'tan kalanlar (Faz 3, veri / karar bekleyen)
- **Fatura listesinde vade ve kalan yok:** `/api/sales/invoices/` liste cevabında vade tarihi, tahsil edilen / kalan tutar yok → Vade ve Kalan sütunları, "Tahsil edilmemiş" / "Vadesi geçen" özet kartları, "Vadesi geçti" etiketi ve "bu ay" filtresi çizilmiyor (Kalan yalnız sağ panelde, detay cevabından). Uç nokta genişletilirse eklenecek (Faz 4).
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

## Kapananlar (Faz 4)
- Eski `actions` başlık yuvası `DocumentSurface`'ten kaldırıldı (Satış ve Satınalma belgelerinin tamamı İşlemler menüsünde).
- PurchaseInvoiceModal açıkken çubukta komutlar var (Yenile belgeyi yeniler, Sil soluk + neden, İşlemler: Ödeme ekle / İade oluştur / Faturayı iptal et).
- İadeler: "İade, fatura detayından oluşturulur" ipucu başlık satırında geri (Satış ve Satınalma İadeleri).
- Bağımsız fatura taslakları listesi giriş listesinden ~12px aşağıda duruyordu: Mal kabul faturası girişi de standart liste sayfası oldu.

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
- Taslaktaki ama veri kaynağı olmayan alanlar (açık belgeler, stok seyri grafiği, depo türü/şube/sorumlu, sipariş önerisi, kayıtlı görünümler, gruplama) Faz 4'e kadar çizilmiyor.
