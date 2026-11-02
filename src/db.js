'use strict';

/**
 * Numex E-Ticaret — veritabanı katmanı (SQLite)
 * Harici sunucu gerektirmez; dosya tabanlı çalışır.
 */

const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'numex.db');

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Veritabanı açılamadı:', err.message);
    process.exit(1);
  }
});

db.run('PRAGMA journal_mode = WAL');
db.run('PRAGMA foreign_keys = ON');

/** Tek satır döndüren sorgu */
function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

/** Tüm satırları döndüren sorgu */
function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

/** Yazma sorgusu — { lastID, changes } döner */
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

/** Şema oluşturma — idempotent */
async function initSchema() {
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT 'Yönetici',
      role TEXT NOT NULL DEFAULT 'admin',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      description TEXT DEFAULT '',
      price REAL NOT NULL DEFAULT 0,
      stock INTEGER NOT NULL DEFAULT 0,
      image TEXT DEFAULT '',
      reference TEXT DEFAULT '',
      featured INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_code TEXT NOT NULL UNIQUE,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      customer_phone TEXT DEFAULT '',
      address TEXT NOT NULL,
      city TEXT NOT NULL,
      note TEXT DEFAULT '',
      total REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'yeni',
      payment_method TEXT NOT NULL DEFAULT 'stripe',
      payment_status TEXT NOT NULL DEFAULT 'bekliyor',
      stripe_session_id TEXT DEFAULT '',
      stock_deducted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Eski veritabanları için: kolon yoksa ekle (idempotent göç).
  const kolonlar = await all("PRAGMA table_info('orders')");
  if (!kolonlar.some((k) => k.name === 'stock_deducted')) {
    await run('ALTER TABLE orders ADD COLUMN stock_deducted INTEGER NOT NULL DEFAULT 0');
  }

  await run(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
      product_name TEXT NOT NULL,
      unit_price REAL NOT NULL,
      quantity INTEGER NOT NULL
    )
  `);

  await run('CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id)');
  await run('CREATE INDEX IF NOT EXISTS idx_orders_code ON orders(order_code)');
}

module.exports = { db, get, all, run, initSchema, DB_PATH };
