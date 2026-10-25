-- =====================================================================
-- PharmaCore: Pharmacy Management System
-- Section 1: Database schema (PostgreSQL 14+)
-- Multi-tenant: every business table carries tenant_id and is protected
-- by Row Level Security (RLS), so one pharmacy can never see another's data.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pg_trgm";    -- fast fuzzy drug search

-- ---------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------
CREATE TYPE user_role        AS ENUM ('owner','admin','pharmacist','cashier','stock_clerk');
CREATE TYPE payment_method   AS ENUM ('cash','mpesa','card','insurance','credit');
CREATE TYPE payment_status   AS ENUM ('pending','completed','failed','refunded');
CREATE TYPE sale_status      AS ENUM ('draft','completed','voided','refunded');
CREATE TYPE po_status        AS ENUM ('draft','sent','partial','received','cancelled');
CREATE TYPE stock_move_type  AS ENUM ('purchase','sale','return_in','return_out','adjustment','expired','transfer_in','transfer_out');
CREATE TYPE drug_schedule    AS ENUM ('otc','pharmacy_only','prescription_only','controlled');
CREATE TYPE subscription_plan AS ENUM ('trial','basic','pro','enterprise');

-- ---------------------------------------------------------------------
-- TENANCY: pharmacies (businesses), branches, users
-- ---------------------------------------------------------------------
CREATE TABLE tenants (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    kra_pin         TEXT,
    ppb_licence_no  TEXT,                       -- Pharmacy and Poisons Board licence
    email           TEXT,
    phone           TEXT,
    plan            subscription_plan NOT NULL DEFAULT 'trial',
    trial_ends_at   TIMESTAMPTZ DEFAULT (now() + interval '14 days'),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE branches (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    address     TEXT,
    phone       TEXT,
    mpesa_till  TEXT,                           -- till / paybill for this branch
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, name)
);

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id       UUID REFERENCES branches(id) ON DELETE SET NULL,
    full_name       TEXT NOT NULL,
    email           TEXT NOT NULL,
    phone           TEXT,
    password_hash   TEXT NOT NULL,
    role            user_role NOT NULL DEFAULT 'cashier',
    pharmacist_reg_no TEXT,                     -- required for dispensing Rx / controlled drugs
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, email)
);

-- ---------------------------------------------------------------------
-- CATALOGUE: categories, drugs (products), suppliers
-- ---------------------------------------------------------------------
CREATE TABLE categories (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    UNIQUE (tenant_id, name)
);

CREATE TABLE drugs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    category_id     UUID REFERENCES categories(id) ON DELETE SET NULL,
    brand_name      TEXT NOT NULL,
    generic_name    TEXT,                        -- active ingredient, used for substitutes
    strength        TEXT,                        -- e.g. 500mg
    dosage_form     TEXT,                        -- tablet, syrup, injection...
    pack_size       TEXT,                        -- e.g. 10x10
    manufacturer    TEXT,
    barcode         TEXT,
    sku             TEXT,
    schedule        drug_schedule NOT NULL DEFAULT 'otc',
    requires_rx     BOOLEAN NOT NULL DEFAULT FALSE,
    dosage_notes    TEXT,
    selling_price   NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (selling_price >= 0),
    vat_rate        NUMERIC(5,2)  NOT NULL DEFAULT 0,   -- most medicines are VAT exempt in Kenya
    reorder_level   INTEGER NOT NULL DEFAULT 10,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, barcode)
);
CREATE INDEX idx_drugs_tenant        ON drugs(tenant_id);
CREATE INDEX idx_drugs_generic       ON drugs(tenant_id, generic_name);
CREATE INDEX idx_drugs_brand_trgm    ON drugs USING gin (brand_name gin_trgm_ops);
CREATE INDEX idx_drugs_generic_trgm  ON drugs USING gin (generic_name gin_trgm_ops);

CREATE TABLE suppliers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    contact_person  TEXT,
    phone           TEXT,
    email           TEXT,
    address         TEXT,
    kra_pin         TEXT,
    payment_terms_days INTEGER NOT NULL DEFAULT 0,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, name)
);

-- ---------------------------------------------------------------------
-- INVENTORY: batches (the heart of a pharmacy system)
-- Every unit of stock belongs to a batch with its own expiry and cost.
-- ---------------------------------------------------------------------
CREATE TABLE batches (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id       UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    drug_id         UUID NOT NULL REFERENCES drugs(id) ON DELETE RESTRICT,
    supplier_id     UUID REFERENCES suppliers(id) ON DELETE SET NULL,
    batch_no        TEXT NOT NULL,
    expiry_date     DATE NOT NULL,
    cost_price      NUMERIC(12,2) NOT NULL CHECK (cost_price >= 0),
    quantity        INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    received_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (branch_id, drug_id, batch_no)
);
-- FEFO lookups: earliest expiry first, only batches with stock
CREATE INDEX idx_batches_fefo ON batches(branch_id, drug_id, expiry_date) WHERE quantity > 0;
CREATE INDEX idx_batches_expiry ON batches(tenant_id, expiry_date) WHERE quantity > 0;

-- Immutable audit trail of every stock change
CREATE TABLE stock_movements (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id   UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    batch_id    UUID NOT NULL REFERENCES batches(id) ON DELETE RESTRICT,
    drug_id     UUID NOT NULL REFERENCES drugs(id) ON DELETE RESTRICT,
    move_type   stock_move_type NOT NULL,
    quantity    INTEGER NOT NULL,                -- positive = in, negative = out
    reference_type TEXT,                         -- 'sale','purchase_order','adjustment'...
    reference_id   UUID,
    reason      TEXT,
    user_id     UUID REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_stock_moves_batch ON stock_movements(batch_id);
CREATE INDEX idx_stock_moves_drug  ON stock_movements(tenant_id, drug_id, created_at DESC);

-- ---------------------------------------------------------------------
-- PROCUREMENT: purchase orders and goods received
-- ---------------------------------------------------------------------
CREATE TABLE purchase_orders (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id   UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    po_number   TEXT NOT NULL,
    status      po_status NOT NULL DEFAULT 'draft',
    notes       TEXT,
    total_cost  NUMERIC(14,2) NOT NULL DEFAULT 0,
    created_by  UUID REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, po_number)
);

CREATE TABLE purchase_order_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    drug_id         UUID NOT NULL REFERENCES drugs(id) ON DELETE RESTRICT,
    qty_ordered     INTEGER NOT NULL CHECK (qty_ordered > 0),
    qty_received    INTEGER NOT NULL DEFAULT 0 CHECK (qty_received >= 0),
    unit_cost       NUMERIC(12,2) NOT NULL CHECK (unit_cost >= 0)
);

-- Goods Received Note: created when stock physically arrives
CREATE TABLE goods_received_notes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id       UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    purchase_order_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
    supplier_id     UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    grn_number      TEXT NOT NULL,
    supplier_invoice_no TEXT,
    received_by     UUID REFERENCES users(id),
    received_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, grn_number)
);

CREATE TABLE grn_items (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    grn_id      UUID NOT NULL REFERENCES goods_received_notes(id) ON DELETE CASCADE,
    drug_id     UUID NOT NULL REFERENCES drugs(id) ON DELETE RESTRICT,
    batch_id    UUID NOT NULL REFERENCES batches(id) ON DELETE RESTRICT,
    quantity    INTEGER NOT NULL CHECK (quantity > 0),
    unit_cost   NUMERIC(12,2) NOT NULL CHECK (unit_cost >= 0)
);

-- ---------------------------------------------------------------------
-- CUSTOMERS, PRESCRIPTIONS, INSURANCE
-- ---------------------------------------------------------------------
CREATE TABLE customers (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    full_name   TEXT NOT NULL,
    phone       TEXT,
    email       TEXT,
    date_of_birth DATE,
    credit_limit NUMERIC(12,2) NOT NULL DEFAULT 0,
    credit_balance NUMERIC(12,2) NOT NULL DEFAULT 0,   -- amount owed
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_customers_phone ON customers(tenant_id, phone);

CREATE TABLE insurers (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,                   -- e.g. SHA, Jubilee, AAR
    contact     TEXT,
    UNIQUE (tenant_id, name)
);

CREATE TABLE prescriptions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id       UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    customer_id     UUID REFERENCES customers(id) ON DELETE SET NULL,
    patient_name    TEXT NOT NULL,
    prescriber_name TEXT NOT NULL,
    prescriber_reg_no TEXT,
    facility        TEXT,
    prescribed_on   DATE NOT NULL DEFAULT CURRENT_DATE,
    notes           TEXT,
    dispensed_by    UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- SALES (POS)
-- ---------------------------------------------------------------------
CREATE TABLE sales (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id       UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    receipt_no      TEXT NOT NULL,
    customer_id     UUID REFERENCES customers(id) ON DELETE SET NULL,
    prescription_id UUID REFERENCES prescriptions(id) ON DELETE SET NULL,
    insurer_id      UUID REFERENCES insurers(id) ON DELETE SET NULL,
    cashier_id      UUID NOT NULL REFERENCES users(id),
    status          sale_status NOT NULL DEFAULT 'draft',
    subtotal        NUMERIC(14,2) NOT NULL DEFAULT 0,
    discount        NUMERIC(14,2) NOT NULL DEFAULT 0,
    vat_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
    total           NUMERIC(14,2) NOT NULL DEFAULT 0,
    -- KRA eTIMS fields, filled after the fiscal device/API responds
    etims_invoice_no TEXT,
    etims_qr_url     TEXT,
    etims_signed_at  TIMESTAMPTZ,
    client_uuid     UUID,                        -- idempotency key for offline sync
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, receipt_no),
    UNIQUE (tenant_id, client_uuid)
);
CREATE INDEX idx_sales_branch_date ON sales(branch_id, created_at DESC);

CREATE TABLE sale_items (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    sale_id     UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    drug_id     UUID NOT NULL REFERENCES drugs(id) ON DELETE RESTRICT,
    batch_id    UUID NOT NULL REFERENCES batches(id) ON DELETE RESTRICT,
    quantity    INTEGER NOT NULL CHECK (quantity > 0),
    unit_price  NUMERIC(12,2) NOT NULL,
    unit_cost   NUMERIC(12,2) NOT NULL,          -- snapshot of batch cost, for profit reports
    vat_rate    NUMERIC(5,2)  NOT NULL DEFAULT 0,
    line_total  NUMERIC(14,2) NOT NULL
);
CREATE INDEX idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX idx_sale_items_drug ON sale_items(tenant_id, drug_id);

-- A sale can be split across methods (e.g. part cash, part M-Pesa)
CREATE TABLE payments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    sale_id     UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    method      payment_method NOT NULL,
    amount      NUMERIC(14,2) NOT NULL CHECK (amount > 0),
    status      payment_status NOT NULL DEFAULT 'pending',
    reference   TEXT,                            -- M-Pesa receipt, card ref, claim no.
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- M-Pesa Daraja STK push tracking
CREATE TABLE mpesa_transactions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    payment_id          UUID REFERENCES payments(id) ON DELETE SET NULL,
    phone               TEXT NOT NULL,
    amount              NUMERIC(14,2) NOT NULL,
    merchant_request_id TEXT,
    checkout_request_id TEXT UNIQUE,
    mpesa_receipt_no    TEXT UNIQUE,
    result_code         INTEGER,
    result_desc         TEXT,
    status              payment_status NOT NULL DEFAULT 'pending',
    raw_callback        JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- CONTROLLED DRUGS REGISTER (legally required; append-only)
-- ---------------------------------------------------------------------
CREATE TABLE controlled_drug_register (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id       UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    drug_id         UUID NOT NULL REFERENCES drugs(id) ON DELETE RESTRICT,
    batch_id        UUID NOT NULL REFERENCES batches(id) ON DELETE RESTRICT,
    sale_id         UUID REFERENCES sales(id) ON DELETE SET NULL,
    prescription_id UUID REFERENCES prescriptions(id) ON DELETE SET NULL,
    quantity        INTEGER NOT NULL,            -- negative when dispensed
    balance_after   INTEGER NOT NULL,
    pharmacist_id   UUID NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- AUDIT LOG
-- ---------------------------------------------------------------------
CREATE TABLE audit_log (
    id          BIGSERIAL PRIMARY KEY,
    tenant_id   UUID REFERENCES tenants(id) ON DELETE CASCADE,
    user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
    action      TEXT NOT NULL,                   -- 'sale.void','price.change','login'...
    entity      TEXT,
    entity_id   UUID,
    details     JSONB,
    ip_address  INET,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_tenant_date ON audit_log(tenant_id, created_at DESC);

-- ---------------------------------------------------------------------
-- VIEWS
-- ---------------------------------------------------------------------
-- Current stock per drug per branch
CREATE VIEW v_stock_levels AS
SELECT  b.tenant_id, b.branch_id, b.drug_id, d.brand_name, d.generic_name,
        d.reorder_level,
        SUM(b.quantity)                               AS total_qty,
        SUM(b.quantity) <= d.reorder_level            AS is_low
FROM batches b
JOIN drugs d ON d.id = b.drug_id
GROUP BY b.tenant_id, b.branch_id, b.drug_id, d.brand_name, d.generic_name, d.reorder_level;

-- Batches expiring within 90 days, or already expired, with stock left
CREATE VIEW v_expiry_alerts AS
SELECT  b.tenant_id, b.branch_id, b.id AS batch_id, d.brand_name, b.batch_no,
        b.expiry_date, b.quantity,
        (b.expiry_date - CURRENT_DATE) AS days_left,
        b.quantity * b.cost_price      AS value_at_risk
FROM batches b
JOIN drugs d ON d.id = b.drug_id
WHERE b.quantity > 0 AND b.expiry_date <= CURRENT_DATE + 90;

-- Generic substitutes: other drugs with the same active ingredient and strength
CREATE VIEW v_substitutes AS
SELECT  a.id AS drug_id, s.id AS substitute_id, s.brand_name AS substitute_name,
        s.selling_price
FROM drugs a
JOIN drugs s ON s.tenant_id = a.tenant_id
            AND lower(s.generic_name) = lower(a.generic_name)
            AND s.strength IS NOT DISTINCT FROM a.strength
            AND s.id <> a.id
WHERE a.generic_name IS NOT NULL AND s.is_active;

-- ---------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- The API sets:  SET LOCAL app.tenant_id = '<uuid>';  at the start of
-- every request/transaction. Queries then only see that tenant's rows.
-- NOTE: the app must connect as a NON-superuser (superusers bypass RLS even when forced).
-- ---------------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
      'branches','users','categories','drugs','suppliers','batches',
      'stock_movements','purchase_orders','purchase_order_items',
      'goods_received_notes','grn_items','customers','insurers',
      'prescriptions','sales','sale_items','payments','mpesa_transactions',
      'controlled_drug_register','audit_log'])
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);   -- applies to the table owner too
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)
         WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
  END LOOP;
END $$;
