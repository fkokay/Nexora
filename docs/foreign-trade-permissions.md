# Dış ticaret izinleri

Dış ticaret erişimi seçili firma ve üyelik kapsamında denetlenir. `TenantAdmin` firmadaki tüm dış ticaret işlemlerini yapabilir. Diğer firma üyeleri için firma yöneticisi, **İzin politikaları → Politika oluştur** bölümünde ilgili izin için bir `Allow` kuralı tanımlar. Kullanıcıya `TenantAdmin` rolü vermek gerekmez.

## Gerekli izinler

| İzin | Ne sağlar |
| --- | --- |
| `erp.foreign-trade.read` | Dış ticaret kayıtlarını, satın alma/satış sipariş seçeneklerini ve işlem yeteneklerini görüntüleme. Ekranı kullanmak için gereklidir. |
| `erp.foreign-trade.create` | İthalat veya ihracat dosyası açma. Yeni dosya oluşturacak kullanıcıya `read` ile birlikte verin. |
| `erp.foreign-trade.update` | Taslak veya planlanmış dosyanın temel bilgilerini güncelleme. |
| `erp.foreign-trade.execute` | Dosya durumunu ilerletme veya taslak/planlanmış dosyayı iptal etme. `read` ile birlikte verin. |

## Firma yöneticisinin yapacağı işlem

1. Yetkili bir `TenantAdmin`, **Yönetim → İzin politikaları** ekranını açar.
2. **Politika oluştur** bölümünde hedef olarak **Üye** veya **Rol** seçer. Tek kişiye erişim için üyeyi; aynı yetkiyi birden fazla `TenantUser` hesabına vermek için rolü seçebilir.
3. İstenen izin kodunu seçer, karar olarak **Allow · izin ver** bırakır ve politikayı kaydeder. Dış ticaret için izinleri kullanıcıların işine göre ayrı ayrı tanımlar.
4. Kullanıcı firmaya henüz üye değilse önce aynı ekrandaki **Firma üyeleri** alanından mevcut platform hesabını bulup `TenantUser` olarak ekler; üyelik eklemek kendi başına dış ticaret izni vermez.

Ekrandaki 403, kullanıcının aktif firma üyeliği/oturumu yoksa veya ilgili izin kuralı bulunmuyorsa beklenen sunucu reddidir; API kontrolünü atlamayın. Dış ticaret ekranı 403 mesajında gerekli izin kodunu gösterir. `read` yoksa kayıtlar ve sipariş seçenekleri yüklenmez. `create` ya da `execute` eksikse ekran ilgili işlemi gizler ve eksik izin kodlarını listeler.

Kurallar firma kapsamındadır; bir firmanın üyeliği veya politikası diğer firmaya erişim sağlamaz. `TenantAdmin` politika ile kısıtlanamaz. Erişimi bir üyeye veya `TenantUser` rolüne verin; bir kullanıcıya otomatik yetki atanmaz. Kod kataloğunda yerleşik yetki tanımı eksikse izin politikası API'si tanımı güncel katalogdan oluşturur.
