<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\ResolvesBranch;
use App\Http\Controllers\Controller;
use App\Models\Drug;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class DrugController extends Controller
{
    use ResolvesBranch;

    public function index(Request $request)
    {
        $branchId = $this->branchId($request);

        $stockQuery = DB::table('batches')
            ->selectRaw('COALESCE(SUM(quantity - reserved_quantity), 0)')
            ->whereColumn('batches.drug_id', 'drugs.id')
            ->where('batches.tenant_id', $request->user()->tenant_id)
            ->where('batches.branch_id', $branchId);
        if ($request->boolean('sellable_only')) {
            $stockQuery->where('batches.expiry_date', '>=', now()->toDateString());
        }

        $query = Drug::query()
            ->with('category:id,name')
            ->select('drugs.*')
            ->selectSub($stockQuery, 'stock_qty')
            ->where('tenant_id', $request->user()->tenant_id)
            ->orderBy('brand_name');

        if ($s = trim((string) $request->query('q', ''))) {
            $like = '%'.mb_strtolower($s).'%';
            $query->where(function ($w) use ($s, $like) {
                $w->whereRaw('LOWER(brand_name) LIKE ?', [$like])
                    ->orWhereRaw('LOWER(generic_name) LIKE ?', [$like])
                    ->orWhere('barcode', $s)
                    ->orWhere('sku', $s);
            });
        }

        if ($request->filled('category_id')) {
            $query->where('category_id', $request->query('category_id'));
        }

        if ($request->boolean('active_only', true)) {
            $query->where('is_active', true);
        }

        return $query->paginate(min((int) $request->query('per_page', 25), 100))
            ->through(function ($drug) {
                $drug->stock_qty = (int) ($drug->stock_qty ?? 0);

                return $drug;
            });
    }

    public function show(Request $request, Drug $drug): JsonResponse
    {
        if ($drug->tenant_id !== $request->user()->tenant_id) {
            abort(403);
        }

        $branchId = $this->branchId($request);

        $batches = $drug->batches()
            ->where('branch_id', $branchId)
            ->whereRaw('quantity > reserved_quantity')
            ->orderBy('expiry_date')
            ->get();

        return response()->json([
            'drug' => $drug->load('category:id,name'),
            'stock_qty' => (int) $batches->sum('available_quantity'),
            'batches' => $batches,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);
        $data['requires_rx'] = $this->needsRx($data);

        return response()->json(Drug::create([
            'tenant_id' => $request->user()->tenant_id,
            ...$data,
        ]), 201);
    }

    public function update(Request $request, Drug $drug): JsonResponse
    {
        if ($drug->tenant_id !== $request->user()->tenant_id) {
            abort(403);
        }

        $data = $this->validated($request, $drug);

        if (isset($data['schedule'])) {
            $data['requires_rx'] = $this->needsRx($data);
        }

        $drug->update($data);

        return response()->json($drug->fresh());
    }

    public function destroy(Drug $drug, Request $request): JsonResponse
    {
        if ($drug->tenant_id !== $request->user()->tenant_id) {
            abort(403);
        }

        $drug->update(['is_active' => false]);

        return response()->json(['message' => 'Drug deactivated.']);
    }

    public function substitutes(Request $request, Drug $drug)
    {
        if ($drug->tenant_id !== $request->user()->tenant_id) {
            abort(403);
        }

        $rows = Drug::query()
            ->select(['id', 'brand_name', 'generic_name', 'strength', 'dosage_form', 'selling_price'])
            ->where('tenant_id', $request->user()->tenant_id)
            ->where('generic_name', $drug->generic_name)
            ->where('id', '!=', $drug->id)
            ->orderBy('selling_price')
            ->get();

        foreach ($rows as $row) {
            $row->stock_qty = (int) DB::table('batches')
                ->where('tenant_id', $request->user()->tenant_id)
                ->where('branch_id', $request->user()->branch_id)
                ->where('drug_id', $row->id)
                ->where('expiry_date', '>=', now()->toDateString())
                ->sum(DB::raw('quantity - reserved_quantity'));
        }

        if ($request->boolean('in_stock')) {
            $rows = $rows->filter(fn ($row) => $row->stock_qty > 0)->values();
        }

        return response()->json($rows);
    }

    protected function needsRx(array $data): bool
    {
        return in_array($data['schedule'] ?? 'otc', ['prescription_only', 'controlled'], true);
    }

    protected function validated(Request $request, ?Drug $drug = null): array
    {
        $req = $drug ? 'sometimes' : 'required';

        return $request->validate([
            'category_id' => ['nullable', 'uuid', Rule::exists('categories', 'id')],
            'brand_name' => [$req, 'string', 'max:150'],
            'generic_name' => 'nullable|string|max:150',
            'strength' => 'nullable|string|max:50',
            'dosage_form' => 'nullable|string|max:50',
            'pack_size' => 'nullable|string|max:50',
            'manufacturer' => 'nullable|string|max:120',
            'barcode' => ['nullable', 'string', 'max:64', Rule::unique('drugs', 'barcode')->ignore($drug?->id)],
            'sku' => 'nullable|string|max:64',
            'schedule' => ['sometimes', Rule::in(['otc', 'pharmacy_only', 'prescription_only', 'controlled'])],
            'dosage_notes' => 'nullable|string|max:2000',
            'selling_price' => [$req, 'numeric', 'min:0'],
            'vat_rate' => 'nullable|numeric|min:0|max:100',
            'reorder_level' => 'nullable|integer|min:0',
            'is_active' => 'sometimes|boolean',
        ]);
    }
}
