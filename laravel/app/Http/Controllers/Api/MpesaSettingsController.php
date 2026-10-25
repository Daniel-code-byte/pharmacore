<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Branch;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class MpesaSettingsController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $branch = $this->branch($request);

        return response()->json([
            'branch_name' => $branch->name,
            'environment' => config('services.mpesa.environment', 'sandbox'),
            'merchant_shortcode' => $branch->mpesa_shortcode,
            'till' => $branch->mpesa_till,
            'configured' => $this->branchConfigured($branch),
            'consumer_key_configured' => filled($branch->mpesa_consumer_key) || filled(config('services.mpesa.consumer_key')),
            'consumer_secret_configured' => filled($branch->mpesa_consumer_secret) || filled(config('services.mpesa.consumer_secret')),
            'passkey_configured' => filled($branch->mpesa_passkey) || filled(config('services.mpesa.passkey')),
            'callback_configured' => (bool) config('services.mpesa.callback_url'),
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'consumer_key' => 'nullable|string|max:500',
            'consumer_secret' => 'nullable|string|max:500',
            'shortcode' => 'nullable|string|max:30',
            'passkey' => 'nullable|string|max:500',
            'till' => 'nullable|string|max:30',
        ]);
        $branch = $this->branch($request);

        $fields = [
            'consumer_key' => 'mpesa_consumer_key',
            'consumer_secret' => 'mpesa_consumer_secret',
            'shortcode' => 'mpesa_shortcode',
            'passkey' => 'mpesa_passkey',
            'till' => 'mpesa_till',
        ];
        foreach ($fields as $input => $column) {
            if (array_key_exists($input, $data) && $data[$input] !== null && $data[$input] !== '') {
                $branch->{$column} = trim($data[$input]);
            }
        }

        $branch->save();
        return $this->show($request);
    }

    protected function branch(Request $request): Branch
    {
        $branchId = $request->user()->branch_id;
        $branch = Branch::query()
            ->where('tenant_id', $request->user()->tenant_id)
            ->where('is_active', true)
            ->when($branchId, fn ($query) => $query->whereKey($branchId))
            ->first();

        if (! $branch) {
            throw ValidationException::withMessages(['branch' => ['No active branch is assigned to your account.']]);
        }

        return $branch;
    }

    protected function branchConfigured(Branch $branch): bool
    {
        return app(\App\Services\DarajaService::class)->isConfigured($branch);
    }
}
