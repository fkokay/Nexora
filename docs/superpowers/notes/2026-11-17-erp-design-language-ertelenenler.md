# ERP tasarım dili — sonraki planlara devredilenler (2026-11-17)

Faz 0, Faz 1 (Task 1–11), Faz 2 Stok (Task 1–8) ve Faz 3 Satış (Task 1–5: listeler, belge detayları, belge oluşturma ekranları, Kampanyalar, Dağıtım planı, görsel kabul) tamamlandı. Aşağıdakiler bilinçli olarak sonraki planlara bırakıldı.

## Sonraki planda mutlaka ele alınacaklar
- **Modül geçişleri (Faz 1 Task 12–18 durduruldu):** Satınalma, Cari/CRM, Finans, Üretim, diğer modüller, Ayarlar, low-code ekranları; her modül işlem çubuğu + ekran düzeniyle birlikte ve modül onay kapısından geçerek taşınacak. Satış tamamlandı (Faz 3); Satınalma belge ekranları ortak belge takımını kullanıyor ama başlıktaki iş akışı düğmeleri (Alış faturası: İade oluştur, Ödeme ekle…) hâlâ eski `actions` yuvasında — Satınalma planında İşlemler menüsüne taşınmalı, sonra yuva kaldırılabilir.
- **Eski `global-components.css` temizliği ("Task 2b"):** `.app-shell * { box-shadow:none … } !important` (satır ~66-70) ve h1–h4 / label / small `!important` boyutları (~58-64). Tüm ekran taramasıyla kaldırılmalı; yeni bileşenler şimdilik outline / pseudo-element ile çalışıyor.
- **PurchaseInvoiceModal:** açıkken çubuğu bırakıyor, yerine komut koyan yok (Satınalma planı).
- **İadeler:** kaldırılan "Faturadan iade oluştur" düğmesinin ipucu metni ("İade, fatura detayından oluşturulur") geri konmalı.
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
- Taslaktaki ama veri kaynağı olmayan alanlar (açık belgeler, stok seyri grafiği, depo türü/şube/sorumlu, sipariş önerisi, kayıtlı görünümler, gruplama) Faz 4'e kadar çizilmiyor.
