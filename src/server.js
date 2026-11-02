'use strict';

/**
 * Uygulama girişi — Numex E-Ticaret
 */

require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const cookieParser = require('cookie-parser');

const { initSchema } = require('./db');
const { seed } = require('./seed');
const { attachCart } = require('./middleware/cart');
const { tl, tarih, DURUM_ETIKET, ODEME_ETIKET } = require('./yardimci');
const { urunKapagi } = require('./kapak');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Webhook: ham gövde gerekir — gövde ayrıştırıcılarından ÖNCE bağlanmalı.
app.use('/odeme/webhook', require('express').raw({ type: 'application/json' }), require('./routes/webhook'));

app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/uploads', express.static(path.join(__dirname, '..', 'data', 'uploads')));

app.use(
  session({
    secret: require('./ayar').sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7, httpOnly: true, sameSite: 'lax' },
  })
);
app.use(flash());
app.use(attachCart);

// Global şablon değişkenleri
app.use((req, res, next) => {
  res.locals.siteName = process.env.SITE_NAME || 'Numex E-Ticaret';
  res.locals.demoModu = process.env.DEMO_MODU === 'true';
  res.locals.currentUser = req.session.user || null;
  res.locals.cartCount = req.session.cart
    ? req.session.cart.reduce((sum, it) => sum + it.quantity, 0)
    : 0;
  res.locals.flashSuccess = req.flash('success');
  res.locals.flashError = req.flash('error');
  res.locals.currentPath = req.path;
  res.locals.tl = tl;
  res.locals.tarih = tarih;
  res.locals.urunKapagi = urunKapagi;
  res.locals.DURUM_ETIKET = DURUM_ETIKET;
  res.locals.ODEME_ETIKET = ODEME_ETIKET;
  next();
});

app.use('/', require('./routes/magaza'));
app.use('/', require('./routes/sepet'));
app.use('/', require('./routes/odeme'));
// Canlı demo (DEMO_MODU=true): panel gezilebilir ama kayıt değiştirilemez, dosya yüklenemez.
app.use('/admin', (req, res, next) => {
  if (process.env.DEMO_MODU !== 'true' || req.method !== 'POST') return next();
  if (req.path === '/giris' || req.path === '/cikis') return next();
  req.flash('error', 'Canlı demoda panel salt okunurdur; değişiklik kaydedilmez.');
  return res.redirect('/admin');
});
app.use('/admin', require('./routes/admin'));

// 404
app.use((req, res) => {
  res.status(404).render('hata', { baslik: 'Sayfa bulunamadı', kod: 404, mesaj: 'Aradığınız sayfa mevcut değil.' });
});

// Hata yakalayıcı
app.use((err, req, res, next) => {
  console.error('[hata]', err);
  const mesaj = process.env.NODE_ENV === 'production' ? 'Beklenmeyen bir hata oluştu.' : err.message;
  res.status(500).render('hata', { baslik: 'Sunucu hatası', kod: 500, mesaj });
});

(async () => {
  try {
    await initSchema();
    await seed();
    app.listen(PORT, () => {
      console.log(`Numex E-Ticaret çalışıyor → http://localhost:${PORT}`);
      console.log(`Yönetim paneli         → http://localhost:${PORT}/admin`);
    });
  } catch (err) {
    console.error('Uygulama başlatılamadı:', err);
    process.exit(1);
  }
})();

module.exports = app;
