'use strict';

/** Sepet rotaları */

const express = require('express');
const router = express.Router();
const { get: dbGet } = require('../db');
const { getCart, cartTotal } = require('../middleware/cart');

/**
 * Yalnız site içi yol döndürür; dış adres/şema gelirse null.
 * Açık yönlendirmeyi (open redirect) engeller.
 */
function guvenliGeri(hedef) {
  if (typeof hedef !== 'string' || !hedef) return null;
  // \\ ile başlayanlar tarayıcıda // olarak yorumlanabilir.
  if (hedef.includes('\\')) return null;
  if (!hedef.startsWith('/') || hedef.startsWith('//')) return null;
  return hedef;
}

// Sepeti görüntüle
router.get('/sepet', (req, res) => {
  const cart = getCart(req);
  res.render('sepet', { baslik: 'Sepetim', cart, toplam: cartTotal(cart) });
});

// Sepete ekle
router.post('/sepet/ekle', async (req, res, next) => {
  try {
    const urunId = parseInt(req.query.urun || req.body.product_id, 10);
    const adet = Math.max(1, parseInt(req.body.quantity, 10) || 1);

    const urun = await dbGet('SELECT * FROM products WHERE id = ? AND active = 1', [urunId]);
    if (!urun) {
      req.flash('error', 'Ürün bulunamadı.');
      return res.redirect('/urunler');
    }
    if (urun.stock <= 0) {
      req.flash('error', 'Bu ürün stokta yok.');
      return res.redirect(`/urun/${urun.slug}`);
    }

    const cart = getCart(req);
    const mevcut = cart.find((it) => it.productId === urun.id);
    const ustSinir = urun.stock;
    if (mevcut) {
      mevcut.quantity = Math.min(ustSinir, mevcut.quantity + adet);
    } else {
      cart.push({
        productId: urun.id,
        name: urun.name,
        slug: urun.slug,
        price: urun.price,
        image: urun.image,
        quantity: Math.min(ustSinir, adet),
      });
    }
    req.flash('success', `${urun.name} sepete eklendi.`);
    const geri = guvenliGeri(req.body.geri) || guvenliGeri(req.get('referer')) || '/sepet';
    res.redirect(geri);
  } catch (err) {
    next(err);
  }
});

// Adet güncelle
router.post('/sepet/guncelle', async (req, res, next) => {
  try {
    const cart = getCart(req);
    const id = parseInt(req.body.product_id, 10);
    const adet = parseInt(req.body.quantity, 10);

    const kalem = cart.find((it) => it.productId === id);
    if (kalem) {
      if (!adet || adet < 1) {
        req.session.cart = cart.filter((it) => it.productId !== id);
      } else {
        const urun = await dbGet('SELECT stock FROM products WHERE id = ?', [id]);
        kalem.quantity = urun ? Math.min(Math.max(1, urun.stock), adet) : adet;
      }
    }
    res.redirect('/sepet');
  } catch (err) {
    next(err);
  }
});

// Sepetten çıkar
router.post('/sepet/cikar', (req, res) => {
  const id = parseInt(req.body.product_id, 10);
  req.session.cart = getCart(req).filter((it) => it.productId !== id);
  req.flash('success', 'Ürün sepetten çıkarıldı.');
  res.redirect('/sepet');
});

module.exports = router;
