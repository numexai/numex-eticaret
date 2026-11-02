'use strict';

/** Sepet yardımcıları — oturum tabanlı */

function getCart(req) {
  if (!Array.isArray(req.session.cart)) req.session.cart = [];
  return req.session.cart;
}

function cartTotal(cart) {
  return Number(cart.reduce((sum, it) => sum + it.price * it.quantity, 0).toFixed(2));
}

function attachCart(req, res, next) {
  req.cart = getCart(req);
  req.cartTotal = cartTotal(req.cart);
  next();
}

module.exports = { getCart, cartTotal, attachCart };
