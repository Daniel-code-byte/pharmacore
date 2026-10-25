<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Supplier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SupplierController extends Controller
{
    public function index(Request $request)
    {
        return Supplier::query()
            ->where('tenant_id', $request->user()->tenant_id)
            ->orderBy('name')
            ->paginate(min(max((int) $request->query('per_page', 25), 1), 100));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => 'required|string|max:150',
            'contact_person' => 'nullable|string|max:120',
            'phone' => 'nullable|string|max:25',
            'email' => 'nullable|email|max:150',
            'address' => 'nullable|string|max:255',
            'kra_pin' => 'nullable|string|max:50',
            'payment_terms_days' => 'nullable|integer|min:0',
        ]);

        $supplier = Supplier::create([
            'tenant_id' => $request->user()->tenant_id,
            ...$data,
        ]);

        return response()->json($supplier, 201);
    }

    public function update(Request $request, Supplier $supplier): JsonResponse
    {
        $this->authorizeTenant($request, $supplier);

        $data = $request->validate([
            'name' => 'sometimes|string|max:150',
            'contact_person' => 'nullable|string|max:120',
            'phone' => 'nullable|string|max:25',
            'email' => 'nullable|email|max:150',
            'address' => 'nullable|string|max:255',
            'kra_pin' => 'nullable|string|max:50',
            'payment_terms_days' => 'nullable|integer|min:0',
            'is_active' => 'sometimes|boolean',
        ]);

        $supplier->update($data);

        return response()->json($supplier->fresh());
    }

    public function destroy(Request $request, Supplier $supplier): JsonResponse
    {
        $this->authorizeTenant($request, $supplier);
        $supplier->update(['is_active' => false]);

        return response()->json(['message' => 'Supplier deactivated.']);
    }

    protected function authorizeTenant(Request $request, Supplier $supplier): void
    {
        if ($supplier->tenant_id !== $request->user()->tenant_id) {
            abort(403);
        }
    }
}
