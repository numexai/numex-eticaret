'use strict';

/** Mağaza (vitrin) rotaları */

const express = require('express');
const router = express.Router();
const { all, get } = require('../db');

async function kategorileriGetir() {
  return all('SELECT * FROM categories ORDER BY sort_order, name');
}

// Ana sayfa
router.get('/', async (req, res, next) => {
  try {
    const kategoriler = await kategorileriGetir();
    const oneCikanlar = await all(
      `SELECT p.*, c.name AS category_name, c.slug AS category_slug
         FROM products p LEFT JOIN categories c ON c.id = p.category_id
        WHERE p.active = 1 AND p.featured = 1
        ORDER BY p.id DESC LIMIT 6`
    );
    const yeniGelenler = await all(
      `SELECT p.*, c.name AS category_name, c.slug AS category_slug
         FROM products p LEFT JOIN categories c ON c.id = p.category_id
        WHERE p.active = 1 ORDER BY p.id DESC LIMIT 8`
    );
    res.render('index', { baslik: 'Ana Sayfa', kategoriler, oneCikanlar, yeniGelenler });
  } catch (err) {
    next(err);
  }
});

// Ürün listesi + arama + kategori filtre
router.get('/urunler', async (req, res, next) => {
  try {
    const kategoriler = await kategorileriGetir();
    const q = (req.query.q || '').trim();
    const kategoriSlug = (req.query.kategori || '').trim();
    const sirala = req.query.sirala || 'yeni';

    const kosullar = ['p.active = 1'];
    const params = [];

    let aktifKategori = null;
    if (kategoriSlug) {
      aktifKategori = await get('SELECT * FROM categories WHERE slug = ?', [kategoriSlug]);
      if (aktifKategori) {
        kosullar.push('p.category_id = ?');
        params.push(aktifKategori.id);
      }
    }
    if (q) {
      kosullar.push('(p.name LIKE ? OR p.description LIKE ?)');
      params.push(`%${q}%`, `%${q}%`);
    }

    const siralama =
      { fiyat_artan: 'p.price ASC', fiyat_azalan: 'p.price DESC', ad: 'p.name ASC' }[sirala] || 'p.id DESC';

    const urunler = await all(
      `SELECT p.*, c.name AS category_name, c.slug AS category_slug
         FROM products p LEFT JOIN categories c ON c.id = p.category_id
        WHERE ${kosullar.join(' AND ')}
        ORDER BY ${siralama}`,
      params
    );

    res.render('urunler', { baslik: 'Ürünler', kategoriler, urunler, q, aktifKategori, sirala, kategoriSlug });
  } catch (err) {
    next(err);
  }
});

// Ürün detay
router.get('/urun/:slug', async (req, res, next) => {
  try {
    const urun = await get(
      `SELECT p.*, c.name AS category_name, c.slug AS category_slug
         FROM products p LEFT JOIN categories c ON c.id = p.category_id
        WHERE p.slug = ? AND p.active = 1`,
      [req.params.slug]
    );
    if (!urun) {
      return res.status(404).render('hata', {
        baslik: 'Ürün bulunamadı',
        kod: 404,
        mesaj: 'Aradığınız ürün kaldırılmış ya da hiç var olmamış olabilir.',
      });
    }
    const benzerler = await all(
      `SELECT p.*, c.name AS category_name FROM products p
         LEFT JOIN categories c ON c.id = p.category_id
        WHERE p.active = 1 AND p.id != ? AND (p.category_id = ? OR ? IS NULL)
        ORDER BY p.id DESC LIMIT 4`,
      [urun.id, urun.category_id, urun.category_id]
    );
    res.render('urun-detay', { baslik: urun.name, urun, benzerler });
  } catch (err) {
    next(err);
  }
});

// Hakkımızda / referanslar
// KVKK, mesafeli satış ve ön bilgilendirme — tek sayfada bölümlerle
router.get('/yasal', (req, res) => {
  res.render('yasal', { baslik: 'Yasal Bilgilendirme' });
});

router.get('/hakkimizda', (req, res) => {
  res.render('hakkimizda', { baslik: 'Hakkımızda' });
});

module.exports = router;
