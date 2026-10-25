<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Models\Sale;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class SalesReportController extends Controller
{
    public function sales(Request $request)
    {
        $data = $request->validate([
            'days' => 'sometimes|integer|in:7,30,90',
            'to' => 'sometimes|date_format:Y-m-d',
        ]);
        $days = (int) ($data['days'] ?? 7);
        $to = isset($data['to']) ? Carbon::parse($data['to'])->endOfDay() : now()->endOfDay();
        $from = $to->copy()->subDays($days - 1)->startOfDay();
        $branchId = $request->user()->branch_id ?: Branch::query()
            ->where('tenant_id', $request->user()->tenant_id)
            ->value('id');

        $base = Sale::query()
            ->where('sales.tenant_id', $request->user()->tenant_id)
            ->where('sales.branch_id', $branchId)
            ->where('sales.status', 'paid')
            ->whereBetween('sales.paid_at', [$from, $to]);

        $summary = (clone $base)
            ->selectRaw('COUNT(*) as sales_count, COALESCE(SUM(total), 0) as revenue, COALESCE(SUM(vat_amount), 0) as vat, COALESCE(AVG(total), 0) as average_sale')
            ->first();

        $unitsSold = DB::table('sale_items')
            ->join('sales', 'sales.id', '=', 'sale_items.sale_id')
            ->where('sales.tenant_id', $request->user()->tenant_id)
            ->where('sales.branch_id', $branchId)
            ->where('sales.status', 'paid')
            ->whereBetween('sales.paid_at', [$from, $to])
            ->sum('sale_items.quantity');

        $paymentMethods = DB::table('payments')
            ->join('sales', 'sales.id', '=', 'payments.sale_id')
            ->where('payments.tenant_id', $request->user()->tenant_id)
            ->where('sales.branch_id', $branchId)
            ->where('sales.status', 'paid')
            ->where('payments.status', 'paid')
            ->whereBetween('sales.paid_at', [$from, $to])
            ->selectRaw('payments.method as method, COUNT(*) as sales_count, COALESCE(SUM(payments.amount), 0) as amount')
            ->groupBy('payments.method')
            ->orderBy('payments.method')
            ->get();

        $dailyRows = (clone $base)
            ->selectRaw('date(sales.paid_at) as sale_date, COUNT(*) as sales_count, COALESCE(SUM(sales.total), 0) as revenue')
            ->groupByRaw('date(sales.paid_at)')
            ->orderByRaw('date(sales.paid_at)')
            ->get()
            ->keyBy('sale_date');

        $unitsByDay = DB::table('sale_items')
            ->join('sales', 'sales.id', '=', 'sale_items.sale_id')
            ->where('sales.tenant_id', $request->user()->tenant_id)
            ->where('sales.branch_id', $branchId)
            ->where('sales.status', 'paid')
            ->whereBetween('sales.paid_at', [$from, $to])
            ->selectRaw('date(sales.paid_at) as sale_date, SUM(sale_items.quantity) as units_sold')
            ->groupByRaw('date(sales.paid_at)')
            ->get()
            ->keyBy('sale_date');

        $daily = [];
        for ($date = $from->copy()->startOfDay(); $date->lte($to); $date->addDay()) {
            $key = $date->toDateString();
            $row = $dailyRows->get($key);
            $daily[] = [
                'date' => $key,
                'sales_count' => (int) ($row->sales_count ?? 0),
                'revenue' => (float) ($row->revenue ?? 0),
                'units_sold' => (int) ($unitsByDay->get($key)->units_sold ?? 0),
            ];
        }

        $topProducts = DB::table('sale_items')
            ->join('sales', 'sales.id', '=', 'sale_items.sale_id')
            ->join('drugs', 'drugs.id', '=', 'sale_items.drug_id')
            ->where('sales.tenant_id', $request->user()->tenant_id)
            ->where('sales.branch_id', $branchId)
            ->where('sales.status', 'paid')
            ->whereBetween('sales.paid_at', [$from, $to])
            ->selectRaw('drugs.id as drug_id, drugs.brand_name, drugs.generic_name, SUM(sale_items.quantity) as units_sold, SUM(sale_items.line_total) as revenue')
            ->groupBy('drugs.id', 'drugs.brand_name', 'drugs.generic_name')
            ->orderByDesc('units_sold')
            ->limit(10)
            ->get();

        return response()->json([
            'period' => ['from' => $from->toDateString(), 'to' => $to->toDateString(), 'days' => $days],
            'summary' => [
                'sales_count' => (int) ($summary->sales_count ?? 0),
                'units_sold' => (int) $unitsSold,
                'revenue' => (float) ($summary->revenue ?? 0),
                'vat' => (float) ($summary->vat ?? 0),
                'average_sale' => (float) ($summary->average_sale ?? 0),
            ],
            'payment_methods' => $paymentMethods->map(fn ($row) => [
                'method' => $row->method,
                'sales_count' => (int) $row->sales_count,
                'amount' => (float) $row->amount,
            ]),
            'daily' => $daily,
            'top_products' => $topProducts->map(fn ($row) => [
                'drug_id' => $row->drug_id,
                'brand_name' => $row->brand_name,
                'generic_name' => $row->generic_name,
                'units_sold' => (int) $row->units_sold,
                'revenue' => (float) $row->revenue,
            ]),
        ]);
    }
}
