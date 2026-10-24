# Alış faturasına bağlı sabit kıymet muhasebesi

Bir sabit kıymet alış faturasıyla ilişkilendirilebilir. Edinim yevmiyesi ise fatura satırlarının hangi kıymete ne kadar dağıtıldığını ve KDV'nin indirilebilir olup olmadığını güvenilir biçimde bilmeden oluşturulmaz.

Alış faturası toplamı doğrudan sabit kıymet maliyeti kabul edilemez: faturada birden çok kalem, birden çok kıymet, indirilebilir KDV veya maliyete eklenmesi gereken başka giderler bulunabilir. Mevcut kayıt modeli bu sınıflandırma ve dağıtım kararlarını tutmuyor. Bu yüzden fatura bağlantısı olan varlığın edinim kaydı API tarafından `409 Conflict` ile bekletilir ve `requiresAccountingPolicyDecision` döner. Bu yanıt, faturanın yevmiyeye aktarılmış olmasının edinim yevmiyesini de oluşturduğu anlamına gelmez.

Bu akış açılmadan önce ürün sahibi/muhasebe sahibi şu kuralları belirlemelidir:

- Fatura satırı ve ek giderlerin kıymetlere dağıtım yöntemi; bir faturanın birden fazla kıymeti destekleyip desteklemediği.
- İndirilebilir ve indirilemeyen KDV'nin edinim maliyetine etkisi.
- Döviz faturalarında edinim maliyetine uygulanacak tarih ve kur kaynağı.
- Fatura yevmiyesiyle edinim yevmiyesi arasındaki hesap eşlemesi ve yinelenen kayıt önlemi.

Bu kararlar belgelendikten sonra API, satır bazlı dağıtımı saklayıp faturanın kaynak yevmiyesiyle edinim kayıtlarını idempotent şekilde bağlayabilir.
