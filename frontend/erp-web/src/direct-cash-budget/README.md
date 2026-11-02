# Doğrudan nakit bütçesi

Sayfa container'ı API, durum ve işlemleri yönetir. `components/` içindeki TSX dosyaları sunum katmanını içerir:

- `DirectCashBudgetMetrics`: plan ve tahmin sayaçları
- `DirectCashBudgetForecast`: onaylı planların tahmin tablosu
- `DirectCashBudgetPlanList`: plan listesi ve açma eylemi
- `DirectCashBudgetEditor`: taslak formu ve aylık satırlar
- `DirectCashBudgetDetail`: seçili plan ve satır tablosu

Paylaşılan veri tipleri ve biçimlendirme yardımcıları `types.ts` içinde tutulur.
