'use strict';

/**
 * Şablon yardımcıları — para biçimi ve tarih.
 * Tüm görünümlerde `tl()` ve `tarih()` olarak kullanılabilir.
 */

const trFmt = new Intl.NumberFormat('tr-TR', {
  style: 'currency',
  currency: 'TRY',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 3990 → "3.990,00 ₺" */
function tl(deger) {
  return trFmt.format(Number(deger) || 0);
}

/** "2026-11-02 22:45:05" → "02.11.2026 22:45" */
function tarih(deger) {
  if (!deger) return '—';
  const d = new Date(String(deger).replace(' ', 'T') + (String(deger).includes('T') ? '' : 'Z'));
  if (Number.isNaN(d.getTime())) return String(deger);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const DURUM_ETIKET = {
  yeni: 'Yeni',
  hazirlaniyor: 'Hazırlanıyor',
  kargoda: 'Kargoda',
  teslim: 'Teslim edildi',
  iptal: 'İptal edildi',
};

const ODEME_ETIKET = {
  bekliyor: 'Bekliyor',
  odendi: 'Ödendi',
  basarisiz: 'Başarısız',
  kapida_odeme: 'Kapıda ödeme',
};

module.exports = { tl, tarih, DURUM_ETIKET, ODEME_ETIKET };
