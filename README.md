# PharmaCore

A multi-tenant pharmacy operations app for managing medicine inventory and counter sales.

## What it includes

- Pharmacy account registration and role-based access
- Medicine catalogue, suppliers, batches, expiry and low-stock alerts
- Point of sale with cash checkout and automatic FEFO stock deduction
- M-Pesa Daraja STK Push integration hooks and per-branch merchant settings
- Sales history, printable pharmacy-branded receipts, and sales performance reports
- SQLite local-development setup, with Laravel migrations and a Next.js frontend

## Run locally

See [SETUP.md](SETUP.md) for prerequisites, installation, migrations, frontend/backend startup, tests, and M-Pesa configuration. Local development uses SQLite; real M-Pesa collection requires approved Daraja credentials and a public HTTPS callback URL.

## Project layout

- `frontend/` — Next.js application
- `laravel/` — Laravel API, migrations, and feature tests
- `db/` — original SQL schema design/reference

This public repository is source code, not a production deployment. Review legal, pharmacy-regulatory, payment, security, hosting, backup, and KRA eTIMS requirements before using it with live customers or dispensing regulated medicines.
