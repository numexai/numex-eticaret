'use strict';

/**
 * Basit giriş deneme sınırı (bellek içi).
 *
 * Amaç: yönetici girişinde kaba kuvvet / şifre deneme saldırısını yavaşlatmak.
 * Anahtar: IP + e-posta. Pencere içinde hak aşılırsa kilit süresi devreye girer.
 *
 * Not: Tek süreçli kurulum için tasarlandı. Çok süreçli/dağıtık kurulumda
 * Redis gibi paylaşılan bir sayaç gerekir.
 */

const PENCERE_MS = 15 * 60 * 1000; // 15 dakika
const AZAMI_DENEME = 5; // 5 hatalı denemeden sonra
const KILIT_MS = 15 * 60 * 1000; // 15 dakika kilit

const kayitlar = new Map();

function anahtar(ip, email) {
  return `${ip}|${(email || '').toLowerCase()}`;
}

function temizle(now) {
  for (const [k, v] of kayitlar) {
    if (now - v.ilk > PENCERE_MS && (!v.kilit || now > v.kilit)) kayitlar.delete(k);
  }
}

/** Kilitliyse kalan saniye, değilse 0 döner. */
function kalanKilit(ip, email) {
  const now = Date.now();
  temizle(now);
  const k = kayitlar.get(anahtar(ip, email));
  if (!k || !k.kilit) return 0;
  return now < k.kilit ? Math.ceil((k.kilit - now) / 1000) : 0;
}

function hataliDeneme(ip, email) {
  const now = Date.now();
  const k = kayitlar.get(anahtar(ip, email)) || { adet: 0, ilk: now, kilit: 0 };
  if (now - k.ilk > PENCERE_MS) {
    k.adet = 0;
    k.ilk = now;
  }
  k.adet += 1;
  if (k.adet >= AZAMI_DENEME) k.kilit = now + KILIT_MS;
  kayitlar.set(anahtar(ip, email), k);
}

function basariliGiris(ip, email) {
  kayitlar.delete(anahtar(ip, email));
}

module.exports = { kalanKilit, hataliDeneme, basariliGiris, AZAMI_DENEME };
