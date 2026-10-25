export type Role = 'owner' | 'admin' | 'pharmacist' | 'cashier' | 'stock_clerk';
export type Schedule = 'otc' | 'pharmacy_only' | 'prescription_only' | 'controlled';

export interface User {
  id: string; tenant_id: string; branch_id: string | null;
  full_name: string; email: string; role: Role;
}
export interface Tenant { id: string; name: string; slug: string }
export interface PharmacyProfile {
  id: string; name: string; slug: string; email: string | null; phone: string | null;
  address: string | null; kra_pin: string | null; ppb_licence_no: string | null;
  receipt_header: string | null; receipt_footer: string | null; logo_url: string | null;
}
export type PharmacyBranding = Pick<PharmacyProfile, 'name' | 'phone' | 'address' | 'logo_url' | 'receipt_header' | 'receipt_footer'>;
export interface Category { id: string; name: string }

export interface Supplier {
  id: string; name: string; contact_person: string | null; phone: string | null;
  email: string | null; address: string | null; payment_terms_days: number; is_active: boolean;
}

export interface Drug {
  id: string; brand_name: string; generic_name: string | null; strength: string | null;
  dosage_form: string | null; pack_size: string | null; manufacturer: string | null;
  barcode: string | null; sku: string | null; schedule: Schedule; requires_rx: boolean;
  dosage_notes: string | null; selling_price: string; vat_rate: string;
  reorder_level: number; is_active: boolean; category_id: string | null;
  category?: Category | null; stock_qty?: number;
}

export interface Batch {
  id: string; batch_no: string; expiry_date: string; quantity: number;
  reserved_quantity?: number; available_quantity?: number; cost_price?: string; drug_id: string;
  drug?: { id: string; brand_name: string; generic_name: string | null; strength: string | null };
  supplier?: { id: string; name: string } | null;
}

export interface Paginated<T> { data: T[]; current_page: number; last_page: number; total: number }

export interface Substitute {
  id: string; brand_name: string; generic_name: string | null; strength: string | null;
  dosage_form: string | null; selling_price: string; stock_qty: number | string;
}

export interface ExpiryAlert {
  batch_id: string; brand_name: string; batch_no: string; expiry_date: string;
  quantity: number; days_left: number; value_at_risk: string | number;
}
export interface ExpiryResponse { expired: ExpiryAlert[]; expiring_soon: ExpiryAlert[]; value_at_risk: number }

export interface LowStock {
  id: string; brand_name: string; generic_name: string | null; strength: string | null;
  reorder_level: number; stock_qty: number;
}

export interface LoginResponse { token: string; user: User; tenant: Tenant }

export interface SalePayment { id: string; method: 'cash' | 'mpesa'; amount: string; status: string; reference: string | null }
export interface SaleItem {
  id: string; drug_id: string; batch_id: string | null; quantity: number;
  unit_price: string; unit_cost: string; vat_rate: string; line_total: string;
  drug?: Drug; batch?: Batch | null;
}
export interface Sale {
  id: string; receipt_no: string; status: 'pending' | 'paid' | 'failed'; payment_method: 'cash' | 'mpesa';
  subtotal: string; vat_amount: string; total: string; amount_received: string | null;
  change_due: string; prescription_reference: string | null; created_at: string; paid_at: string | null;
  items: SaleItem[]; payments: SalePayment[];
  pharmacy?: Pick<PharmacyProfile, 'name' | 'phone' | 'address' | 'kra_pin' | 'receipt_header' | 'receipt_footer' | 'logo_url'>;
}

export interface SalesReport {
  period: { from: string; to: string; days: number };
  summary: { sales_count: number; units_sold: number; revenue: number; vat: number; average_sale: number };
  payment_methods: Array<{ method: string; sales_count: number; amount: number }>;
  daily: Array<{ date: string; sales_count: number; revenue: number; units_sold: number }>;
  top_products: Array<{ drug_id: string; brand_name: string; generic_name: string | null; units_sold: number; revenue: number }>;
}

export interface MpesaSettings {
  branch_name: string; environment: 'sandbox' | 'production'; merchant_shortcode: string | null;
  till: string | null; configured: boolean; consumer_key_configured: boolean;
  consumer_secret_configured: boolean; passkey_configured: boolean; callback_configured: boolean;
}
