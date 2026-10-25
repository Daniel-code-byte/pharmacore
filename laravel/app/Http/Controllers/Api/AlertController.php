<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Batch;
use App\Models\Drug;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AlertController extends Controller
{
    public function expiry(Request $request)
    {
        $days = max(0, (int) $request->query('days', 90));
        $branchId = $request->user()->branch_id;

        $rows = Batch::query()
            ->with('drug')
            ->where('tenant_id', $request->user()->tenant_id)
            ->where('branch_id', $branchId)
            ->whereRaw('quantity > reserved_quantity')
            ->get();

        $expired = [];
        $expiringSoon = [];

        foreach ($rows as $batch) {
            $daysLeft = (int) now()->startOfDay()->diffInDays($batch->expiry_date, false);
            $item = [
                'batch_id' => $batch->id,
                'batch_no' => $batch->batch_no,
                'brand_name' => $batch->drug?->brand_name,
                'quantity' => $batch->available_quantity,
                'expiry_date' => $batch->expiry_date->toDateString(),
                'days_left' => $daysLeft,
            ];

            if ($daysLeft < 0) {
                $expired[] = $item;
            } elseif ($daysLeft <= $days) {
                $expiringSoon[] = $item;
            }
        }

        $valueAtRisk = $rows->sum(fn ($row) => $row->available_quantity * $row->cost_price);

        return response()->json([
            'expired' => $expired,
            'expiring_soon' => $expiringSoon,
            'value_at_risk' => $valueAtRisk,
        ]);
    }

    public function lowStock(Request $request)
    {
        return Drug::query()
            ->where('tenant_id', $request->user()->tenant_id)
            ->where('is_active', true)
            ->selectSub(DB::table('batches')
                ->selectRaw('COALESCE(SUM(quantity - reserved_quantity), 0)')
                ->whereColumn('batches.drug_id', 'drugs.id')
                ->where('batches.tenant_id', $request->user()->tenant_id)
                ->where('batches.branch_id', $request->user()->branch_id), 'stock_qty')
            ->whereRaw('(SELECT COALESCE(SUM(quantity - reserved_quantity), 0) FROM batches WHERE batches.drug_id = drugs.id AND batches.tenant_id = drugs.tenant_id AND batches.branch_id = ?) <= reorder_level', [$request->user()->branch_id])
            ->orderBy('brand_name')
            ->get(['id', 'brand_name', 'generic_name', 'strength', 'reorder_level'])
            ->map(fn ($drug) => [
                'id' => $drug->id,
                'brand_name' => $drug->brand_name,
                'generic_name' => $drug->generic_name,
                'strength' => $drug->strength,
                'reorder_level' => $drug->reorder_level,
                'stock_qty' => (int) ($drug->stock_qty ?? 0),
            ]);
    }
}
