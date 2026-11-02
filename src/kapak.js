'use strict';

/**
 * Ürün kapak görseli üretici.
 *
 * Mağaza kurulduğunda ürünlerin görseli yoktur; boş gri kutu yerine
 * kategoriye göre renklenen, ürün adının baş harflerini taşıyan ciddi bir
 * kapak üretir. Yönetim panelinden gerçek görsel yüklenirse o kullanılır.
 */

const PALET = {
  'yazilim-lisans': { arka: '#22303c', on: '#9fc4e0', vurgu: '#b4472c' },
  egitim: { arka: '#2c2a24', on: '#e0cf9f', vurgu: '#b4472c' },
  'donanim-aksesuar': { arka: '#242a2e', on: '#b9c6cd', vurgu: '#b4472c' },
  'kirtasiye-ofis': { arka: '#2a2622', on: '#dcc9b4', vurgu: '#b4472c' },
};

const VARSAYILAN = { arka: '#262b30', on: '#c4ccd2', vurgu: '#b4472c' };

/** Ürün adından 1-2 harflik kısaltma çıkarır (Türkçe büyük harf uyumlu). */
function kisaltma(ad) {
  const kelimeler = String(ad || '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (!kelimeler.length) return 'NX';
  const harf = (k) => k.toLocaleUpperCase('tr-TR')[0];
  if (kelimeler.length === 1) return kelimeler[0].slice(0, 2).toLocaleUpperCase('tr-TR');
  return harf(kelimeler[0]) + harf(kelimeler[1]);
}

/** Ürün adından SVG içinde benzersiz, güvenli bir kimlik üretir. */
function slugId(ad) {
  const temiz = String(ad || 'urun')
    .split('')
    .map((ch) => (/[a-zA-Z0-9]/.test(ch) ? ch.toLowerCase() : 'x'))
    .join('');
  return temiz.slice(0, 28) + temiz.length;
}

/** XML için metni kaçışlar. */
function kacis(metin) {
  return String(metin)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Ürün için SVG kapak döndürür.
 * @param {{name: string, category_slug?: string, category_name?: string}} urun
 * @returns {string} data:image/svg+xml URI
 */
function urunKapagi(urun) {
  const renk = PALET[urun.category_slug] || VARSAYILAN;
  const kisa = kacis(kisaltma(urun.name));
  const kategori = kacis((urun.category_name || 'Numex').toLocaleUpperCase('tr-TR').slice(0, 22));

  // Degrade kimliği her kapakta farklı olmalı: aynı sayfada onlarca kapak
  // aynı id'yi taşıdığında tarayıcı ilk tanıma bağlıyor ve zemin/metin
  // kontrastı bozuluyordu (ölçüldü: öne çıkan ürünlerin kapağı boş görünüyordu).
  const gid = `g${slugId(urun.name)}`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="400" height="300" role="img" aria-label="${kacis(urun.name)}">
  <defs>
    <linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${renk.arka}"/>
      <stop offset="1" stop-color="#12171b"/>
    </linearGradient>
  </defs>
  <rect width="400" height="300" fill="url(#${gid})"/>
  <g opacity="0.14" stroke="${renk.on}" stroke-width="1">
    ${Array.from({ length: 10 }, (_, i) => `<line x1="${i * 44}" y1="0" x2="${i * 44}" y2="300"/>`).join('')}
  </g>
  <circle cx="330" cy="66" r="74" fill="none" stroke="${renk.vurgu}" stroke-width="1.5" opacity="0.5"/>
  <circle cx="330" cy="66" r="46" fill="${renk.vurgu}" opacity="0.14"/>
  <text x="32" y="196" font-family="Georgia, 'Iowan Old Style', serif" font-size="104" fill="${renk.on}" opacity="0.92" letter-spacing="-4">${kisa}</text>
  <text x="34" y="240" font-family="Inter, 'Segoe UI', sans-serif" font-size="13" fill="${renk.on}" opacity="0.6" letter-spacing="3.4">${kategori}</text>
  <rect x="34" y="258" width="42" height="2" fill="${renk.vurgu}"/>
</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

module.exports = { urunKapagi, kisaltma };
