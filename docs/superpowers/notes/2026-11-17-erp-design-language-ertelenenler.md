# ERP tasarım dili — sonraki planlara devredilenler (2026-11-17)

Faz 0, Faz 1 (Task 1–11) ve Faz 2 Stok (Task 1–8) tamamlandı. Aşağıdakiler bilinçli olarak sonraki planlara bırakıldı.

## Sonraki planda mutlaka ele alınacaklar
- **Modül geçişleri (Faz 1 Task 12–18 durduruldu):** Satınalma, Cari/CRM, Finans, Üretim, diğer modüller, Ayarlar, low-code ekranları; her modül işlem çubuğu + ekran düzeniyle birlikte ve modül onay kapısından geçerek taşınacak. Satış: belge tipi (taslak 02) düzeni henüz yok; detay başlıklarındaki iş akışı düğmeleri İşlemler menüsüyle geçici olarak çift.
- **Eski `global-components.css` temizliği ("Task 2b"):** `.app-shell * { box-shadow:none … } !important` (satır ~66-70) ve h1–h4 / label / small `!important` boyutları (~58-64). Tüm ekran taramasıyla kaldırılmalı; yeni bileşenler şimdilik outline / pseudo-element ile çalışıyor.
- **PurchaseInvoiceModal:** açıkken çubuğu bırakıyor, yerine komut koyan yok (Satınalma planı).
- **İadeler:** kaldırılan "Faturadan iade oluştur" düğmesinin ipucu metni ("İade, fatura detayından oluşturulur") geri konmalı.
- **Faz 1 Task 2 artıkları:** `platform-tenant-provisioning.css` içe aktarılmayan `index.css`'teki `--accent`/`--surface` değişkenlerini kullanıyor; çakışan `.nav-item.active` kuralları; ölü `.credit-overview-title` kuralı.
- **Kabuk:** finance-workbench / ai-settings yapışkan (sticky) ofsetleri eski üst çubuğa göre; alt menü 1280 altında katlanmak yerine gizleniyor ve daraltılamıyor; alt menü sırası tenant'ın menü sıralamasını izlemiyor.
- **Platform yönetim sayfası:** iki form varken ve odak hiçbirinde değilken Ctrl+S tarayıcının "Sayfayı kaydet" penceresini açıyor (kabuk dışında tarayıcı tuşları serbest bırakıldı).
- **Gerçek ortam doğrulaması:** Playwright UI denetimi (`npm run test:ui-design`) bu dalda hiç çalıştırılamadı (test ortamı/kimlik bilgisi yok); tüm görsel kontroller sahte API ile yapıldı.

## Bekleyebilir
- Kısayol ayrıştırma boşlukları (Alt+Shift+ı, `Ctrl++`, Mac'te Delete), `void run()` işlenmeyen ret, kısayol yardım penceresinde odak tuzağı, İşlemler menüsü konumunun kaydırmada güncellenmemesi.
- Üst çubuk z-index ile şifre bildirimi, `/api/custom-menus/` çift istek, sabit Türkçe aria-label.
- Satır `:focus-visible`, varsayılan 160px sütunların taşması (ör. Satış Faturaları Durum), seçimdeyken kısa listede 57px büyüme.
- Yük altında hassas testler için zaman aşımı genişletildi (`vitest.config.ts`); kök neden incelenebilir.

## Kullanıcıya bildirilen davranış değişiklikleri
- Stok Kartları tablosunun kayıt kimliği değişti (`inventory-stock-list`): kullanıcıların tarayıcıda kayıtlı sütun ayarları bir kez sıfırlanır.
- F2 her yerde "Yeni"; kaydetme Ctrl+S / çubuktaki Kaydet. Formda Esc = Vazgeç (değişiklik varsa onay).
- Taslaktaki ama veri kaynağı olmayan alanlar (açık belgeler, stok seyri grafiği, depo türü/şube/sorumlu, sipariş önerisi, kayıtlı görünümler, gruplama) Faz 4'e kadar çizilmiyor.
