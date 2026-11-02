'use strict';

/**
 * Stripe webhook — ham gövdeyle imza doğrulama.
 *
 * Bu router server.js'te gövde ayrıştırıcılarından (express.json/urlencoded)
 * ÖNCE bağlanır; aksi hâlde gövde nesneye çevrilir ve imza doğrulanamaz.
 *
 * Stok düşümü TEK yerde: odemeServisi.stokDus(). Bu yüzden webhook ile başarı
 * sayfası aynı sipariş için birlikte çalışsa da stok iki kez düşmez.
 */

const express = require('express');
const router = express.Router();

const { siparisOdendiIsaretle, siparisBasarisizIsaretle } = require('../odemeServisi');

function stripeClient() {
  const key = (process.env.STRIPE_SECRET_KEY || '').trim();
  if (!key) return null;
  // eslint-disable-next-line global-require
  return require('stripe')(key);
}

router.post('/', async (req, res) => {
  const stripe = stripeClient();
  const secret = (process.env.STRIPE_WEBHOOK_SECRET || '').trim();

  if (!stripe || !secret) {
    return res.status(400).json({ hata: 'Stripe webhook yapılandırılmamış.' });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], secret);
  } catch (err) {
    console.error('[webhook] imza dogrulanamadi:', err.message);
    return res.status(400).send(`Webhook imza hatasi: ${err.message}`);
  }

  try {
    const session = event.data.object;
    const siparisId = session && session.metadata && session.metadata.order_id;

    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      if (siparisId) {
        const sonuc = await siparisOdendiIsaretle(siparisId);
        console.log(`[webhook] Siparis #${siparisId} → ${sonuc.durum} (stok dusuldu: ${sonuc.stokDusuldu})`);
      }
    } else if (event.type === 'checkout.session.expired' || event.type === 'checkout.session.async_payment_failed') {
      if (siparisId) await siparisBasarisizIsaretle(siparisId);
    }
    return res.json({ alindi: true });
  } catch (err) {
    console.error('[webhook] isleme hatasi:', err);
    return res.status(500).json({ hata: 'Sunucu hatasi' });
  }
});

module.exports = router;
