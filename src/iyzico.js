'use strict';

/**
 * iyzico ödeme adaptörü.
 *
 * TASARIM KARARI: iyzico'nun resmî Node SDK'sı yoktur; API'si HMAC-SHA256 imzalı
 * REST çağrılarıyla çalışır. Bu dosya tek bir yere kapatıldı ki:
 *   - anahtar yoksa adaptör KENDİNİ KAPATIR (sahte başarı üretmez, sipariş
 *     "bekliyor" kalır ve kullanıcıya açıkça söylenir),
 *   - imza/format hataları tek yerden yönetilir,
 *   - test ortamı (sandbox) ile canlı ortam ayrımı env'den yapılır.
 *
 * GEREKLİ ORTAM DEĞİŞKENLERİ:
 *   IYZICO_API_KEY, IYZICO_SECRET_KEY, IYZICO_BASE_URL
 *   (sandbox: https://sandbox-api.iyzipay.com — canlı: https://api.iyzipay.com)
 *
 * DURUM: DENEYSEL, HENÜZ ÇALIŞMIYOR. Yetki başlığı iyzico'nun beklediği biçimde
 * değildir ve gerçek hesapla hiç denenmedi; alıcı kimlik no ve IP alanları da
 * sabit değerdir. Bu yüzden anahtar girilse bile IYZICO_DENEYSEL=true olmadan
 * ödeme sayfasında görünmez. Canlı kullanmadan önce sandbox'ta tamamlanmalıdır.
 */

const crypto = require('crypto');

const KAPALI_NEDEN =
  'iyzico anahtarları tanımlı değil (IYZICO_API_KEY / IYZICO_SECRET_KEY).';

function ayarlar() {
  const apiKey = (process.env.IYZICO_API_KEY || '').trim();
  const secretKey = (process.env.IYZICO_SECRET_KEY || '').trim();
  const baseUrl = (process.env.IYZICO_BASE_URL || 'https://sandbox-api.iyzipay.com').trim();
  const deneysel = process.env.IYZICO_DENEYSEL === 'true';
  return { apiKey, secretKey, baseUrl, aktif: !!(apiKey && secretKey && deneysel) };
}

/** iyzico imzası: rnd.uri + HMAC-SHA256(secret, rnd + uri + gövde) */
function imzala(secretKey, rnd, uri, govde) {
  const imza = crypto.createHmac('sha256', secretKey).update(rnd + uri + govde).digest('hex');
  return `apiKey:${'IYZICO'},randomKey:${rnd},signature:${imza}`;
}

/**
 * Kimlik doğrulamalı istek atar. Anahtar yoksa null döner (çağıran karar verir).
 * @returns {Promise<Object|null>}
 */
async function istek(uri, govde) {
  const a = ayarlar();
  if (!a.aktif) return null;

  const rnd = String(Date.now());
  const metin = JSON.stringify(govde);

  const yanit = await fetch(a.baseUrl + uri, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: imzala(a.secretKey, rnd, uri, metin),
      'x-iyzi-rnd': rnd,
    },
    body: metin,
  });

  const metinYanit = await yanit.text();
  try {
    return JSON.parse(metinYanit);
  } catch {
    return { status: 'failure', errorMessage: `iyzico yanıtı okunamadı (HTTP ${yanit.status})` };
  }
}

/**
 * Ödeme formu başlatır (Checkout Form / 3D Secure barındırılan sayfa).
 * @returns {Promise<{basarili: boolean, url?: string, token?: string, hata?: string, kapali?: boolean}>}
 */
async function odemeFormuBaslat({ siparisId, kod, toplam, email, ad, adres, sehir, kalemler, siteUrl }) {
  const a = ayarlar();
  if (!a.aktif) return { basarili: false, kapali: true, hata: KAPALI_NEDEN };

  const adParca = String(ad || 'Müşteri').trim().split(/\s+/);
  const soyad = adParca.length > 1 ? adParca.pop() : 'Müşteri';

  const govde = {
    locale: 'tr',
    conversationId: kod,
    price: toplam.toFixed(2),
    paidPrice: toplam.toFixed(2),
    currency: 'TRY',
    basketId: kod,
    paymentGroup: 'PRODUCT',
    callbackUrl: `${siteUrl}/odeme/iyzico/donus`,
    enabledInstallments: [1],
    buyer: {
      id: String(siparisId),
      name: adParca.join(' ') || 'Müşteri',
      surname: soyad,
      email,
      identityNumber: '11111111111', // gerçek T.C. kimlik no toplanmıyorsa iyzico'nun test değeri
      registrationAddress: adres,
      city: sehir,
      country: 'Turkey',
      ip: '127.0.0.1',
    },
    shippingAddress: { contactName: ad, city: sehir, country: 'Turkey', address: adres },
    billingAddress: { contactName: ad, city: sehir, country: 'Turkey', address: adres },
    basketItems: kalemler.map((k) => ({
      id: String(k.id),
      name: k.name,
      category1: 'Genel',
      itemType: 'PHYSICAL',
      price: (k.price * k.quantity).toFixed(2),
    })),
  };

  const yanit = await istek('/payment/iyzipos/checkoutform/initialize/auth/ecom', govde);
  if (!yanit) return { basarili: false, kapali: true, hata: KAPALI_NEDEN };
  if (yanit.status !== 'success') {
    return { basarili: false, hata: yanit.errorMessage || 'iyzico ödeme formu açılamadı.' };
  }
  return { basarili: true, url: yanit.paymentPageUrl, token: yanit.token };
}

/**
 * Dönüşte (callback) token ile ödeme sonucunu sorgular.
 * @returns {Promise<{basarili: boolean, odendi?: boolean, hata?: string, kapali?: boolean, ham?: Object}>}
 */
async function odemeSonucu(token) {
  const a = ayarlar();
  if (!a.aktif) return { basarili: false, kapali: true, hata: KAPALI_NEDEN };

  const yanit = await istek('/payment/iyzipos/checkoutform/auth/ecom/detail', { locale: 'tr', token });
  if (!yanit) return { basarili: false, kapali: true, hata: KAPALI_NEDEN };

  const odendi = yanit.status === 'success' && yanit.paymentStatus === 'SUCCESS';
  return { basarili: odendi, odendi, hata: odendi ? null : yanit.errorMessage || 'Ödeme onaylanmadı.', ham: yanit };
}

module.exports = { ayarlar, odemeFormuBaslat, odemeSonucu, imzala, KAPALI_NEDEN };
