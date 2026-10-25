<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Models\Tenant;
use App\Models\User;
use App\Support\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function registerPharmacy(Request $request): JsonResponse
    {
        $data = $request->validate([
            'pharmacy_name' => 'required|string|max:150',
            'ppb_licence_no' => 'nullable|string|max:60',
            'kra_pin' => 'nullable|string|max:20',
            'owner_name' => 'required|string|max:120',
            'email' => 'required|email|max:150',
            'phone' => 'nullable|string|max:20',
            'password' => 'required|string|min:8',
        ]);

        return DB::transaction(function () use ($data) {
            $tenant = Tenant::create([
                'name' => $data['pharmacy_name'],
                'slug' => $this->uniqueSlug($data['pharmacy_name']),
                'kra_pin' => $data['kra_pin'] ?? null,
                'ppb_licence_no' => $data['ppb_licence_no'] ?? null,
                'email' => $data['email'],
                'phone' => $data['phone'] ?? null,
            ]);

            TenantContext::set($tenant->id);

            $branch = Branch::create([
                'tenant_id' => $tenant->id,
                'name' => 'Main Branch',
                'phone' => $data['phone'] ?? null,
            ]);

            $user = User::create([
                'tenant_id' => $tenant->id,
                'branch_id' => $branch->id,
                'full_name' => $data['owner_name'],
                'email' => strtolower($data['email']),
                'phone' => $data['phone'] ?? null,
                'password_hash' => Hash::make($data['password']),
                'role' => 'owner',
            ]);

            return response()->json($this->tokenResponse($user, $tenant), 201);
        });
    }

    public function login(Request $request): JsonResponse
    {
        $data = $request->validate([
            'pharmacy' => 'required|string',
            'email' => 'required|email',
            'password' => 'required|string',
        ]);

        $fail = fn () => throw ValidationException::withMessages([
            'email' => ['Invalid pharmacy code, email or password.'],
        ]);

        $tenant = Tenant::query()
            ->where('slug', Str::lower($data['pharmacy']))
            ->where('is_active', true)
            ->first();

        if (! $tenant) {
            $fail();
        }

        $user = User::query()
            ->where('tenant_id', $tenant->id)
            ->where('email', strtolower($data['email']))
            ->where('is_active', true)
            ->first();

        if (! $user || ! Hash::check($data['password'], $user->password_hash)) {
            $fail();
        }

        $user->forceFill(['last_login_at' => now()])->save();

        return response()->json($this->tokenResponse($user, $tenant));
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json(['user' => $request->user()]);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()?->delete();

        return response()->json(['message' => 'Logged out.']);
    }

    protected function tokenResponse(User $user, Tenant $tenant): array
    {
        $token = $user->createToken('pos-'.$user->role);
        $token->accessToken->forceFill(['tenant_id' => $user->tenant_id])->save();

        return [
            'token' => $token->plainTextToken,
            'user' => $user,
            'tenant' => ['id' => $tenant->id, 'name' => $tenant->name, 'slug' => $tenant->slug],
        ];
    }

    protected function uniqueSlug(string $name): string
    {
        $base = Str::slug($name) ?: 'pharmacy';
        $slug = $base;
        $i = 2;

        while (Tenant::where('slug', $slug)->exists()) {
            $slug = $base.'-'.$i++;
        }

        return $slug;
    }
}
