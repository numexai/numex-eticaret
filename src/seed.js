'use strict';

/**
 * Örnek katalog + yönetici hesabı tohumlama.
 * Kendi kendine yeterlidir: veritabanı boşsa doldurur, doluysa dokunmaz.
 */

const bcrypt = require('bcryptjs');
const { get, run } = require('./db');

function slugify(text) {
  const map = { ç: 'c', ğ: 'g', ı: 'i', İ: 'i', ö: 'o', ş: 's', ü: 'u', Ç: 'c', Ğ: 'g', Ö: 'o', Ş: 's', Ü: 'u' };
  return String(text)
    .split('')
    .map((ch) => map[ch] || ch)
    .join('')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const CATEGORIES = [
  { name: 'Donanım & Aksesuar', description: 'Bilgisayar çevre birimleri ve aksesuarlar', sort_order: 1 },
  { name: 'Kırtasiye & Ofis', description: 'Günlük ofis ve kırtasiye ihtiyaçları', sort_order: 2 },
  { name: 'Ev & Yaşam', description: 'Ev ve mutfak için günlük ürünler', sort_order: 3 },
];

// Tümü temsilî örnek üründür; mağazanızı açarken panelden silip kendi ürünlerinizi ekleyin.
const PRODUCTS = [
  { name: 'Mekanik Klavye NK-87', category: 'Donanım & Aksesuar', price: 1249, stock: 34, featured: 1, reference: 'Örnek katalog (temsilî)',
    description: '87 tuşlu mekanik klavye, Türkçe Q dizilimi, beyaz aydınlatma, çelik plaka ve taşınabilir gövde.' },
  { name: 'Ergonomik Kablosuz Mouse', category: 'Donanım & Aksesuar', price: 649, stock: 68, featured: 0, reference: 'Örnek katalog (temsilî)',
    description: 'Dikey tutuşlu, sessiz tıklamalı kablosuz fare. 2.4 GHz alıcı ve Bluetooth desteği ile çalışır.' },
  { name: '27" Monitör Standı', category: 'Donanım & Aksesuar', price: 1890, stock: 12, featured: 1, reference: 'Örnek katalog (temsilî)',
    description: 'Gazlı yükseklik ayarlı tek kollu monitör standı. 27 inçe kadar, 9 kg taşıma kapasiteli, VESA 75/100 uyumlu.' },
  { name: 'USB-C Çoklu Bağlantı İstasyonu', category: 'Donanım & Aksesuar', price: 899, stock: 45, featured: 0, reference: 'Örnek katalog (temsilî)',
    description: '7 portlu USB-C hub: HDMI 4K, 2× USB 3.0, SD/microSD okuyucu ve 100W PD şarj geçişi.' },
  { name: 'Deri Kapaklı A5 Not Defteri', category: 'Kırtasiye & Ofis', price: 249, stock: 210, featured: 1, reference: 'Örnek katalog (temsilî)',
    description: 'Noktalı sayfalı, 160 sayfa, geri dönüştürülmüş kâğıt. Yumuşak deri kapak ve sırt bandı.' },
  { name: 'Metal Masa Düzenleyici', category: 'Kırtasiye & Ofis', price: 329, stock: 80, featured: 0, reference: 'Örnek katalog (temsilî)',
    description: 'Kalem, not kâğıdı ve telefon bölmeli, toz boyalı metal gövdeli masaüstü düzenleyici.' },
  { name: 'Roller Kalem Seti (3 Adet)', category: 'Kırtasiye & Ofis', price: 189, stock: 150, featured: 0, reference: 'Örnek katalog (temsilî)',
    description: 'Siyah, mavi ve kırmızı 0,5 mm roller kalem seti. Kartuşu değiştirilebilir.' },
  { name: 'Seramik Kupa 350 ml', category: 'Ev & Yaşam', price: 159, stock: 120, featured: 0, reference: 'Örnek katalog (temsilî)',
    description: 'Mat sırlı, bulaşık makinesine uygun 350 ml seramik kupa.' },
  { name: 'Çelik Termos 500 ml', category: 'Ev & Yaşam', price: 549, stock: 60, featured: 1, reference: 'Örnek katalog (temsilî)',
    description: 'Çift cidarlı paslanmaz çelik termos. Sızdırmaz kapak, 500 ml hacim.' },
  { name: 'Pamuklu Masa Örtüsü', category: 'Ev & Yaşam', price: 429, stock: 40, featured: 0, reference: 'Örnek katalog (temsilî)',
    description: '140×200 cm, yıkanabilir pamuklu masa örtüsü.' },
];

async function seed() {
  // --- Yönetici ---
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@ornek.com').toLowerCase().trim();
  const existingAdmin = await get('SELECT id, password_hash FROM users WHERE email = ?', [adminEmail]);
  const plain = process.env.ADMIN_PASSWORD;
  if (!existingAdmin) {
    const hash = await bcrypt.hash(plain || 'numex-local-admin', 10);
    await run('INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)', [
      adminEmail,
      hash,
      'Yönetici',
      'admin',
    ]);
    console.log(`[seed] Yönetici oluşturuldu: ${adminEmail}`);
  } else if (plain) {
    // NUMEX-DÜZELTME (2026-11-02): .env'deki ADMIN_PASSWORD sonradan değiştirildiğinde veritabanındaki
    // hash güncellenmiyordu; doğru şifre girilse bile panel girişi reddediliyordu (ölçüldü).
    // Artık her başlatmada .env değeriyle karşılaştırılır, yalnızca farklıysa yeniden hash'lenir.
    const ayni = await bcrypt.compare(plain, existingAdmin.password_hash);
    if (!ayni) {
      await run('UPDATE users SET password_hash = ? WHERE id = ?', [
        await bcrypt.hash(plain, 10),
        existingAdmin.id,
      ]);
      console.log('[seed] Yönetici şifresi .env değeriyle eşitlendi.');
    }
  }

  // --- Kategoriler ---
  const catIdBySlug = {};
  for (const cat of CATEGORIES) {
    const slug = slugify(cat.name);
    let row = await get('SELECT id FROM categories WHERE slug = ?', [slug]);
    if (!row) {
      const res = await run('INSERT INTO categories (name, slug, description, sort_order) VALUES (?, ?, ?, ?)', [
        cat.name,
        slug,
        cat.description,
        cat.sort_order,
      ]);
      catIdBySlug[cat.name] = res.lastID;
    } else {
      catIdBySlug[cat.name] = row.id;
    }
  }

  // --- Ürünler ---
  for (const p of PRODUCTS) {
    const slug = slugify(p.name);
    const exists = await get('SELECT id FROM products WHERE slug = ?', [slug]);
    // NUMEX-DÜZELTME (2026-11-02): Kök neden: seed ürünü zaten varsa `continue` ile geçiyordu, yani featured değeri yalnız ilk tohumlamada yazılıyor — .env gibi sonradan yapılan düzeltme veritabanına hiç yansımıyor (canlı ölçüm: 10 ürünün 8'inde 'Öne çıkan' etiketi). Ürünü silip yeniden tohumlamak yerine, her açılışta featured alanını kaynakla eşitliyorum (diğer alanlara dokunmuyor).
    if (exists) {
      // Ürün zaten varsa fiyat/stok/admine dokunmuyoruz; yalnız "öne çıkan"
      // seçkisini kaynakla eşitliyoruz. Aksi hâlde eski tohumdan kalan
      // işaretler kalıcı oluyor ve etiket neredeyse her üründe görünüyordu.
      await run('UPDATE products SET featured = ? WHERE slug = ?', [p.featured, slug]);
      continue;
    }
    await run(
      `INSERT INTO products (name, slug, category_id, description, price, stock, image, reference, featured, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [p.name, slug, catIdBySlug[p.category] || null, p.description, p.price, p.stock, '', p.reference, p.featured]
    );
  }

  console.log('[seed] Katalog hazır.');
}

module.exports = { seed, slugify };
