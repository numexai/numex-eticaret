'use strict';

/** Yönetim paneli erişim koruması */

function requireAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'admin') return next();
  req.flash('error', 'Bu sayfaya erişmek için giriş yapmalısınız.');
  return res.redirect('/admin/giris');
}

module.exports = { requireAdmin };
