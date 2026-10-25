<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Tenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

class PharmacySettingsController extends Controller
{
    public function branding(Request $request): JsonResponse
    {
        $tenant = Tenant::query()->whereKey($request->user()->tenant_id)->firstOrFail();

        return response()->json([
            'name' => $tenant->name,
            'phone' => $tenant->phone,
            'address' => $tenant->address,
            'logo_url' => $tenant->logo_path ? Storage::disk('public')->url($tenant->logo_path) : null,
            'receipt_header' => $tenant->receipt_header,
            'receipt_footer' => $tenant->receipt_footer,
        ]);
    }

    public function show(Request $request): JsonResponse
    {
        return response()->json($this->profile($request->user()->tenant_id));
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => 'required|string|max:150',
            'email' => 'nullable|email|max:150',
            'phone' => 'nullable|string|max:30',
            'address' => 'nullable|string|max:255',
            'kra_pin' => 'nullable|string|max:30',
            'ppb_licence_no' => 'nullable|string|max:60',
            'receipt_header' => 'nullable|string|max:160',
            'receipt_footer' => 'nullable|string|max:240',
        ]);

        $tenant = Tenant::query()->whereKey($request->user()->tenant_id)->firstOrFail();
        $tenant->update($data);

        return response()->json($this->profile($tenant->id));
    }

    public function uploadLogo(Request $request): JsonResponse
    {
        $request->validate([
            'logo' => 'required|image|mimes:png,jpg,jpeg,webp|max:2048|dimensions:max_width=2000,max_height=2000',
        ]);

        $tenant = Tenant::query()->whereKey($request->user()->tenant_id)->firstOrFail();
        $path = $request->file('logo')->store('pharmacy-logos/'.$tenant->id, 'public');
        $oldPath = $tenant->logo_path;
        $tenant->update(['logo_path' => $path]);

        if ($oldPath) {
            Storage::disk('public')->delete($oldPath);
        }

        return response()->json($this->profile($tenant->id));
    }

    public function deleteLogo(Request $request): JsonResponse
    {
        $tenant = Tenant::query()->whereKey($request->user()->tenant_id)->firstOrFail();
        if ($tenant->logo_path) {
            Storage::disk('public')->delete($tenant->logo_path);
            $tenant->update(['logo_path' => null]);
        }

        return response()->json($this->profile($tenant->id));
    }

    protected function profile(string $tenantId): array
    {
        $tenant = Tenant::query()->whereKey($tenantId)->firstOrFail();

        return [
            'id' => $tenant->id,
            'name' => $tenant->name,
            'slug' => $tenant->slug,
            'email' => $tenant->email,
            'phone' => $tenant->phone,
            'address' => $tenant->address,
            'kra_pin' => $tenant->kra_pin,
            'ppb_licence_no' => $tenant->ppb_licence_no,
            'receipt_header' => $tenant->receipt_header,
            'receipt_footer' => $tenant->receipt_footer,
            'logo_url' => $tenant->logo_path ? Storage::disk('public')->url($tenant->logo_path) : null,
        ];
    }
}
