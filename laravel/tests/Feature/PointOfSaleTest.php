<?php

namespace Tests\Feature;

use App\Models\Batch;
use App\Models\Branch;
use App\Models\Drug;
use App\Models\Sale;
use App\Models\Tenant;
use App\Models\User;
use App\Services\SalesService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Http\UploadedFile;
use Tests\TestCase;

class PointOfSaleTest extends TestCase
{
    use RefreshDatabase;

    public function test_cash_sale_uses_earliest_expiry_stock_and_records_movement(): void
    {
        [$tenant, $branch, $cashier, $drug] = $this->createPharmacy();
        $earliest = $this->createBatch($tenant->id, $branch->id, $drug->id, 'EARLY', 2, now()->addMonths(2)->toDateString());
        $later = $this->createBatch($tenant->id, $branch->id, $drug->id, 'LATER', 8, now()->addMonths(8)->toDateString());

        $response = $this->actingAs($cashier, 'sanctum')->postJson('/api/sales', [
            'client_uuid' => (string) \Illuminate\Support\Str::uuid(),
            'items' => [['drug_id' => $drug->id, 'quantity' => 3]],
            'payment_method' => 'cash',
            'amount_received' => 50,
        ]);

        $response->assertCreated()
            ->assertJsonPath('status', 'paid')
            ->assertJsonPath('total', '30.00')
            ->assertJsonPath('change_due', '20.00')
            ->assertJsonCount(2, 'items');

        $this->assertSame(0, (int) $earliest->fresh()->quantity);
        $this->assertSame(7, (int) $later->fresh()->quantity);
        $this->assertDatabaseHas('stock_movements', [
            'reference_id' => $response->json('id'),
            'move_type' => 'sale',
            'quantity' => -2,
            'batch_id' => $earliest->id,
        ]);
        $this->assertDatabaseHas('stock_movements', [
            'reference_id' => $response->json('id'),
            'move_type' => 'sale',
            'quantity' => -1,
            'batch_id' => $later->id,
        ]);

        $repeat = $this->actingAs($cashier, 'sanctum')->postJson('/api/sales', [
            'client_uuid' => $response->json('client_uuid'),
            'items' => [['drug_id' => $drug->id, 'quantity' => 3]],
            'payment_method' => 'cash',
            'amount_received' => 50,
        ]);
        $repeat->assertOk()->assertJsonPath('id', $response->json('id'));
        $this->assertSame(0, (int) $earliest->fresh()->quantity);
        $this->assertSame(7, (int) $later->fresh()->quantity);
        $this->assertSame(1, Sale::query()->count());
    }

    public function test_sale_rejects_insufficient_stock_without_creating_a_receipt(): void
    {
        [$tenant, $branch, $cashier, $drug] = $this->createPharmacy();
        $this->createBatch($tenant->id, $branch->id, $drug->id, 'LOW', 2, now()->addMonths(2)->toDateString());

        $response = $this->actingAs($cashier, 'sanctum')->postJson('/api/sales', [
            'items' => [['drug_id' => $drug->id, 'quantity' => 3]],
            'payment_method' => 'cash',
            'amount_received' => 50,
        ]);

        $response->assertUnprocessable()->assertJsonValidationErrors('items');
        $this->assertSame(0, Sale::query()->count());
    }

    public function test_drug_search_returns_product_details_and_sellable_stock_for_pos(): void
    {
        [$tenant, $branch, $cashier, $drug] = $this->createPharmacy();
        $this->createBatch($tenant->id, $branch->id, $drug->id, 'POS-SEARCH', 5, now()->addMonths(2)->toDateString());

        $response = $this->actingAs($cashier, 'sanctum')->getJson('/api/drugs?q=Test%20Medicine');

        $response->assertOk()
            ->assertJsonPath('data.0.id', $drug->id)
            ->assertJsonPath('data.0.brand_name', 'Test Medicine')
            ->assertJsonPath('data.0.selling_price', '10.00')
            ->assertJsonPath('data.0.stock_qty', 5);
    }

    public function test_pos_sellable_search_excludes_expired_stock(): void
    {
        [$tenant, $branch, $cashier, $drug] = $this->createPharmacy();
        $this->createBatch($tenant->id, $branch->id, $drug->id, 'EXPIRED', 4, now()->subDay()->toDateString());
        $this->createBatch($tenant->id, $branch->id, $drug->id, 'CURRENT', 2, now()->addMonths(2)->toDateString());

        $response = $this->actingAs($cashier, 'sanctum')->getJson('/api/drugs?q=Test%20Medicine&sellable_only=1');

        $response->assertOk()->assertJsonPath('data.0.stock_qty', 2);
    }

    public function test_pending_mpesa_sale_reserves_stock_until_confirmation(): void
    {
        [$tenant, $branch, $cashier, $drug] = $this->createPharmacy();
        $batch = $this->createBatch($tenant->id, $branch->id, $drug->id, 'RESERVE', 5, now()->addMonths(2)->toDateString());
        $service = app(SalesService::class);

        $sale = $service->create([
            'items' => [['drug_id' => $drug->id, 'quantity' => 3]],
            'payment_method' => 'mpesa',
        ], $tenant->id, $branch->id, $cashier->id);

        $this->assertSame('pending', $sale->status);
        $this->assertSame(5, (int) $batch->fresh()->quantity);
        $this->assertSame(3, (int) $batch->fresh()->reserved_quantity);
        $this->assertSame(2, (int) $batch->fresh()->available_quantity);

        $completed = $service->complete($sale->id, $tenant->id, $branch->id, 'TEST123456');

        $this->assertSame('paid', $completed->status);
        $this->assertSame(2, (int) $batch->fresh()->quantity);
        $this->assertSame(0, (int) $batch->fresh()->reserved_quantity);
        $this->assertDatabaseHas('stock_movements', [
            'reference_id' => $sale->id,
            'move_type' => 'sale',
            'quantity' => -3,
        ]);
    }

    public function test_failed_mpesa_sale_releases_its_stock_reservation(): void
    {
        [$tenant, $branch, $cashier, $drug] = $this->createPharmacy();
        $batch = $this->createBatch($tenant->id, $branch->id, $drug->id, 'RELEASE', 5, now()->addMonths(2)->toDateString());
        $service = app(SalesService::class);
        $sale = $service->create([
            'items' => [['drug_id' => $drug->id, 'quantity' => 3]],
            'payment_method' => 'mpesa',
        ], $tenant->id, $branch->id, $cashier->id);

        $service->failPending($sale->id, $tenant->id, $branch->id, 'Customer cancelled');

        $this->assertSame('failed', $sale->fresh()->status);
        $this->assertSame(5, (int) $batch->fresh()->quantity);
        $this->assertSame(0, (int) $batch->fresh()->reserved_quantity);
    }

    public function test_mixed_vat_sale_stores_net_subtotal_tax_and_gross_total(): void
    {
        [$tenant, $branch, $cashier, $drug] = $this->createPharmacy();
        $drug->update(['vat_rate' => 16]);
        $this->createBatch($tenant->id, $branch->id, $drug->id, 'VAT', 3, now()->addMonths(2)->toDateString());

        $response = $this->actingAs($cashier, 'sanctum')->postJson('/api/sales', [
            'items' => [['drug_id' => $drug->id, 'quantity' => 1]],
            'payment_method' => 'cash',
            'amount_received' => 10,
        ]);

        $response->assertCreated()
            ->assertJsonPath('subtotal', '8.62')
            ->assertJsonPath('vat_amount', '1.38')
            ->assertJsonPath('total', '10.00');
    }

    public function test_mpesa_is_not_falsely_recorded_when_daraja_is_unconfigured(): void
    {
        [$tenant, $branch, $cashier, $drug] = $this->createPharmacy();
        $batch = $this->createBatch($tenant->id, $branch->id, $drug->id, 'MPESA-OFF', 5, now()->addMonths(2)->toDateString());

        $response = $this->actingAs($cashier, 'sanctum')->postJson('/api/sales', [
            'items' => [['drug_id' => $drug->id, 'quantity' => 1]],
            'payment_method' => 'mpesa',
            'phone' => '0712345678',
        ]);

        $response->assertStatus(503)->assertJsonPath('message', fn ($message) => str_contains($message, 'not configured'));
        $this->assertSame(0, Sale::query()->count());
        $this->assertSame(5, (int) $batch->fresh()->quantity);
        $this->assertSame(0, (int) $batch->fresh()->reserved_quantity);
    }

    public function test_mpesa_checkout_returns_configuration_error_before_creating_sale(): void
    {
        [$tenant, $branch, $cashier, $drug] = $this->createPharmacy();
        $this->createBatch($tenant->id, $branch->id, $drug->id, 'NO-DARAJA', 5, now()->addMonths(2)->toDateString());

        $response = $this->actingAs($cashier, 'sanctum')->postJson('/api/sales', [
            'items' => [['drug_id' => $drug->id, 'quantity' => 1]],
            'payment_method' => 'mpesa',
            'phone' => '0712345678',
        ]);

        $response->assertStatus(503)->assertJsonPath('message', fn ($message) => str_contains($message, 'not configured'));
        $this->assertSame(0, Sale::query()->count());
    }

    public function test_confirmed_daraja_callback_completes_sale_and_deducts_reserved_stock(): void
    {
        config([
            'services.mpesa.consumer_key' => 'test-consumer-key',
            'services.mpesa.consumer_secret' => 'test-consumer-secret',
            'services.mpesa.shortcode' => '174379',
            'services.mpesa.passkey' => 'test-passkey',
            'services.mpesa.callback_url' => 'https://test.example/api/payments/mpesa/callback',
        ]);
        Http::fake([
            '*oauth/v1/generate*' => Http::response(['access_token' => 'test-token', 'expires_in' => '3599']),
            '*mpesa/stkpush/v1/processrequest' => Http::response([
                'ResponseCode' => '0',
                'ResponseDescription' => 'Success. Request accepted for processing',
                'MerchantRequestID' => 'merchant-test-1',
                'CheckoutRequestID' => 'ws_CO_test_123',
                'CustomerMessage' => 'Success. Request accepted for processing',
            ]),
            '*mpesa/stkpushquery/v1/query' => Http::response([
                'ResponseCode' => '0',
                'ResultCode' => '0',
                'ResultDesc' => 'The service request is processed successfully.',
            ]),
        ]);

        [$tenant, $branch, $cashier, $drug] = $this->createPharmacy();
        $batch = $this->createBatch($tenant->id, $branch->id, $drug->id, 'DARAJA', 5, now()->addMonths(2)->toDateString());

        $checkout = $this->actingAs($cashier, 'sanctum')->postJson('/api/sales', [
            'items' => [['drug_id' => $drug->id, 'quantity' => 2]],
            'payment_method' => 'mpesa',
            'phone' => '0712345678',
        ]);

        $checkout->assertAccepted()->assertJsonPath('sale.status', 'pending');
        $this->assertSame(5, (int) $batch->fresh()->quantity);
        $this->assertSame(2, (int) $batch->fresh()->reserved_quantity);

        $callback = $this->postJson('/api/payments/mpesa/callback', [
            'Body' => ['stkCallback' => [
                'MerchantRequestID' => 'merchant-test-1',
                'CheckoutRequestID' => 'ws_CO_test_123',
                'ResultCode' => 0,
                'ResultDesc' => 'The service request is processed successfully.',
                'CallbackMetadata' => ['Item' => [
                    ['Name' => 'Amount', 'Value' => 20],
                    ['Name' => 'MpesaReceiptNumber', 'Value' => 'TEST123456'],
                    ['Name' => 'PhoneNumber', 'Value' => 254712345678],
                ]],
            ]],
        ]);

        $callback->assertOk()->assertJsonPath('ResultCode', 0);
        $this->assertSame('paid', Sale::query()->firstOrFail()->status);
        $this->assertSame(3, (int) $batch->fresh()->quantity);
        $this->assertSame(0, (int) $batch->fresh()->reserved_quantity);
        $this->assertDatabaseHas('mpesa_transactions', [
            'checkout_request_id' => 'ws_CO_test_123',
            'mpesa_receipt_no' => 'TEST123456',
            'status' => 'paid',
        ]);
    }

    public function test_owner_can_save_encrypted_branch_mpesa_credentials_without_exposing_them(): void
    {
        [$tenant, $branch, $owner, $drug] = $this->createPharmacy();
        $owner->update(['role' => 'owner']);
        config(['services.mpesa.callback_url' => 'https://test.example/api/payments/mpesa/callback']);

        $response = $this->actingAs($owner, 'sanctum')->putJson('/api/settings/mpesa', [
            'consumer_key' => 'branch-consumer-key',
            'consumer_secret' => 'branch-consumer-secret',
            'shortcode' => '123456',
            'passkey' => 'branch-passkey',
            'till' => '654321',
        ]);

        $response->assertOk()
            ->assertJsonPath('configured', true)
            ->assertJsonPath('merchant_shortcode', '123456')
            ->assertJsonPath('till', '654321')
            ->assertJsonMissingPath('consumer_secret');

        $this->assertDatabaseMissing('branches', [
            'id' => $branch->id,
            'mpesa_consumer_secret' => 'branch-consumer-secret',
        ]);
        $this->assertSame('branch-consumer-secret', $branch->fresh()->mpesa_consumer_secret);
    }

    public function test_owner_can_customize_pharmacy_profile_upload_logo_and_receipt(): void
    {
        Storage::fake('public');
        [$tenant, $branch, $owner, $drug] = $this->createPharmacy();
        $owner->update(['role' => 'owner']);
        $this->createBatch($tenant->id, $branch->id, $drug->id, 'BRAND', 5, now()->addMonths(2)->toDateString());

        $this->actingAs($owner, 'sanctum')->putJson('/api/settings/pharmacy', [
            'name' => 'Mwangaza Community Pharmacy',
            'email' => 'hello@mwangaza.test',
            'phone' => '0712345678',
            'address' => '12 Market Road, Nakuru',
            'kra_pin' => 'P000123456A',
            'receipt_header' => 'Thank you for trusting our team',
            'receipt_footer' => 'Keep medicines away from children.',
        ])->assertOk()->assertJsonPath('name', 'Mwangaza Community Pharmacy');

        $upload = $this->post('/api/settings/pharmacy/logo', [
            'logo' => UploadedFile::fake()->image('pharmacy-logo.png', 300, 180),
        ], ['Accept' => 'application/json']);
        $upload->assertOk()->assertJsonPath('logo_url', fn ($url) => str_contains($url, 'pharmacy-logos/'));

        $logoPath = $tenant->id.'/'.basename(parse_url($upload->json('logo_url'), PHP_URL_PATH));
        $this->assertDatabaseHas('tenants', ['id' => $tenant->id, 'logo_path' => 'pharmacy-logos/'.$logoPath]);
        Storage::disk('public')->assertExists('pharmacy-logos/'.$logoPath);

        $sale = $this->actingAs($owner, 'sanctum')->postJson('/api/sales', [
            'items' => [['drug_id' => $drug->id, 'quantity' => 1]],
            'payment_method' => 'cash',
            'amount_received' => 10,
        ])->assertCreated()->json();

        $this->getJson('/api/sales/'.$sale['id'])
            ->assertOk()
            ->assertJsonPath('pharmacy.name', 'Mwangaza Community Pharmacy')
            ->assertJsonPath('pharmacy.receipt_header', 'Thank you for trusting our team')
            ->assertJsonPath('pharmacy.receipt_footer', 'Keep medicines away from children.')
            ->assertJsonPath('pharmacy.logo_url', $upload->json('logo_url'));
    }

    public function test_sales_report_calculates_revenue_units_and_top_selling_product(): void
    {
        [$tenant, $branch, $cashier, $drug] = $this->createPharmacy();
        $cashier->update(['role' => 'pharmacist']);
        $this->createBatch($tenant->id, $branch->id, $drug->id, 'REPORT', 8, now()->addMonths(2)->toDateString());

        $this->actingAs($cashier, 'sanctum')->postJson('/api/sales', [
            'items' => [['drug_id' => $drug->id, 'quantity' => 2]],
            'payment_method' => 'cash',
            'amount_received' => 25,
        ])->assertCreated();

        $this->getJson('/api/reports/sales?days=7')
            ->assertOk()
            ->assertJsonPath('summary.sales_count', 1)
            ->assertJsonPath('summary.units_sold', 2)
            ->assertJsonPath('summary.revenue', 20)
            ->assertJsonPath('top_products.0.brand_name', 'Test Medicine')
            ->assertJsonPath('top_products.0.units_sold', 2);
    }

    private function createPharmacy(): array
    {
        $tenant = Tenant::create(['name' => 'Test Pharmacy '.uniqid()]);
        $branch = Branch::create(['tenant_id' => $tenant->id, 'name' => 'Main Branch']);
        $cashier = User::create([
            'tenant_id' => $tenant->id,
            'branch_id' => $branch->id,
            'full_name' => 'Test Cashier',
            'email' => uniqid('cashier').'@test.local',
            'password_hash' => Hash::make('password123'),
            'role' => 'cashier',
        ]);
        $drug = Drug::create([
            'tenant_id' => $tenant->id,
            'brand_name' => 'Test Medicine',
            'generic_name' => 'Test compound',
            'selling_price' => 10,
            'vat_rate' => 0,
            'reorder_level' => 1,
            'schedule' => 'otc',
            'requires_rx' => false,
        ]);

        return [$tenant, $branch, $cashier, $drug];
    }

    private function createBatch(string $tenantId, string $branchId, string $drugId, string $batchNo, int $quantity, string $expiry): Batch
    {
        return Batch::create([
            'tenant_id' => $tenantId,
            'branch_id' => $branchId,
            'drug_id' => $drugId,
            'batch_no' => $batchNo,
            'expiry_date' => $expiry,
            'cost_price' => 4,
            'quantity' => $quantity,
            'received_at' => now(),
        ]);
    }
}
