# Trendyol E-Faturam entegrasyon hazırlığı

İnceleme tarihi: 2026-11-02. Kullanıcı Trendyol E-Faturam'ı hedef sağlayıcı olarak seçti. Bu belge sağlayıcı entegrasyonunun aktif veya yasal olarak onaylı olduğu anlamına gelmez.

## Sağlayıcının yayımladığı sözleşme

- [Entegrasyon dokümanı](https://developers.trendyolefaturam.com/OpenApi/trendyol-e-faturam-entegrasyon-dokumani) bireysel API kullanıcısı ile çok sayıda mükellef yöneten pazaryeri entegratörü modelini ayırır. Nexora'nın çok firmalı kullanımı için sağlayıcıyla hangi sözleşme ve onboarding modelinin geçerli olduğu doğrulanmalıdır; `PARTNER` değeri tüm kurulumlarda varsayılmamalıdır.
- Sağlayıcının aynı dokümanı API kullanıcıları için `signIn` ile alınan token'ı; birden çok mükellefi yöneten pazaryeri entegratörleri için ek partner metotlarını belirtir. Nexora müşteri firmalarına hizmet verecekse entegratör yolu ve alt mükellef kimlik/izin akışı sağlayıcıyla açılmalıdır. Her tenant için bireysel kullanıcı adı/parola kullanmak veya `PARTNER` kaynak değerini yetki/onboarding yerine koymak varsayılmamalıdır.
- Aynı dokümanda test gateway `https://stage-apigateway.trendyolefaturam.com`, canlı gateway `https://apigateway.trendyolecozum.com` ve fatura/irsaliye oluşturma isteklerinde tutarların kuruş cinsinden girileceği belirtilir. Sabit iki ondalıklı para yaklaşımı diğer para birimleri için sağlayıcı tarafından doğrulanmadan genellenmemelidir.
- [Giden e-Fatura oluşturma](https://developers.trendyolefaturam.com/OpenApi/Giden%20eFatura/create-outgoing-e-invoice), `POST /api/invoice/documents/outgoing-einvoice`, `companyId`, `userId`, `source`, alıcı ve fatura satırlarını ister. `localReferenceId` ERP kayıt eşleştirmesi için tanımlanmıştır; tek başına idempotency garantisi belgelenmemiştir.
- [Giden e-Fatura durum sorgusu](https://developers.trendyolefaturam.com/OpenApi/Giden%20eFatura/get-outgoing-e-invoice-status) yalnızca invoice UUID ile sorgu yapar. Oluşturma isteği `invoiceUuid` kabul eder; aynı UUID'nin yinelenen POST'larda tekillik/idempotency davranışı belgelenmemiştir. **Çıkarım:** yalnız sandbox'ta, sağlayıcı sözleşmesiyle onaylanırsa istemci tarafından belirlenen sabit UUID kullanmak, yanıt kaybından sonra bu durum sorgusuna başvurmayı mümkün kılabilir; tekrar POST'un güvenli olduğu kanıtlanmış sayılmaz. Sağlayıcı durum kodları, GİB durumu ve hukuki kabul eşanlamlı değildir; onaylı durum eşlemesi gerekir.

## Nexora için uygulama bağımlılıkları

1. Mevcut `tr.e-document.submit` IntegrationHost kapısı tenant profil ve güvenli secret devri bulunmadığından kapalıdır. Kullanıcı seçimi bu güvenlik sınırını tek başına kaldırmaz.
2. Sağlayıcı tarafında tekrar denemelerin aynı faturayı ürettiği garanti edilmeden genel kuyruğun üç denemelik davranışı kullanılmamalı. `localReferenceId` bir eşleştirme alanıdır; dokümandaki tanımı tek başına idempotency garantisi değildir. Timeout veya belirsiz sonuçta mutabakat yapılmalı.
3. Tenant başına sağlayıcı kimliği, credential versiyonu, ortam, şirket/kullanıcı kimlikleri, kaynak ve belge senaryosu; sunucu tarafından izin verilen host listesi ve denetim sözleşmesi tasarlanmalıdır. Credential'lar istemciye geri gösterilmemeli veya loglara yazılmamalıdır.
4. Kaynak ERP belgesinden alıcı vergi kimliği, adres, mükellef/alias, birim kodu, kalem ve vergi alanları ile belge senaryosuna zorunlu alanların nasıl elde edildiği tanımlanmalıdır. İnternet satışı e-Arşiv senaryosu için sağlayıcı dokümanı ödeme ve taşıma bilgilerini de gerektirir. Eksik bilgiler tahmin edilmeden gönderim reddedilmelidir.
5. Test hesabı ve sentetik verilerle başarılı/olumsuz istek, aynı istemci UUID'si/referans tekrarı, timeout sonrası UUID durum sorgusu, rol/tenant ayrımı, gizli veri maskeleme ve sağlayıcı durum eşlemesi sınanmalıdır. Timeout sonrası aynı POST'u tekrarlamanın güvenli olduğu sağlayıcıca açıkça doğrulanmadıkça otomatik retry açılmamalıdır. Hesap ve yetki mevcut olmadığından bu kabul henüz yapılmamıştır.

Mevcut gönderim önizlemesi ve ikinci yönetici onayı hakkında bkz. [e-belge operatör devir notu](e-document-operator-handoff-20261026.md). Sağlayıcıya istek gönderilmedi ve kodun fail-closed davranışı değiştirilmedi.
