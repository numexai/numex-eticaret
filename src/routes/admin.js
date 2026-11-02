'use strict';

/** Yönetim paneli rotaları */

const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const multer = require('multer');

const router = express.Router();
const girisSiniri = require('../girisSiniri');
const { get, all, run } = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { slugify } = require('../seed');

/* ---------------- Görsel yükleme ---------------- */
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'data', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const guvenli = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) ? ext : '.png';
    cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${guvenli}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /^image\/(jpeg|png|webp|gif)$/.test(file.mimetype);
    cb(ok ? null : new Error('Yalnızca JPG, PNG, WEBP veya GIF yükleyebilirsiniz.'), ok);
  },
});

/* ---------------- Giriş ---------------- */
router.get('/giris', (req, res) => {
  if (req.session.user) return res.redirect('/admin');
  res.render('admin/giris', { baslik: 'Yönetim Girişi' });
});

router.post('/giris', async (req, res, next) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    const sifre = req.body.password || '';
    const ip = req.ip || req.socket.remoteAddress || 'bilinmiyor';

    // Deneme sınırı: kilitliyse hiç şifre karşılaştırması yapılmaz.
    const kilit = girisSiniri.kalanKilit(ip, email);
    if (kilit > 0) {
      const dk = Math.ceil(kilit / 60);
      req.flash('error', `Çok fazla hatalı deneme. Lütfen ${dk} dakika sonra tekrar deneyin.`);
      return res.redirect('/admin/giris');
    }

    const kullanici = await get('SELECT * FROM users WHERE email = ?', [email]);

    if (!kullanici || !(await bcrypt.compare(sifre, kullanici.password_hash))) {
      girisSiniri.hataliDeneme(ip, email);
      const kalanHak = girisSiniri.AZAMI_DENEME;
      req.flash('error', `E-posta veya şifre hatalı. (${kalanHak} hatalı denemeden sonra 15 dakika kilitlenir.)`);
      return res.redirect('/admin/giris');
    }

    girisSiniri.basariliGiris(ip, email);
    req.session.user = { id: kullanici.id, email: kullanici.email, name: kullanici.name, role: kullanici.role };
    req.flash('success', `Hoş geldiniz, ${kullanici.name}.`);
    res.redirect('/admin');
  } catch (err) {
    next(err);
  }
});

router.post('/cikis', (req, res) => {
  req.session.user = null;
  req.flash('success', 'Çıkış yapıldı.');
  res.redirect('/admin/giris');
});

/* ---------------- Dashboard ---------------- */
router.get('/', requireAdmin, async (req, res, next) => {
  try {
    const [
      urunSayisi,
      kategoriSayisi,
      siparisSayisi,
      ciro,
      sonSiparisler,
      dusukStok,
      durumDagilimi,
      son30Gun,
      bekleyenSiparis,
    ] = await Promise.all([
      get('SELECT COUNT(*) AS c FROM products WHERE active = 1'),
      get('SELECT COUNT(*) AS c FROM categories'),
      get('SELECT COUNT(*) AS c FROM orders'),
      get("SELECT COALESCE(SUM(total),0) AS t FROM orders WHERE payment_status IN ('odendi','kapida_odeme')"),
      all(`SELECT o.*, (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS kalem_sayisi
             FROM orders o ORDER BY o.id DESC LIMIT 8`),
      all('SELECT * FROM products WHERE active = 1 AND stock <= 5 ORDER BY stock ASC LIMIT 8'),
      all(`SELECT status, COUNT(*) AS adet, COALESCE(SUM(total),0) AS tutar
             FROM orders GROUP BY status`),
      all(`SELECT substr(created_at, 1, 10) AS gun, COUNT(*) AS adet, COALESCE(SUM(total),0) AS tutar
             FROM orders GROUP BY gun ORDER BY gun DESC LIMIT 14`),
      get("SELECT COUNT(*) AS c FROM orders WHERE status IN ('yeni','hazirlaniyor')"),
    ]);

    // Grafik: eski → yeni sıraya çevir, en yüksek güne göre oranla
    const gunler = son30Gun.slice().reverse();
    const grafikMax = Math.max(1, ...gunler.map((g) => g.tutar));
    const grafik = gunler.map((g) => ({
      gun: g.gun,
      adet: g.adet,
      tutar: g.tutar,
      oran: Math.round((g.tutar / grafikMax) * 100),
    }));

    res.render('admin/dashboard', {
      baslik: 'Yönetim Paneli',
      urunSayisi: urunSayisi.c,
      kategoriSayisi: kategoriSayisi.c,
      siparisSayisi: siparisSayisi.c,
      ciro: ciro.t,
      sonSiparisler,
      dusukStok,
      durumDagilimi,
      grafik,
      bekleyenSiparis: bekleyenSiparis.c,
    });
  } catch (err) {
    next(err);
  }
});

/* ---------------- Ürünler ---------------- */
router.get('/urunler', requireAdmin, async (req, res, next) => {
  try {
    const urunler = await all(
      `SELECT p.*, c.name AS category_name FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       ORDER BY p.id DESC`
    );
    res.render('admin/urunler', { baslik: 'Ürünler', urunler });
  } catch (err) {
    next(err);
  }
});

router.get('/urunler/yeni', requireAdmin, async (req, res, next) => {
  try {
    const kategoriler = await all('SELECT * FROM categories ORDER BY sort_order, name');
    res.render('admin/urun-form', { baslik: 'Yeni Ürün', urun: null, kategoriler });
  } catch (err) {
    next(err);
  }
});

router.post('/urunler/yeni', requireAdmin, upload.single('image_file'), async (req, res, next) => {
  try {
    const ad = (req.body.name || '').trim();
    if (!ad) {
      req.flash('error', 'Ürün adı zorunludur.');
      return res.redirect('/admin/urunler/yeni');
    }
    let slug = slugify(ad);
    const cakisan = await get('SELECT id FROM products WHERE slug = ?', [slug]);
    if (cakisan) slug = `${slug}-${Date.now().toString().slice(-5)}`;

    const kapak = req.file ? `/uploads/${req.file.filename}` : (req.body.image || '').trim();
    await run(
      `INSERT INTO products
        (name, slug, category_id, description, price, stock, image, reference, featured, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ad,
        slug,
        req.body.category_id ? parseInt(req.body.category_id, 10) : null,
        (req.body.description || '').trim(),
        parseFloat(req.body.price) || 0,
        parseInt(req.body.stock, 10) || 0,
        kapak,
        (req.body.reference || '').trim(),
        req.body.featured ? 1 : 0,
        req.body.active ? 1 : 0,
      ]
    );
    req.flash('success', `"${ad}" eklendi.`);
    res.redirect('/admin/urunler');
  } catch (err) {
    next(err);
  }
});

router.get('/urunler/:id/duzenle', requireAdmin, async (req, res, next) => {
  try {
    const urun = await get('SELECT * FROM products WHERE id = ?', [req.params.id]);
    if (!urun) {
      req.flash('error', 'Ürün bulunamadı.');
      return res.redirect('/admin/urunler');
    }
    const kategoriler = await all('SELECT * FROM categories ORDER BY sort_order, name');
    res.render('admin/urun-form', { baslik: 'Ürünü Düzenle', urun, kategoriler });
  } catch (err) {
    next(err);
  }
});

router.post('/urunler/:id/duzenle', requireAdmin, upload.single('image_file'), async (req, res, next) => {
  try {
    const urun = await get('SELECT * FROM products WHERE id = ?', [req.params.id]);
    if (!urun) {
      req.flash('error', 'Ürün bulunamadı.');
      return res.redirect('/admin/urunler');
    }
    const kapak = req.file ? `/uploads/${req.file.filename}` : (req.body.image || '').trim();
    await run(
      `UPDATE products SET name = ?, category_id = ?, description = ?, price = ?, stock = ?,
              image = ?, reference = ?, featured = ?, active = ? WHERE id = ?`,
      [
        (req.body.name || '').trim() || urun.name,
        req.body.category_id ? parseInt(req.body.category_id, 10) : null,
        (req.body.description || '').trim(),
        parseFloat(req.body.price) || 0,
        parseInt(req.body.stock, 10) || 0,
        kapak,
        (req.body.reference || '').trim(),
        req.body.featured ? 1 : 0,
        req.body.active ? 1 : 0,
        urun.id,
      ]
    );
    req.flash('success', 'Ürün güncellendi.');
    res.redirect('/admin/urunler');
  } catch (err) {
    next(err);
  }
});

router.post('/urunler/:id/sil', requireAdmin, async (req, res, next) => {
  try {
    await run('DELETE FROM products WHERE id = ?', [req.params.id]);
    req.flash('success', 'Ürün silindi.');
    res.redirect('/admin/urunler');
  } catch (err) {
    next(err);
  }
});

/* ---------------- Kategoriler ---------------- */
router.get('/kategoriler', requireAdmin, async (req, res, next) => {
  try {
    const kategoriler = await all(
      `SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.active = 1) AS urun_sayisi
         FROM categories c ORDER BY c.sort_order, c.name`
    );
    res.render('admin/kategoriler', { baslik: 'Kategoriler', kategoriler });
  } catch (err) {
    next(err);
  }
});

router.post('/kategoriler', requireAdmin, async (req, res, next) => {
  try {
    const ad = (req.body.name || '').trim();
    if (!ad) {
      req.flash('error', 'Kategori adı zorunludur.');
      return res.redirect('/admin/kategoriler');
    }
    let slug = slugify(ad);
    if (await get('SELECT id FROM categories WHERE slug = ?', [slug])) {
      slug = `${slug}-${Date.now().toString().slice(-5)}`;
    }
    await run('INSERT INTO categories (name, slug, description, sort_order) VALUES (?, ?, ?, ?)', [
      ad,
      slug,
      (req.body.description || '').trim(),
      parseInt(req.body.sort_order, 10) || 0,
    ]);
    req.flash('success', `"${ad}" kategorisi eklendi.`);
    res.redirect('/admin/kategoriler');
  } catch (err) {
    next(err);
  }
});

router.post('/kategoriler/:id/guncelle', requireAdmin, async (req, res, next) => {
  try {
    await run('UPDATE categories SET name = ?, description = ?, sort_order = ? WHERE id = ?', [
      (req.body.name || '').trim(),
      (req.body.description || '').trim(),
      parseInt(req.body.sort_order, 10) || 0,
      req.params.id,
    ]);
    req.flash('success', 'Kategori güncellendi.');
    res.redirect('/admin/kategoriler');
  } catch (err) {
    next(err);
  }
});

router.post('/kategoriler/:id/sil', requireAdmin, async (req, res, next) => {
  try {
    await run('DELETE FROM categories WHERE id = ?', [req.params.id]);
    req.flash('success', 'Kategori silindi. İçindeki ürünler kategorisiz kaldı.');
    res.redirect('/admin/kategoriler');
  } catch (err) {
    next(err);
  }
});

/* ---------------- Siparişler ---------------- */
router.get('/siparisler', requireAdmin, async (req, res, next) => {
  try {
    const durum = (req.query.durum || '').trim();
    const kosul = durum ? 'WHERE o.status = ?' : '';
    const params = durum ? [durum] : [];
    const siparisler = await all(
      `SELECT o.*, (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS kalem_sayisi
         FROM orders o ${kosul} ORDER BY o.id DESC`,
      params
    );
    res.render('admin/siparisler', { baslik: 'Siparişler', siparisler, durum });
  } catch (err) {
    next(err);
  }
});

router.get('/siparisler/:id', requireAdmin, async (req, res, next) => {
  try {
    const siparis = await get('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    if (!siparis) {
      req.flash('error', 'Sipariş bulunamadı.');
      return res.redirect('/admin/siparisler');
    }
    const kalemler = await all('SELECT * FROM order_items WHERE order_id = ?', [siparis.id]);
    res.render('admin/siparis-detay', { baslik: `Sipariş ${siparis.order_code}`, siparis, kalemler });
  } catch (err) {
    next(err);
  }
});

router.post('/siparisler/:id/durum', requireAdmin, async (req, res, next) => {
  try {
    const izinli = ['yeni', 'hazirlaniyor', 'kargoda', 'teslim', 'iptal'];
    const durum = izinli.includes(req.body.status) ? req.body.status : 'yeni';
    await run('UPDATE orders SET status = ? WHERE id = ?', [durum, req.params.id]);
    req.flash('success', 'Sipariş durumu güncellendi.');
    res.redirect(`/admin/siparisler/${req.params.id}`);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
