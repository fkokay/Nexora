# Doğrudan nakit bütçesi izin migration'ı — kısa kabul planı

Bu plan, `20261026121500_AddDirectCashBudgetPermissions` Platform migration'ı için [staging izin runbook'una](finance-cash-budgets-permission-staging-runbook-20261026.md) ek bir migration preflight ve onay kapısıdır. Migration, EF designer ve snapshot kaynakları salt-okunur incelendi; reviewer beş katalog/designer/snapshot satırının eşleştiğini doğruladı. Bu yalnızca kaynak düzeyi incelemedir. Migration/SQL çalıştırılmadı, veritabanı değiştirilmedi veya uygulanmış olduğu doğrulanmadı. DB uygulama durumu **NOT RUN**; uygulama için DBA onayı gereklidir.

## Kabul kapıları

Her satır için PASS / FAIL / NOT RUN, tarih-saat (Europe/Istanbul), sorumlu ve maskelenmiş kanıt bağlantısı kaydedin. FAIL durumunda sonraki kapıya geçmeyin.

| Kapı | Kabul ölçütü | Durum / kanıt |
| --- | --- | --- |
| 1. Kaynak ve paket/history preflight | Salt-okunur kaynak incelemesinde katalog, EF designer ve snapshot'taki beş ilgili satırın eşleştiği reviewer tarafından doğrulanmıştır. Bu inceleme migration'ın davranışını DB'de doğrulamaz. Ayrıca release paketindeki migration kimliği ve sırası doğrulanır. Platform `__EFMigrationsHistory` dışa aktarımı doğru Platform DB'den alınır; migration uygulanmamış/pending görünür ve daha önce uygulanmış tenant migration'ları Platform history'sine karışmamıştır. Beklenmeyen, yinelenen veya sırasız ID varsa durdurulur. | Kaynak düzeyi inceleme: **PASS** (salt-okunur reviewer incelemesi; beş satır eşleşti). Paket ve DB history preflight: **NOT RUN**. |
| 2. Disposable backup ve restore | Platform DB'nin yedek kimliği, zamanı ve bütünlük/checksum kanıtı kaydedilir; yedek izole, disposable bir DB adına geri yüklenir. Restore tamamlanması ve hedef DB kimliği doğrulanır. Kaynak/staging/production DB'ye prova yapılmaz. |  |
| 3. Migration prova ve veri koruma | Yalnız restore edilmiş disposable Platform DB'de migration uygulanır. Öncesi/sonrası izin tanımları ve kuralları karşılaştırılır: eksik tanımlar eklenir; mevcut özel rol/kullanıcı kuralları ve eşleşen TenantUser read kuralları korunur, topluca değiştirilmez. TenantUser varsayılanı sadece `erp.finance-cash-budgets.read` olur. Migration history'de beklenen ID görünür. |  |
| 4. Staging API kabulü | [Staging runbook](finance-cash-budgets-permission-staging-runbook-20261026.md) sentetik tenant'ta tamamlanır: TenantUser GET liste/detay `200`; TenantUser create POST, PUT ve approve POST `403`; TenantAdmin create POST `201`, PUT ve approve POST `200` (onaylayan farklı TenantAdmin). Başlangıç/son custom grant karşılaştırması özel kuralların korunduğunu gösterir. |  |
| 5. `Down` davranışı ve geri dönüş | `Down` yalnız disposable restore üzerinde değerlendirilir. Beklenti kasıtlı olarak preserve-only/no-op'tur: permission definition veya rule silinmez; bu nedenle migration geri alınmış olsa bile grant satırlarının kalacağı varsayılır. `Down`, izinleri temizleyen bir rollback değildir. Uygulama rollback'i gerekirse ayrı planlanır; bir grant'in kaldırılması gerekiyorsa izin yönetimi akışıyla ve sahibi onayıyla yapılır. Sonuç kanıtı staging'e veya production'a yansıtılmaz. |  |
| 6. Production DBA approval | Production öncesi DBA, tam release artifact/hash, Platform history preflight, disposable backup/restore ve migration prova sonuçları, staging API kabulü, custom grant karşılaştırması ve preserve-only `Down` etkisini inceleyip yazılı onay verir. Onaylayan, zaman, kapsam ve release kimliği kayda girer. Onay yoksa production migration planlanmaz/uygulanmaz. |  |

**Mevcut durum:** Salt-okunur kaynak incelemesi tamamlandı; DB uygulama veya SQL çalıştırma **NOT RUN**. Bu kaynak incelemesi staging/disposable kabul kapılarını tamamlamaz ve DBA onayının yerine geçmez. Production DB'ye uygulama için tam release artifact/hash ve diğer kabul kanıtlarına bağlı yazılı DBA onayı zorunludur.

## Kayıt ve durdurma koşulları

- DB adlarını, sunucu/tenant kimliklerini ve kullanıcıları paylaşılabilir kanıtta maskeleyin; yedek hash'ini ve migration artifact hash'ini release kaydında saklayın.
- Backup restore doğrulanamazsa, history beklenen sırada değilse, özel izin kuralı değişirse, TenantUser yazma/onay çağrısı 2xx alırsa veya `Down` satırları silerse kabulü durdurun ve DBA/izin sahibine yönlendirin.
- Bu plan production çalıştırma izni vermez. Production için ayrıca kayıtlı DBA approval zorunludur.
