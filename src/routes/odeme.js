'use strict';

/**
 * Ödeme rotaları — Stripe Checkout + webhook
 *
 * Akış:
 *  1. /odeme        → sipariş formu
 *  2. POST /odeme   → sipariş DB'ye "bekliyor" olarak yazılır
 *                     · Stripe anahtarı varsa Checkout oturumu açılır
 *                     · yoksa (ALLOW_COD_FALLBACK) kapıda ödeme ile tamamlanır
 *  3. /odeme/basarili → Stripe dönüşü, oturum doğrulanır
 *  4. POST /odeme/webhook → imza doğrulanır, ödeme durumu güncellenir
 */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();

const { get, all, run } = require('../db');
const { getCart, cartTotal } = require('../middleware/cart');
const { siparisOdendiIsaretle } = require('../odemeServisi');
const iyzico = require('../iyzico');

function stripeClient() {
  const key = (process.env.STRIPE_SECRET_KEY || '').trim();
  if (!key) return null;
  // eslint-disable-next-line global-require
  return require('stripe')(key);
}

/**
 * Kullanılabilir ödeme yöntemleri. Anahtarı tanımsız sağlayıcı listede GÖRÜNMEZ;
 * böylece kullanıcıya "seçtin ama çalışmıyor" durumu yaşatılmaz.
 */
function odemeYontemleri() {
  const liste = [];
  if (stripeClient()) liste.push('stripe');
  if (iyzico.ayarlar().aktif) liste.push('iyzico');
  return liste;
}

function siparisKoduUret() {
  const stamp = new Date();
  const y = stamp.getFullYear();
  const m = String(stamp.getMonth() + 1).padStart(2, '0');
  const d = String(stamp.getDate()).padStart(2, '0');
  const rnd = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `NMX-${y}${m}${d}-${rnd}`;
}

/* ------------------------------------------------------------------ */
/*  SİPARİŞ FORMU                                                      */
/* ------------------------------------------------------------------ */
router.get('/odeme', (req, res) => {
  const cart = getCart(req);
  if (cart.length === 0) {
    req.flash('error', 'Sepetiniz boş.');
    return res.redirect('/sepet');
  }
  const yontemler = odemeYontemleri();
  res.render('odeme', {
    baslik: 'Sipariş Tamamla',
    cart,
    toplam: cartTotal(cart),
    stripeAktif: yontemler.includes('stripe'),
    iyzicoAktif: yontemler.includes('iyzico'),
    yontemler,
  });
});

/* ------------------------------------------------------------------ */
/*  SİPARİŞ OLUŞTUR                                                    */
/* ------------------------------------------------------------------ */
router.post('/odeme', async (req, res, next) => {
  try {
    const cart = getCart(req);
    if (cart.length === 0) {
      req.flash('error', 'Sepetiniz boş.');
      return res.redirect('/sepet');
    }

    const ad = (req.body.customer_name || '').trim();
    const email = (req.body.customer_email || '').trim().toLowerCase();
    const telefon = (req.body.customer_phone || '').trim();
    const adres = (req.body.address || '').trim();
    const sehir = (req.body.city || '').trim();
    const not = (req.body.note || '').trim();

    if (!ad || !email || !adres || !sehir) {
      req.flash('error', 'Lütfen ad, e-posta, adres ve şehir alanlarını doldurun.');
      return res.redirect('/odeme');
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      req.flash('error', 'Geçerli bir e-posta adresi girin.');
      return res.redirect('/odeme');
    }

    // Sözleşme onayı sunucu tarafında da zorunlu (istemci kontrolüne güvenilmez).
    if (req.body.sozlesme_onay !== '1') {
      req.flash('error', 'Devam etmek için mesafeli satış sözleşmesini onaylamanız gerekir.');
      return res.redirect('/odeme');
    }

    // --- Stok kontrolü (sunucu tarafı, sepet fiyatlarına güvenilmez) ---
    const kalemler = [];
    let toplam = 0;
    for (const it of cart) {
      const urun = await get('SELECT id, name, price, stock, active FROM products WHERE id = ?', [it.productId]);
      if (!urun || !urun.active) {
        req.flash('error', `${it.name} artık satışta değil. Lütfen sepetten çıkarın.`);
        return res.redirect('/sepet');
      }
      if (urun.stock < it.quantity) {
        req.flash('error', `${urun.name} için yeterli stok yok (kalan: ${urun.stock}).`);
        return res.redirect('/sepet');
      }
      const birim = urun.price;
      toplam += birim * it.quantity;
      kalemler.push({ id: urun.id, name: urun.name, price: birim, quantity: it.quantity });
    }
    toplam = Number(toplam.toFixed(2));

    // İstenen yöntem yalnızca GERÇEKTEN açık olanlardan seçilebilir.
    const yontemler = odemeYontemleri();
    const istenen = String(req.body.payment_method || '').trim();
    const secilen = yontemler.includes(istenen) ? istenen : yontemler[0] || '';

    if (!secilen && process.env.ALLOW_COD_FALLBACK === 'false') {
      req.flash('error', 'Ödeme altyapısı yapılandırılmamış. Lütfen daha sonra tekrar deneyin.');
      return res.redirect('/odeme');
    }

    const stripe = secilen === 'stripe' ? stripeClient() : null;
    const odemeYontemi = secilen || 'kapida';
    const odemeDurumu = secilen ? 'bekliyor' : 'kapida_odeme';
    const kod = siparisKoduUret();

    const sonuc = await run(
      `INSERT INTO orders
        (order_code, customer_name, customer_email, customer_phone, address, city, note,
         total, status, payment_method, payment_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'yeni', ?, ?)`,
      [kod, ad, email, telefon, adres, sehir, not, toplam, odemeYontemi, odemeDurumu]
    );
    const siparisId = sonuc.lastID;

    for (const k of kalemler) {
      await run(
        'INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity) VALUES (?, ?, ?, ?, ?)',
        [siparisId, k.id, k.name, k.price, k.quantity]
      );
    }

    // --- iyzico seçildiyse barındırılan ödeme formuna yönlendir ---
    if (secilen === 'iyzico') {
      const siteUrl = require('../ayar').siteUrl;
      const sonuc = await iyzico.odemeFormuBaslat({
        siparisId, kod, toplam, email, ad, adres, sehir,
        kalemler, siteUrl,
      });
      if (sonuc.basarili) {
        await run("UPDATE orders SET stripe_session_id = ? WHERE id = ?", [sonuc.token || '', siparisId]);
        return res.redirect(303, sonuc.url);
      }
      console.error('[iyzico] ödeme formu açılamadı:', sonuc.hata);
      await run("UPDATE orders SET payment_status = 'basarisiz' WHERE id = ?", [siparisId]);
      req.flash('error', 'iyzico ödeme sayfası açılamadı: ' + (sonuc.hata || 'bilinmeyen hata'));
      return res.redirect('/odeme');
    }

    // --- Stripe varsa Checkout oturumu aç ---
    if (stripe) {
      const siteUrl = require('../ayar').siteUrl;
      try {
        const session = await stripe.checkout.sessions.create({
          mode: 'payment',
          payment_method_types: ['card'],
          customer_email: email,
          line_items: kalemler.map((k) => ({
            price_data: {
              currency: 'try',
              product_data: { name: k.name },
              unit_amount: Math.round(k.price * 100),
            },
            quantity: k.quantity,
          })),
          metadata: { order_id: String(siparisId), order_code: kod },
          success_url: `${siteUrl}/odeme/basarili?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${siteUrl}/odeme/iptal?order=${kod}`,
        });

        await run('UPDATE orders SET stripe_session_id = ? WHERE id = ?', [session.id, siparisId]);
        return res.redirect(303, session.url);
      } catch (err) {
        console.error('[stripe] oturum açılamadı:', err.message);
        await run("UPDATE orders SET payment_status = 'basarisiz' WHERE id = ?", [siparisId]);
        req.flash('error', 'Ödeme sayfası açılamadı. Lütfen tekrar deneyin.');
        return res.redirect('/odeme');
      }
    }

    // --- Kapıda ödeme ---
    if (process.env.ALLOW_COD_FALLBACK === 'false') {
      req.flash('error', 'Ödeme altyapısı yapılandırılmamış. Lütfen daha sonra tekrar deneyin.');
      return res.redirect('/odeme');
    }

    // Stok düş
    for (const k of kalemler) {
      await run('UPDATE products SET stock = stock - ? WHERE id = ?', [k.quantity, k.id]);
    }
    req.session.cart = [];
    req.session.orders = req.session.orders || [];
    req.session.orders.push(siparisId);
    return res.redirect(`/odeme/basarili?order=${siparisId}`);
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ */
/*  SONUÇ SAYFALARI                                                    */
/* ------------------------------------------------------------------ */
router.get('/odeme/basarili', async (req, res, next) => {
  try {
    const { order: kod, session_id: sessionId } = req.query;
    let siparis = null;

    if (sessionId) {
      const stripe = stripeClient();
      if (stripe) {
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        const siparisId = session.metadata && session.metadata.order_id;
        if (siparisId) {
          // Stok düşümü tek noktada, bayrak korumalı (webhook ile çakışmaz).
          if (session.payment_status === 'paid') {
            await siparisOdendiIsaretle(siparisId);
          }
          siparis = await get('SELECT * FROM orders WHERE id = ?', [siparisId]);
          if (siparis) {
            // Siparişi yalnız bu oturum açan kullanıcıya bağla.
            req.session.orders = req.session.orders || [];
            if (!req.session.orders.includes(siparis.id)) req.session.orders.push(siparis.id);
            req.session.cart = [];
          }
        }
      }
    }

    // iyzico dönüşü sipariş id'si ile gelir; yalnız o oturumun gördüğü sipariş açılır.
    if (!siparis && kod && /^\d+$/.test(String(kod))) {
      const sahip = (req.session.orders || []).includes(Number(kod));
      if (sahip) siparis = await get('SELECT * FROM orders WHERE id = ?', [Number(kod)]);
    }

    if (!siparis && kod) {
      // Kod tek başına yetmez: sipariş takip formuna yönlendir.
      req.flash('error', 'Sipariş ayrıntısı için sipariş kodu ve e-postanızı girin.');
      return res.redirect('/siparis-takip');
    }

    if (!siparis) {
      return res.redirect('/');
    }
    const kalemler = await require('../db').all('SELECT * FROM order_items WHERE order_id = ?', [siparis.id]);
    res.render('odeme-basarili', { baslik: 'Siparişiniz Alındı', siparis, kalemler });
  } catch (err) {
    next(err);
  }
});

router.get('/odeme/iptal', (req, res) => {
  res.render('odeme-iptal', { baslik: 'Ödeme İptal Edildi', kod: req.query.order || '' });
});

/* ------------------------------------------------------------------ */
/*  iyzico DÖNÜŞ (callback)                                            */
/* ------------------------------------------------------------------ */
router.post('/odeme/iyzico/donus', async (req, res, next) => {
  try {
    const token = String(req.body.token || '').trim();
    if (!token) {
      req.flash('error', 'Ödeme doğrulanamadı (token yok).');
      return res.redirect('/odeme/iptal');
    }

    const sonuc = await iyzico.odemeSonucu(token);
    if (!sonuc.basarili || !sonuc.odendi) {
      req.flash('error', sonuc.hata || 'Ödeme onaylanmadı.');
      return res.redirect('/odeme/iptal');
    }

    // Token'ı siparişe bağla: hangi sipariş olduğunu yalnız DB'den buluruz (istemciye güvenilmez).
    const siparis = await get('SELECT id FROM orders WHERE stripe_session_id = ?', [token]);
    if (!siparis) {
      req.flash('error', 'Ödemeye ait sipariş bulunamadı. Lütfen bizimle iletişime geçin.');
      return res.redirect('/odeme/iptal');
    }

    // Stok düşümü tek noktada ve bayrak korumalı.
    await siparisOdendiIsaretle(siparis.id);

    req.session.orders = req.session.orders || [];
    if (!req.session.orders.includes(siparis.id)) req.session.orders.push(siparis.id);
    req.session.cart = [];
    return res.redirect('/odeme/basarili?order=' + siparis.id);
  } catch (err) {
    next(err);
  }
});

// Sipariş takibi (kod + e-posta ile)
router.get('/siparis-takip', (req, res) => {
  res.render('siparis-takip', { baslik: 'Sipariş Takibi', siparis: null, kalemler: [], hata: null, kod: '', email: '' });
});

router.post('/siparis-takip', async (req, res, next) => {
  try {
    const kod = (req.body.order_code || '').trim().toUpperCase();
    const email = (req.body.email || '').trim().toLowerCase();
    const siparis = await get('SELECT * FROM orders WHERE order_code = ? AND customer_email = ?', [kod, email]);
    if (!siparis) {
      return res.render('siparis-takip', {
        baslik: 'Sipariş Takibi',
        siparis: null,
        kalemler: [],
        hata: 'Bu kod ve e-posta ile eşleşen bir sipariş bulunamadı.',
        kod,
        email,
      });
    }
    const kalemler = await require('../db').all('SELECT * FROM order_items WHERE order_id = ?', [siparis.id]);
    res.render('siparis-takip', { baslik: 'Sipariş Takibi', siparis, kalemler, hata: null, kod, email });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
