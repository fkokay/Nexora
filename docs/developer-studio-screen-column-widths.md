# Geliştirici Studio: liste sütun genişlikleri

Yerleşik ekran görünümleri, desteklenen listelerde sütun genişliğini 80–640 piksel aralığında düzenleyebilir. Sabit işlem sütunlarına genişlik atanamaz. Genişlik taslağa kaydedilir, yayımlanan görünümle etkin olur ve kiracı kapsamındaki ekran görünümü sürümüne dahildir.

İnsan kaynakları tarafında desteklenen listeler:

- Personel (`hr-employees`)
- İzin talepleri (`hr-leave-requests`)
- Puantaj (`hr-attendance`)
- İşyeri atamaları (`hr-workplace-assignments`)
- İşyeri takvimleri (`hr-workplace-calendars`)
- Personel takvim istisnaları (`hr-employee-calendar-overrides`)

Yeni ekranlara genişlik desteği eklerken API'deki `ResizableColumnScreenKeys`, Studio editöründeki `screensWithResizableColumns` ve canlı tablo hücrelerindeki genişlik uygulaması birlikte güncellenmelidir. API sabit sütunları ve 80–640 piksel dışındaki değerleri reddeder.
