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

  it.each([
    ['Stok Kartını Kaydet', 'save'], ['Değişiklikleri Kaydet', 'save'], ['Konumu kaydet', 'save'],
    ['Taslağı sil', 'delete'], ['Fişi yazdır', 'print'],
  ])('in a record form header flags %s (ends with the word) as %s', (text, command) =>
    expect(matchCommonActionText(text, { endsWith: true })).toBe(command))

  it.each(['Stok Kartını Kaydet', 'Konumu kaydet'])('outside a record form header ignores %s', (text) =>
    expect(matchCommonActionText(text)).toBeNull())

  it.each(['Vazgeç', 'Kaydetmeden çık', 'Değişiklikleri kaydetmeden kapat', 'Yeniden'])(
    'in a record form header still ignores %s', (text) => expect(matchCommonActionText(text, { endsWith: true })).toBeNull())
})
