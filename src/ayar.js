'use strict';

/**
 * Ortam ayarları — üretimde güvenli varsayılan yok.
 *
 * Kural: üretimde (NODE_ENV=production) SESSION_SECRET veya ADMIN_PASSWORD
 * tanımlı değilse uygulama AÇILMAZ. Geliştirmede eksikse rastgele değer üretilir
 * (sunucu yeniden başlayınca oturumlar düşer, bu bilinçli bir tercihtir).
 */

const crypto = require('crypto');

const uretim = process.env.NODE_ENV === 'production';

function zorunlu(ad) {
  const deger = (process.env[ad] || '').trim();
  if (deger) return deger;
  if (uretim) {
    console.error(`[ayar] Üretim ortamında ${ad} tanımlı değil. Uygulama başlatılmadı.`);
    process.exit(1);
  }
  return '';
}

const sessionSecret = (() => {
  const deger = zorunlu('SESSION_SECRET');
  if (deger) return deger;
  // Geliştirme: sabit metin yerine her açılışta rastgele anahtar.
  return crypto.randomBytes(48).toString('hex');
})();

// ADMIN_PASSWORD üretimde zorunlu; geliştirmede seed varsayılanına düşer.
const adminPassword = (() => {
  const deger = zorunlu('ADMIN_PASSWORD');
  if (deger) return deger;
  return 'numex-local-admin';
})();

const siteUrl = (process.env.SITE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');

module.exports = { uretim, sessionSecret, adminPassword, siteUrl };
