# PharmaCore — local setup and testing

The app is already scaffolded. Do not run `composer create-project` or copy another Laravel project over it. Local development uses SQLite, so PostgreSQL is not required.

## What the app does

PharmaCore is intended to help a pharmacy manage its catalogue, stock and counter sales. A cashier uses **Point of sale** to scan/search products and build a basket. The server calculates prices from the catalogue, checks sellable stock for that pharmacy branch, rejects expired batches, and takes inventory from the earliest-expiring batch first. Paid sales update stock and create stock-movement records in one database transaction; failed or duplicate checkouts must not silently deduct stock. The **Sales history** screen provides receipt and payment-status lookup. Stock clerks can manage stock but cannot create POS sales; checkout is available to owners, admins, pharmacists and cashiers.

The live M-Pesa integration is an optional Daraja STK Push. It asks the customer's phone to approve payment. The server holds inventory while payment is pending, only deducts it after confirmed payment, and releases the reservation when Safaricom reports failure. This is not a substitute for pharmacy review of prescription rules, dispensing practice, controlled-medicine registers, or KRA fiscal receipts.

## Requirements

- PHP 8.3 or newer with SQLite, PDO SQLite, OpenSSL, Mbstring, Tokenizer, XML, and Ctype extensions
- Composer 2
- Node.js 18.18 or newer and npm

## First-time setup

From the repository root:

```bash
cd laravel
composer install
```

`laravel/.env` is configured for the local SQLite database at `laravel/database/database.sqlite`. For a fresh copy, create the SQLite file if needed, copy `.env.example` to `.env`, set `DB_CONNECTION=sqlite` and `DB_DATABASE` to the absolute path of that file, then run `php artisan key:generate`.

Install and run the database migrations, including the Sanctum token-table migrations:

```bash
php artisan migrate
```

In another terminal:

```bash
cd frontend
npm install
```

`frontend/.env.local` should contain `API_URL=http://127.0.0.1:8000`. For a fresh checkout, copy `.env.local.example` to `.env.local`.

## Start the app

Run each command in its own terminal and leave both running:

```bash
cd laravel
php artisan serve --host 127.0.0.1 --port 8000
```

```bash
cd frontend
npm run dev -- --hostname 127.0.0.1 --port 3000
```

Open <http://127.0.0.1:3000>. Register a pharmacy first, then sign in using the pharmacy code shown after registration, email, and password. Next.js forwards `/api/*` requests to Laravel.

## Verification

```bash
cd laravel
php artisan test
php artisan migrate:status
```

```bash
cd frontend
npm run build
```

The app includes pharmacy registration/login, drugs and substitutes, categories, suppliers, stock batches/adjustments, expiry/low-stock alerts, a POS, role permissions, and tenant scoping. POS cash checkout verifies stock and server-side prices, consumes unexpired batches earliest-expiry-first, and records sale stock movements in one transaction. Cash change and prescription references are recorded; prescription-only and controlled medicines require a prescription reference. `php artisan migrate:fresh` deletes local data; use it only when you intentionally want to reset the database.

### M-Pesa STK Push

The pharmacy enters its own consumer key, consumer secret, shortcode/till, and passkey in the app's **M-Pesa setup** page. The platform operator sets these callback/environment values in `laravel/.env`:

```dotenv
MPESA_ENV=sandbox
MPESA_CALLBACK_URL=https://your-public-https-host/api/payments/mpesa/callback
MPESA_TRANSACTION_TYPE=CustomerPayBillOnline
```

Use the sandbox environment and a public HTTPS callback tunnel for development; localhost callback URLs cannot receive Daraja callbacks. For production, use the approved production environment and a stable callback domain. The checkout reserves stock while the STK request is pending, deducts it on confirmed payment, and releases it on a failed callback. If a pharmacy's Daraja credentials or platform callback configuration is absent, cash sales still work and M-Pesa checkout returns a clear configuration error. A public URL and valid Daraja credentials are required to verify a live STK transaction; the local project cannot simulate Safaricom settlement by itself. Never commit real merchant credentials.

M-Pesa is payment collection only. Safaricom credentials do not provide KRA eTIMS fiscal receipts; eTIMS integration, refunds/void workflows, customer/prescription records, and production deployment/security review remain separate work before commercial production use.

## Per-pharmacy setup

The pharmacy owner/admin opens **M-Pesa setup** in the app and saves the branch's consumer key, consumer secret, shortcode, optional receiving till, and passkey. Credentials are encrypted at rest and are not displayed back. The app's selected Daraja environment and callback URL are configured by the platform operator in the Laravel server environment. This keeps each pharmacy's merchant credentials separate while the callback infrastructure remains under operator control.

## Production notes

This setup is for local testing, not production deployment. Before production, configure a managed database, secure production environment variables and `APP_KEY`, HTTPS, backups, monitoring, and deployment processes. Review auth/session/token policies and operational/security requirements for the deployment environment.
