# Cari Yönetimi modül yapısı

`CustomersPage.tsx` ekranın veri akışını, API çağrılarını ve kayıt işlemlerini koordine eder. Görsel parçalar `components/` altında bağımsız TSX dosyalarıdır:

- `CustomerDirectoryHeader.tsx`: ekran başlığı ve ana aksiyonlar
- `CustomerFilters.tsx`: arama, tür ve durum filtreleri
- `CustomerGrid.tsx`: liste tablosu, yenileme ve sayfalama
- `CustomerDetailPanel.tsx`: seçili cari kaydının detay görünümü

Yeni liste ekranlarını da `src/<modül>/components/` altında başlık, filtre, grid ve detay bileşenlerine ayırın. API ve ekran durumunu sayfa/container bileşeninde tutup alt bileşenlere açık props verin; böylece Studio’da her ekran parçası bağımsız düzenlenebilir.
