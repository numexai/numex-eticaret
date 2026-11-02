# Numex E-Ticaret

**MIT lisanslı e-ticaret başlangıç iskeleti** — Numex AI tarafından geliştirildi.

> **Bu bir başlangıç iskeletidir, hazır mağaza değildir.** Canlı satıştan önce ödeme ve güvenlik gözden geçirilmeli, yasal metinler ve örnek içerik kendi bilgilerinizle değiştirilmelidir.

[![Lisans: MIT](https://img.shields.io/badge/lisans-MIT-b4472c.svg)](LICENSE)
![Node.js](https://img.shields.io/badge/node-%3E%3D18-3c873a.svg)
![Express](https://img.shields.io/badge/express-4.x-000000.svg)
![SQLite](https://img.shields.io/badge/veritaban%C4%B1-SQLite-003b57.svg)
![Şablon](https://img.shields.io/badge/%C5%9Fablon-EJS-90a93a.svg)
![Durum](https://img.shields.io/badge/durum-ba%C5%9Flang%C4%B1%C3%A7%20iskeleti-1c2126.svg)

Vitrin + ürün detay + sepet + kapıda ödeme + Stripe bağlantısı + yönetim paneli. Harici veritabanı sunucusu gerekmez, tek komutla ayağa kalkar.

---

## İçindekiler

- [Özellikler](#özellikler)
- [Hızlı başlangıç](#hızlı-başlangıç)
- [Ortam değişkenleri](#ortam-değişkenleri)
- [Ödeme (Stripe)](#ödeme-stripe)
- [Mimari](#mimari)
- [Veri modeli](#veri-modeli)
- [HTTP uçları](#http-uçları)
- [Mağaza görselleri](#mağaza-görselleri)
- [Canlıya çıkış kontrol listesi](#canlıya-çıkış-kontrol-listesi)
- [Katkı](#katkı)
- [Lisans](#lisans)

---

## Özellikler

### Vitrin
- Ana sayfa: hero, güven şeridi, öne çıkan ürünler, kategori vitrini, müşteri yorumları, bülten bloğu
- Ürün listesi: kategori filtresi, arama, sıralama
- Ürün detay: puan, stok durumu, teslimat bilgisi, atıf/kaynak kutusu, benzer ürünler
- Sipariş takibi: sipariş kodu ile durum sorgulama
- Duyarlı yerleşim: masaüstü, tablet ve 360 px'e kadar telefon

### Sepet ve sipariş
- Oturum tabanlı sepet (giriş zorunlu değil), miktar güncelleme ve ürün çıkarma
- Adres bilgili sipariş formu, sunucu tarafı doğrulama
- Sipariş kodu üretimi (`NMX-YYYYMMDD-XXXXXX`)
- Sipariş sonrası başarı / iptal ekranları

### Ödeme
| Yöntem | Durum |
|---|---|
| **Kapıda ödeme** | Çalışır, gerçek tıklama yoluyla denendi. Anahtar yoksa varsayılan; `ALLOW_COD_FALLBACK=false` ile kapanır |
| **Stripe Checkout** | Kod ve imzalı webhook yazıldı, webhook imzası sahte anahtarla sınandı. **Gerçek bir Stripe test hesabıyla uçtan uca denenmedi** |
| **iyzico** | **Deneysel, henüz çalışmıyor.** Yetki başlığı iyzico'nun beklediği biçimde değil, kimlik no ve IP alanları sabit değer. `IYZICO_DENEYSEL=true` olmadan ödeme sayfasında görünmez |

Stok düşümü tek noktada ve idempotenttir: aynı ödeme birkaç kez bildirilse de stok yalnız bir kez düşer.

### Yönetim paneli (`/admin`)
- bcrypt ile hash'lenmiş yönetici girişi, oturum koruması
- Dashboard: ciro, sipariş/ürün sayıları, satış trendi grafiği, durum dağılımı, son işlemler
- Ürün yönetimi: ekleme, düzenleme, aktif/pasif, öne çıkan, stok ve fiyat
- Kategori yönetimi, sipariş listesi ve sipariş durumu güncelleme

### Güvenlik
- Parametreli SQL sorguları (SQL enjeksiyonuna kapalı)
- bcrypt şifre hash'leme; düz metin şifre saklanmaz
- Yönetici rotalarında yetki kontrolü
- Stripe webhook imza doğrulaması (ham gövde üzerinden)
- Sırlar `.env`'de tutulur, `.gitignore` ile depo dışında bırakılır

---

## Hızlı başlangıç

```bash
git clone <depo-adresi> numex-eticaret
cd numex-eticaret
npm install
cp ornek.env .env      # Windows PowerShell: Copy-Item ornek.env .env
```

`.env` içindeki `SESSION_SECRET`, `ADMIN_EMAIL` ve `ADMIN_PASSWORD` değerlerini düzenleyin, sonra:

```bash
npm start
```

| Adres | Açıklama |
|---|---|
| http://localhost:3000 | Mağaza vitrini |
| http://localhost:3000/urunler | Ürün listesi |
| http://localhost:3000/admin | Yönetim paneli |

İlk açılışta `.env` değerleriyle yönetici hesabı oluşturulur ve örnek katalog tohumlanır. `.env`'deki `ADMIN_PASSWORD` sonradan değiştirilirse, sunucu yeniden başlatıldığında veritabanındaki hash otomatik olarak yeni değerle eşitlenir.

**Geliştirme modu** (dosya değişiminde otomatik yeniden başlatma):

```bash
npm run dev
```

---

> **Linux notu:** Hazır sqlite3 paketi glibc 2.38 ister (Debian 13, Ubuntu 24.04 ve üstü). Eski sistemde uygulama açılmazsa daha yeni bir sürüm kullanın.

## Ortam değişkenleri

`ornek.env` dosyasını `.env` olarak kopyalayıp doldurun.

| Değişken | Zorunlu | Açıklama |
|---|---|---|
| `PORT` | — | Sunucu portu (varsayılan `3000`) |
| `SESSION_SECRET` | **evet** | Oturum imzalama anahtarı; canlıda uzun rastgele bir değer olmalı |
| `ADMIN_EMAIL` | evet | Yönetici e-posta adresi |
| `ADMIN_PASSWORD` | evet | Yönetici şifresi (yalnız ilk oluşturmada ve senkron için kullanılır) |
| `SITE_NAME` | — | Vitrinde görünen mağaza adı |
| `STRIPE_SECRET_KEY` | — | Stripe gizli anahtarı (`sk_test_…` / `sk_live_…`) |
| `STRIPE_PUBLISHABLE_KEY` | — | Stripe açık anahtarı (`pk_test_…` / `pk_live_…`) |
| `STRIPE_WEBHOOK_SECRET` | — | Webhook imza anahtarı (`whsec_…`) |
| `ALLOW_COD_FALLBACK` | — | Stripe yokken kapıda ödemeye izin ver (varsayılan `true`) |
| `IYZICO_DENEYSEL` | — | `true` olmadan iyzico görünmez; deneysel, henüz çalışmıyor |
| `DEMO_MODU` | — | `true` ise demo şeridi çıkar, panel salt okunur olur |
| `DB_PATH` | — | SQLite dosya yolu (varsayılan `data/numex.db`) |
| `CURRENCY` | — | Para birimi (varsayılan `try`) |

> `STRIPE_SECRET_KEY` ve `SESSION_SECRET` **asla** depoya girmez. `.env` dosyası `.gitignore` içindedir.

---

## Ödeme (Stripe)

1. [Stripe paneli → API anahtarları](https://dashboard.stripe.com/apikeys) adresinden anahtarları alın.
2. `.env` içine yazın:

   ```
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_PUBLISHABLE_KEY=pk_test_...
   ```

3. Webhook'u yerelde dinleyin:

   ```bash
   stripe listen --forward-to localhost:3000/odeme/webhook
   ```

   Komutun verdiği `whsec_...` değerini `STRIPE_WEBHOOK_SECRET` olarak `.env`'e ekleyin.

4. Test kartı: `4242 4242 4242 4242` — gelecekte bir son kullanma tarihi, herhangi 3 haneli CVC.

Anahtar boşsa sipariş kapıda ödeme olarak kaydedilir. Canlıya çıkarken `sk_live_…` ve gerçek webhook uç noktası kullanılmalıdır.

---

## Mimari

```
İstek
  │
  ├─ express.urlencoded / json      gövde ayrıştırma
  ├─ express.static                 public/ ve data/uploads/
  ├─ express-session                oturum (cookie tabanlı)
  ├─ connect-flash                  tek seferlik mesajlar
  ├─ attachCart                     sepeti oturuma bağlar
  ├─ res.locals                     siteName, currentUser, cartCount, biçimleyiciler
  │
  ├─ routes/magaza.js               /  /urunler  /urun/:slug  /siparis-takip  /hakkimizda
  ├─ routes/sepet.js                /sepet  (ekle, güncelle, çıkar)
  ├─ routes/odeme.js                /odeme  /odeme/basarili  /odeme/iptal  /odeme/webhook
  ├─ routes/admin.js                /admin (giriş + korumalı panel rotaları)
  │
  └─ hata yakalayıcı                404 ve 500 için EJS sayfası
```

```
src/
  server.js            uygulama girişi, ara katman sırası, rota bağlama
  db.js                SQLite bağlantısı, şema (idempotent), get/all/run sarmalayıcıları
  seed.js              örnek katalog + yönetici hesabı (kendi kendine yeterli)
  kapak.js             ürün görseli yoksa üretilen SVG kapak
  yardimci.js          TL/tarih biçimleyiciler, durum etiketleri
  middleware/
    auth.js            requireAdmin — oturum kontrolü
    cart.js            attachCart — sepeti oturuma bağlar
  routes/
    magaza.js  sepet.js  odeme.js  admin.js
  views/
    *.ejs              vitrin şablonları
    partials/          ust.ejs, alt.ejs, urun-kart.ejs
    admin/             panel şablonları ve panel partial'ı
public/
  css/stil.css         tek stil dosyası (tasarım token'ları :root içinde)
data/
  numex.db             SQLite veritabanı (git'e girmez)
  uploads/             yüklenen ürün görselleri (git'e girmez)
```

**Tasarım kararları**

- **Sunucusuz veritabanı**: SQLite — kurulum derdi yok, tek dosya yedeklenir. Trafik artınca `db.js` içindeki sarmalayıcılar korunarak PostgreSQL'e taşınabilir.
- **Sunucu tarafı render (EJS)**: ilk boya hızlı, SEO bedava, istemci paketi yok.
- **Ödeme mantığı ayrı rotada** (`routes/odeme.js`): sağlayıcı değişirse yalnız bu dosya yeniden yazılır; imza doğrulaması ham gövde üzerinden yapılır.
- **Tasarım token'ları**: renk, boşluk, gölge `:root` altında; tema değişikliği tek yerden yapılır.

---

## Veri modeli

```
users        id, email (unique), password_hash, name, role, created_at
categories   id, name, slug (unique), description, sort_order
products     id, name, slug (unique), category_id → categories,
             description, price, stock, image, reference,
             featured, active, created_at
orders       id, order_code (unique), customer_name, customer_email,
             customer_phone, address, city, note, total,
             status, payment_method, payment_status,
             stripe_session_id, created_at
order_items  id, order_id → orders (CASCADE), product_id → products,
             product_name, unit_price, quantity
```

Sipariş durumları: `yeni` → `hazirlaniyor` → `kargoda` → `teslim` (ve `iptal`).
Ödeme durumları: `bekliyor`, `odendi`, `basarisiz`, `iade`.

`reference` alanı, ürünün kaynağını/atfını taşır ve ürün sayfasında ayrı kutuda gösterilir — açık kaynak ve akademik içerikte atıf bütünlüğü için.

---

## HTTP uçları

| Yöntem | Yol | Açıklama |
|---|---|---|
| GET | `/` | Ana sayfa |
| GET | `/urunler` | Ürün listesi (`?kategori=`, `?q=`, `?sirala=`) |
| GET | `/urun/:slug` | Ürün detay |
| GET | `/sepet` | Sepet |
| POST | `/sepet/ekle` | Sepete ürün ekle |
| POST | `/sepet/guncelle` | Miktar güncelle |
| POST | `/sepet/cikar` | Üründen çıkar |
| GET | `/odeme` | Sipariş formu |
| POST | `/odeme` | Sipariş oluştur / Stripe oturumu aç |
| GET | `/odeme/basarili` | Ödeme başarılı |
| GET | `/odeme/iptal` | Ödeme iptal |
| POST | `/odeme/webhook` | Stripe webhook (imza doğrulamalı) |
| GET | `/siparis-takip` | Sipariş kodu ile sorgulama |
| GET | `/hakkimizda` | Kurumsal sayfa |
| GET | `/admin/giris` · POST | Yönetici girişi |
| POST | `/admin/cikis` | Çıkış |
| GET | `/admin` | Dashboard |

---

## Mağaza görselleri

Ürüne panelden görsel yüklenmezse `src/kapak.js` devreye girer: kategoriye göre renklenen, ürün kısaltmasını taşıyan bir **SVG kapak** üretilir. Bu sayede katalog hiçbir zaman boş gri kutu göstermez; gerçek görsel yüklendiğinde otomatik olarak onun yerini alır.

---

## Canlıya çıkış kontrol listesi

- [ ] Ödeme yöntemi seçildi ve kendi hesabınızla test ödemesiyle uçtan uca denendi
- [ ] Marka adı, logo ve alt bilgi (`src/views/partials`) kendi firmanızla değiştirildi
- [ ] `/yasal` sayfasındaki KVKK ve mesafeli satış metinleri bir hukukçu tarafından dolduruldu
- [ ] Ana sayfadaki örnek yorumlar, teslimat ve iade sözleri gerçek koşullarınıza göre düzenlendi
- [ ] Örnek ürünler silindi
- [ ] `SESSION_SECRET` uzun ve rastgele (en az 32 karakter)
- [ ] `ADMIN_PASSWORD` güçlü ve `.env` dışında hiçbir yerde yok
- [ ] `NODE_ENV=production`
- [ ] HTTPS arkasında çalışıyor; `src/server.js` içinde `app.set('trust proxy', 1)` ve `cookie.secure: true` eklendi
- [ ] Stripe `sk_live_…` + gerçek webhook uç noktası tanımlı
- [ ] `data/numex.db` için düzenli yedekleme kurulu
- [ ] `ALLOW_COD_FALLBACK` bilinçli olarak seçildi
- [ ] Oturum deposu kalıcı bir depoya alındı (varsayılan bellek deposu tek süreç içindir)
- [ ] Vekil sunucu arkasında giriş sınırı gerçek IP'yi görüyor (`trust proxy`)
- [ ] Sunucu logları ve hata izleme açık

---

## Katkı

1. Dal açın: `git checkout -b ozellik/kisa-ad`
2. Değişikliği yapın, `npm start` ile ayağa kaldırıp gerçekten deneyin
3. Anlamlı bir commit mesajı yazın
4. Pull request açın; neyi neden değiştirdiğinizi kısaca anlatın

Hata bildirirken: beklenen davranış, gerçekleşen davranış ve yeniden üretme adımları yeterli.

---

## Lisans

**MIT** — ayrıntı için [LICENSE](LICENSE). Ticari kullanım, değiştirme ve yeniden dağıtım serbesttir; telif bildirimi korunmalıdır.

Geliştiren: **Numex AI** — https://www.numexai.com.tr

---

## Numex ile geliştirildi

Bu iskelet, Numex kod ajanıyla yazıldı. Numex'i denemek için: https://www.numexai.com.tr
