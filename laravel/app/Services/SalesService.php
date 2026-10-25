<?php

namespace App\Services;

use App\Models\Batch;
use App\Models\Drug;
use App\Models\Payment;
use App\Models\Sale;
use App\Models\SaleItem;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class SalesService
{
    public function create(array $data, string $tenantId, string $branchId, string $cashierId): Sale
    {
        if (! empty($data['client_uuid'])) {
            $existing = Sale::query()->where('tenant_id', $tenantId)->where('client_uuid', $data['client_uuid'])->first();
            if ($existing) {
                return $existing->load(['items.drug', 'payments']);
            }
        }

        $quantities = [];
        foreach ($data['items'] as $item) {
            $quantities[$item['drug_id']] = ($quantities[$item['drug_id']] ?? 0) + (int) $item['quantity'];
        }

        $drugs = Drug::query()
            ->where('tenant_id', $tenantId)
            ->where('is_active', true)
            ->whereIn('id', array_keys($quantities))
            ->get()
            ->keyBy('id');

        if ($drugs->count() !== count($quantities)) {
            throw ValidationException::withMessages(['items' => ['One or more drugs are unavailable. Refresh the product list and try again.']]);
        }

        $prepared = [];
        $totalCents = 0;
        $vatCents = 0;
        foreach ($quantities as $drugId => $quantity) {
            $drug = $drugs->get($drugId);
            if (in_array($drug->schedule, ['prescription_only', 'controlled'], true) && empty($data['prescription_reference'])) {
                throw ValidationException::withMessages([
                    'prescription_reference' => ["A prescription reference is required for {$drug->brand_name}."],
                ]);
            }

            $available = (int) Batch::query()
                ->where('tenant_id', $tenantId)
                ->where('branch_id', $branchId)
                ->where('drug_id', $drugId)
                ->where('expiry_date', '>=', now()->toDateString())
                ->selectRaw('COALESCE(SUM(quantity - reserved_quantity), 0) as available')
                ->value('available');

            if ($available < $quantity) {
                throw ValidationException::withMessages([
                    'items' => ["Not enough unexpired stock for {$drug->brand_name}. Available: {$available}."]
                ]);
            }

            $unitPriceCents = (int) round(((float) $drug->selling_price) * 100);
            $lineCents = $unitPriceCents * $quantity;
            $rate = (float) $drug->vat_rate;
            $lineVatCents = $rate > 0 ? (int) round($lineCents * $rate / (100 + $rate)) : 0;
            $totalCents += $lineCents;
            $vatCents += $lineVatCents;
            $prepared[] = [
                'drug_id' => $drugId,
                'quantity' => $quantity,
                'unit_price' => $unitPriceCents / 100,
                'vat_rate' => $rate,
                'line_total' => $lineCents / 100,
            ];
        }

        $total = $totalCents / 100;
        if ($data['payment_method'] === 'mpesa' && $totalCents % 100 !== 0) {
            throw ValidationException::withMessages([
                'items' => ['M-Pesa STK requires a whole-shilling total. Adjust the item price or use cash.'],
            ]);
        }

        if ($data['payment_method'] === 'cash' && (float) $data['amount_received'] < $total) {
            throw ValidationException::withMessages(['amount_received' => ['Cash received must cover the sale total.']]);
        }

        $sale = DB::transaction(function () use ($data, $tenantId, $branchId, $cashierId, $prepared, $total, $totalCents, $vatCents) {
            $sale = Sale::create([
                'tenant_id' => $tenantId,
                'branch_id' => $branchId,
                'cashier_id' => $cashierId,
                'receipt_no' => 'PC-'.now()->format('ymd').'-'.Str::upper(Str::random(6)),
                'client_uuid' => $data['client_uuid'] ?? null,
                'status' => 'pending',
                'payment_method' => $data['payment_method'],
                'subtotal' => ($totalCents - $vatCents) / 100,
                'vat_amount' => $vatCents / 100,
                'total' => $total,
                'amount_received' => $data['payment_method'] === 'cash' ? $data['amount_received'] : null,
                'change_due' => $data['payment_method'] === 'cash' ? ((float) $data['amount_received'] - $total) : 0,
                'prescription_reference' => $data['prescription_reference'] ?? null,
            ]);

            foreach ($prepared as $line) {
                SaleItem::create([
                    'tenant_id' => $tenantId,
                    'sale_id' => $sale->id,
                    ...$line,
                ]);
            }

            Payment::create([
                'tenant_id' => $tenantId,
                'sale_id' => $sale->id,
                'method' => $data['payment_method'],
                'amount' => $total,
                'status' => 'pending',
            ]);

            if ($data['payment_method'] === 'mpesa') {
                $this->reserveForPendingSale($sale, $tenantId, $branchId);
            }

            return $sale;
        });

        if ($data['payment_method'] === 'cash') {
            try {
                $this->complete($sale->id, $tenantId, $branchId);
            } catch (ValidationException $exception) {
                $this->failPending($sale->id, $tenantId, $branchId, 'Stock validation failed during checkout.');
                throw $exception;
            }
        }

        return Sale::query()->where('tenant_id', $tenantId)->whereKey($sale->id)
            ->with(['items.drug', 'items.batch', 'payments'])
            ->firstOrFail();
    }

    public function complete(string $saleId, string $tenantId, string $branchId, ?string $paymentReference = null): Sale
    {
        return DB::transaction(function () use ($saleId, $tenantId, $branchId, $paymentReference) {
            $sale = Sale::query()->where('tenant_id', $tenantId)->where('branch_id', $branchId)
                ->whereKey($saleId)->lockForUpdate()->firstOrFail();

            if ($sale->status === 'paid') {
                return $sale->load(['items.drug', 'items.batch', 'payments']);
            }
            if ($sale->status !== 'pending') {
                throw ValidationException::withMessages(['sale' => ['This sale is no longer payable.']]);
            }

            $requestedItems = $sale->items()->get();
            $allocations = [];
            foreach ($requestedItems as $item) {
                if ($sale->payment_method === 'mpesa' && $item->batch_id) {
                    $batch = Batch::query()->where('tenant_id', $tenantId)->where('branch_id', $branchId)
                        ->whereKey($item->batch_id)->lockForUpdate()->firstOrFail();
                    if ($batch->reserved_quantity < $item->quantity || $batch->quantity < $item->quantity) {
                        throw ValidationException::withMessages(['items' => ['Reserved stock is no longer available.']]);
                    }
                    $allocations[] = ['request_item' => $item, 'batch' => $batch, 'quantity' => (int) $item->quantity, 'reserved' => true];
                    continue;
                }

                $remaining = (int) $item->quantity;
                $batches = Batch::query()
                    ->where('tenant_id', $tenantId)
                    ->where('branch_id', $branchId)
                    ->where('drug_id', $item->drug_id)
                    ->where('expiry_date', '>=', now()->toDateString())
                    ->whereRaw('quantity > reserved_quantity')
                    ->orderBy('expiry_date')
                    ->orderBy('received_at')
                    ->lockForUpdate()
                    ->get();

                foreach ($batches as $batch) {
                    if ($remaining === 0) {
                        break;
                    }
                    $take = min($remaining, (int) $batch->quantity - (int) $batch->reserved_quantity);
                    if ($take < 1) {
                        continue;
                    }
                    $allocations[] = [
                        'request_item' => $item,
                        'batch' => $batch,
                        'quantity' => $take,
                        'reserved' => false,
                    ];
                    $remaining -= $take;
                }

                if ($remaining > 0) {
                    throw ValidationException::withMessages([
                        'items' => ["Stock changed before payment completed for {$item->drug?->brand_name}. Reconcile this paid payment before dispensing."],
                    ]);
                }
            }

            $requestedItems->each(fn (SaleItem $item) => $item->delete());
            foreach ($allocations as $allocation) {
                /** @var SaleItem $requested */
                $requested = $allocation['request_item'];
                /** @var Batch $batch */
                $batch = $allocation['batch'];
                $quantity = $allocation['quantity'];

                $batch->decrement('quantity', $quantity);
                if ($allocation['reserved']) {
                    $batch->decrement('reserved_quantity', $quantity);
                }
                SaleItem::create([
                    'tenant_id' => $tenantId,
                    'sale_id' => $sale->id,
                    'drug_id' => $requested->drug_id,
                    'batch_id' => $batch->id,
                    'quantity' => $quantity,
                    'unit_price' => $requested->unit_price,
                    'unit_cost' => $batch->cost_price,
                    'vat_rate' => $requested->vat_rate,
                    'line_total' => round((float) $requested->unit_price * $quantity, 2),
                ]);

                DB::table('stock_movements')->insert([
                    'id' => (string) Str::uuid(),
                    'tenant_id' => $tenantId,
                    'branch_id' => $branchId,
                    'batch_id' => $batch->id,
                    'drug_id' => $requested->drug_id,
                    'move_type' => 'sale',
                    'quantity' => -$quantity,
                    'reference_type' => 'sale',
                    'reference_id' => $sale->id,
                    'reason' => 'POS sale '.$sale->receipt_no,
                    'user_id' => $sale->cashier_id,
                    'created_at' => now(),
                ]);
            }

            $sale->update(['status' => 'paid', 'paid_at' => now()]);
            $sale->payments()->where('status', 'pending')->update([
                'status' => 'paid',
                'reference' => $paymentReference,
            ]);

            return $sale->fresh()->load(['items.drug', 'items.batch', 'payments']);
        });
    }

    public function failPending(string $saleId, string $tenantId, string $branchId, string $reason): void
    {
        DB::transaction(function () use ($saleId, $tenantId, $branchId, $reason) {
            $sale = Sale::query()->where('tenant_id', $tenantId)->where('branch_id', $branchId)
                ->whereKey($saleId)->lockForUpdate()->firstOrFail();
            if ($sale->status !== 'pending') {
                return;
            }

            if ($sale->payment_method === 'mpesa') {
                foreach ($sale->items()->whereNotNull('batch_id')->get() as $item) {
                    Batch::query()->where('tenant_id', $tenantId)->whereKey($item->batch_id)
                        ->where('reserved_quantity', '>=', $item->quantity)
                        ->decrement('reserved_quantity', $item->quantity);
                }
            }

            $sale->update(['status' => 'failed']);
            $sale->payments()->where('status', 'pending')->update([
                'status' => 'failed',
                'reference' => $reason,
            ]);
        });
    }

    protected function reserveForPendingSale(Sale $sale, string $tenantId, string $branchId): void
    {
        $requestedItems = $sale->items()->get();
        $allocations = [];
        foreach ($requestedItems as $item) {
            $remaining = (int) $item->quantity;
            $batches = Batch::query()
                ->where('tenant_id', $tenantId)
                ->where('branch_id', $branchId)
                ->where('drug_id', $item->drug_id)
                ->where('expiry_date', '>=', now()->toDateString())
                ->whereRaw('quantity > reserved_quantity')
                ->orderBy('expiry_date')
                ->orderBy('received_at')
                ->lockForUpdate()
                ->get();

            foreach ($batches as $batch) {
                if ($remaining === 0) {
                    break;
                }
                $take = min($remaining, (int) $batch->quantity - (int) $batch->reserved_quantity);
                if ($take < 1) {
                    continue;
                }
                $allocations[] = ['request_item' => $item, 'batch' => $batch, 'quantity' => $take];
                $remaining -= $take;
            }

            if ($remaining > 0) {
                throw ValidationException::withMessages(['items' => ['Available stock changed. Refresh the basket and try again.']]);
            }
        }

        $requestedItems->each(fn (SaleItem $item) => $item->delete());
        foreach ($allocations as $allocation) {
            /** @var SaleItem $requested */
            $requested = $allocation['request_item'];
            /** @var Batch $batch */
            $batch = $allocation['batch'];
            $quantity = $allocation['quantity'];
            $batch->increment('reserved_quantity', $quantity);

            SaleItem::create([
                'tenant_id' => $tenantId,
                'sale_id' => $sale->id,
                'drug_id' => $requested->drug_id,
                'batch_id' => $batch->id,
                'quantity' => $quantity,
                'unit_price' => $requested->unit_price,
                'unit_cost' => $batch->cost_price,
                'vat_rate' => $requested->vat_rate,
                'line_total' => round((float) $requested->unit_price * $quantity, 2),
            ]);
        }
    }
}
