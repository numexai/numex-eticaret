'use strict';

/**
 * Ödeme servisi — stok düşümünün TEK sahibi.
 *
 * Neden tek yer: daha önce webhook ve başarı sayfası stok düşüyordu.
 * İkisi birlikte çalışınca stok iki kez düşüyor, yalnız biri çalışınca
 * (kullanıcı sayfayı kapatırsa) hiç düşmüyordu.
 *
 * Çözüm: orders.stock_deducted bayrağı. Düşüm yalnızca
 * "UPDATE orders SET stock_deducted = 1 WHERE id = ? AND stock_deducted = 0"
 * satırını GERÇEKTEN güncelleyen çağrıda yapılır. SQLite tek yazma kilitli
 * olduğu için iki eşzamanlı istekte yalnız biri bu koşulu geçer.
 */

const { get, all, run } = require('./db');

/**
 * Siparişi "ödendi" yapar ve stoğu TAM BİR KEZ düşer.
 * @returns {{durum: string, stokDusuldu: boolean}}
 */
async function siparisOdendiIsaretle(siparisId) {
  const id = parseInt(siparisId, 10);
  if (!id) return { durum: 'gecersiz', stokDusuldu: false };

  const siparis = await get('SELECT id, payment_status, stock_deducted FROM orders WHERE id = ?', [id]);
  if (!siparis) return { durum: 'yok', stokDusuldu: false };

  // Ödeme durumunu işaretle (tekrar çağrılsa da sonuç aynı).
  if (siparis.payment_status !== 'odendi') {
    await run("UPDATE orders SET payment_status = 'odendi', status = 'hazirlaniyor' WHERE id = ?", [id]);
  }

  // Stok düşümü: yarış koşuluna dayanıklı tek adım.
  const kilit = await run('UPDATE orders SET stock_deducted = 1 WHERE id = ? AND stock_deducted = 0', [id]);
  if (!kilit || kilit.changes === 0) {
    return { durum: 'odendi', stokDusuldu: false }; // başka bir çağrı düşmüş
  }

  const kalemler = await all('SELECT product_id, quantity FROM order_items WHERE order_id = ?', [id]);
  for (const k of kalemler) {
    if (!k.product_id) continue;
    // Stok negatife düşmesin.
    await run('UPDATE products SET stock = MAX(0, stock - ?) WHERE id = ?', [k.quantity, k.product_id]);
  }
  return { durum: 'odendi', stokDusuldu: true };
}

async function siparisBasarisizIsaretle(siparisId) {
  const id = parseInt(siparisId, 10);
  if (!id) return;
  // Ödenmiş siparişi sonradan "basarisiz"a çevirme.
  await run("UPDATE orders SET payment_status = 'basarisiz' WHERE id = ? AND payment_status <> 'odendi'", [id]);
}

module.exports = { siparisOdendiIsaretle, siparisBasarisizIsaretle };
