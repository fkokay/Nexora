import { describe, expect, it } from 'vitest'
import { matchCommonActionText } from './matchCommonActionText'

describe('matchCommonActionText', () => {
  it.each([
    ['Yeni', 'new'], ['Yeni müşteri', 'new'], ['Yeni 3', 'new'], ['YENİ', 'new'],
    ['Kaydet', 'save'], ['Sil', 'delete'], ['Yazdır', 'print'], ['Yenile', 'refresh'],
    ['Excel (.xlsx)', 'export'], ['XLSX', 'export'], ['CSV', 'export'], ['Dışa aktar', 'export'],
  ])('flags %s as %s', (text, command) => expect(matchCommonActionText(text)).toBe(command))

  it.each([
    'Silinmiş kayıtlar', 'Silme talebi', 'Yeniden gönder', 'Yenilikler', 'Kaydetmeden çık',
    'Yazdırma ayarları', 'Dışa aktarma geçmişi', '', 'Onayla',
  ])('ignores %s', (text) => expect(matchCommonActionText(text)).toBeNull())
})
