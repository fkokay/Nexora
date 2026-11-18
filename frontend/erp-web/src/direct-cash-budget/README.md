# Doğrudan nakit bütçesi

Sayfa container'ı API, durum ve işlemleri yönetir. `components/` içindeki TSX dosyaları sunum katmanını içerir:

- `DirectCashBudgetMetrics`: plan ve tahmin sayaçları (şu an kullanılmıyor)
- `DirectCashBudgetForecast`: onaylı planların tahmin tablosu (listenin altında tek kart)
- `DirectCashBudgetPlanList`: liste tipi (A) — Onay bekleyen kartı, durum çipleri, kiracı ekran görünümüne göre sütunlar, Yeni / Aç komutları
- `DirectCashBudgetEditor`: taslak formu ve aylık satırlar
- `DirectCashBudgetDetail`: açılan plan belge yüzeyinde; Düzenle ve Onayla İşlemler menüsünde

Paylaşılan veri tipleri ve biçimlendirme yardımcıları `types.ts` içinde tutulur.
