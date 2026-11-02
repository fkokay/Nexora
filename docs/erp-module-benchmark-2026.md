# ERP modül karşılaştırması ve Nexora öncelikleri

Güncelleme: 2026-10-21

Bu karşılaştırma SAP, Oracle ve Microsoft’un resmi ürün/dokümantasyon sayfalarına dayanır. Ürün özellikleri sürüm, lisans, ülke ve kurulum biçimine göre değişebilir. Buradaki liste ürünlerin birebir özellik eşitliği iddiası değildir; Nexora için modül kapsamı kontrol listesidir.

## Pazar karşılaştırmasından çıkan ortak alanlar

| Alan | Büyük ERP ürünlerinde görülen örnek kapsam | Nexora için durum / sonraki iş |
|---|---|---|
| Finans ve muhasebe | Borç/alacak, nakit ve banka, bütçe/planlama, maliyet muhasebesi, sabit kıymet, finansal raporlama | Kasa/banka, döviz ve yevmiye temeli mevcut. Çek-senet, bütçe, mizan/bilanço ve kapanış kontrollerini tamamla. |
| Satın alma ve tedarik zinciri | Talep, teklif/sourcing, sipariş, mal kabul, fatura, tedarikçi riski ve performansı | Talep-teklif-sipariş-mal kabul-fatura hattı mevcut. Sözleşme, tedarikçi değerlendirme ve teslimat/taşıma maliyetlerini ekle. |
| Stok ve depo | Ürün bilgisi, depo/raf, sayım, kalite, lot/seri, giriş-çıkış ve maliyet görünürlüğü | Kart/depo/transfer ve temel lot-seri alanları mevcut. Lokasyon, sayım, kalite karantinası ve tam izlenebilirlik akışlarını tamamla. |
| Planlama ve üretim | Talep tahmini, ana planlama/MRP, üretim, kapasite, kalite ve varlık bakımı | Reçete, iş emri, MRP ve temel sonlu kapasite mevcut. Talep tahmini, makine/kalıp kısıtları, kalite planı ve bakım iş emirleri sonraki dilimler. |
| Proje ve performans | Proje planı, kaynak, maliyet kontrolü, kârlılık, bütçe/forecast ve analitik | Workflow ve rapor altyapısı mevcut. ERP proje bütçesi, zaman/masraf kaydı, kaynak planı ve gerçekleşen maliyet modülü ekle. |
| İnsan ve bordro | Çalışan yaşam döngüsü, organizasyon, izin/mesai ve bordro | Personel/izin/puantaj ve kaynaklı Türkiye bordro kural taslakları başlatıldı. Bordro hesaplama, ikinci kişi onayı, dönem kapama ve resmi beyan bağlantısı ayrı fazlardır. |
| Risk, denetim ve uyum | Yetki ayrılığı, sürekli kontroller, denetim izi, risk ve uyum analitiği | Tenant izinleri ve denetim izi mevcut. Görevler ayrılığı matrisi, politika ihlali panosu ve kontrol kanıtı yönetimini genişlet. |
| e-Dönüşüm ve yerelleştirme | Ülke bazlı vergi, e-belge, yasal muhasebe ve onaylı entegrasyonlar | e-Fatura/e-İrsaliye/e-Arşiv için sağlayıcıdan bağımsız onaylı kuyruk temeli var. Sağlayıcı adaptörü, test ortamı kabulü, gelen belge ve e-Defter/e-Müstahsil eksik. |
| Taşıma ve ithalat/ihracat | Nakliye planı, navlun, landed cost, gümrük ve transit süreçleri | Dış ticaret ve taşıma modülleri eksik; e-Dönüşüm işinden ayrı ele alınmalı. |

## İlk ürün dilimleri

1. **Günlük kontrol modülleri:** depo lokasyonları, stok sayımı ve kalite/karantina; satın alma sözleşmeleri ve tedarikçi değerlendirme.
2. **Finansal tamamlayıcılar:** çek-senet portföyü, bütçe/nakit akışı planı, mizan ve bilanço raporları.
3. **Üretim operasyonları:** kalite planı/uygunsuzluk, bakım varlıkları ve iş emirleri, ileri kapasite kısıtları.
4. **Proje kârlılığı:** proje bütçesi, kaynak ve zaman kaydı, masraflar ve gerçekleşen maliyet.
5. **Yerelleştirme ve lojistik:** e-belge sağlayıcı adaptörleri ve sandbox kabulü; dış ticaret, navlun ve landed cost.

Bu sıralama ürün kapsamı önerisidir; her iş dilimi tenant veritabanında tutulmalı, firma parametreleri (ör. negatif stok) ayrı ayarlanmalı ve finansal/uyum etkili değişiklikler denetlenebilir olmalıdır.

## Kaynaklar

- [SAP Cloud ERP](https://www.sap.com/products/erp.html) — finans, İK, üretim, tedarik zinciri, satış ve satın alma kapsamı.
- [Oracle Fusion Cloud Applications](https://docs.oracle.com/en/cloud/saas/index.html) — Financials, Procurement, Project Management, Risk Management, ERP Analytics, Supply Chain Planning, PLM ve Service Logistics.
- [Microsoft Dynamics 365 Finance](https://learn.microsoft.com/en-us/dynamics365/finance/finance-welcome) — borç/alacak, banka/nakit, bütçe, maliyet muhasebesi, sabit kıymet ve finansal raporlama.
- [Microsoft Dynamics 365 Supply Chain Management](https://learn.microsoft.com/en-us/dynamics365/supply-chain/supply-chain-management-welcome) — stok, depo, planlama, tedarik, üretim, kaliteye komşu süreçler, varlık bakımı, taşıma ve landed cost.
- [Microsoft Supply Chain Management docs](https://learn.microsoft.com/en-us/dynamics365/supply-chain/) — depo, envanter, procurement, master planning, manufacturing, asset management, service management, transportation ve landed-cost dokümantasyon alanları.
