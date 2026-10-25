<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Batch;
use App\Models\Drug;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class BatchController extends Controller
{
    public function index(Request $request)
    {
        $query = Batch::query()
            ->with(['drug', 'supplier'])
            ->where('tenant_id', $request->user()->tenant_id)
            ->where('branch_id', $request->user()->branch_id)
            ->orderBy('expiry_date');

        if ($request->filled('drug_id')) {
            $query->where('drug_id', $request->query('drug_id'));
        }

        if ($request->filled('expired_only')) {
            $query->where('expiry_date', '<', now()->toDateString());
        }

        if ($request->filled('expiring_in')) {
            $days = max(0, min((int) $request->query('expiring_in'), 3650));
            $today = now()->toDateString();

            if ($days === 0) {
                $query->where('expiry_date', '<=', $today);
            } else {
                $query->whereBetween('expiry_date', [$today, now()->addDays($days)->toDateString()]);
            }
        }

        return $query->paginate(min(max((int) $request->query('per_page', 25), 1), 100));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'drug_id' => 'required|uuid|exists:drugs,id',
            'batch_no' => 'required|string|max:80',
            'expiry_date' => 'required|date',
            'cost_price' => 'required|numeric|min:0',
            'quantity' => 'required|integer|min:0',
            'supplier_id' => 'nullable|uuid|exists:suppliers,id',
        ]);

        $drug = Drug::where('id', $data['drug_id'])
            ->where('tenant_id', $request->user()->tenant_id)
            ->firstOrFail();

        $batch = Batch::create([
            'tenant_id' => $request->user()->tenant_id,
            'branch_id' => $request->user()->branch_id,
            'drug_id' => $drug->id,
            'supplier_id' => $data['supplier_id'] ?? null,
            'batch_no' => trim($data['batch_no']),
            'expiry_date' => $data['expiry_date'],
            'cost_price' => $data['cost_price'],
            'quantity' => $data['quantity'],
            'received_at' => now(),
        ]);

        DB::table('stock_movements')->insert([
            'id' => (string) \Illuminate\Support\Str::uuid(),
            'tenant_id' => $request->user()->tenant_id,
            'branch_id' => $request->user()->branch_id,
            'batch_id' => $batch->id,
            'drug_id' => $drug->id,
            'move_type' => 'purchase',
            'quantity' => (int) $data['quantity'],
            'reference_type' => 'batch_receipt',
            'reference_id' => $batch->id,
            'reason' => 'Initial receipt',
            'user_id' => $request->user()->id,
            'created_at' => now(),
        ]);

        return response()->json($batch, 201);
    }

    public function adjust(Request $request, Batch $batch): JsonResponse
    {
        if ($batch->tenant_id !== $request->user()->tenant_id || $batch->branch_id !== $request->user()->branch_id) {
            abort(403);
        }

        $data = $request->validate([
            'quantity_change' => 'sometimes|required_without:quantity|integer|not_in:0',
            'quantity' => 'sometimes|required_without:quantity_change|integer|not_in:0',
            'type' => 'sometimes|in:adjustment,expired,return_out',
            'reason' => 'nullable|string|max:200',
        ]);

        $quantityChange = (int) ($data['quantity_change'] ?? $data['quantity']);
        $updatedBatch = DB::transaction(function () use ($batch, $data, $quantityChange, $request) {
            $lockedBatch = Batch::query()->whereKey($batch->id)->lockForUpdate()->firstOrFail();
            if ($lockedBatch->quantity + $quantityChange < $lockedBatch->reserved_quantity) {
                throw \Illuminate\Validation\ValidationException::withMessages([
                    'quantity_change' => ['The adjustment cannot reduce stock below reserved or zero.'],
                ]);
            }

            $lockedBatch->update(['quantity' => $lockedBatch->quantity + $quantityChange]);

            DB::table('stock_movements')->insert([
                'id' => (string) \Illuminate\Support\Str::uuid(),
                'tenant_id' => $request->user()->tenant_id,
                'branch_id' => $request->user()->branch_id,
                'batch_id' => $lockedBatch->id,
                'drug_id' => $lockedBatch->drug_id,
                'move_type' => $data['type'] ?? 'adjustment',
                'quantity' => $quantityChange,
                'reference_type' => 'manual_adjustment',
                'reference_id' => $lockedBatch->id,
                'reason' => $data['reason'] ?? 'Manual adjustment',
                'user_id' => $request->user()->id,
                'created_at' => now(),
            ]);

            return $lockedBatch->fresh();
        });

        return response()->json($updatedBatch);
    }
}
