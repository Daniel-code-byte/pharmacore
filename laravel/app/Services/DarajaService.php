<?php

namespace App\Services;

use App\Models\Branch;
use Illuminate\Support\Facades\Http;
use RuntimeException;

class DarajaService
{
    public function isConfigured(?Branch $branch = null): bool
    {
        foreach (['consumer_key', 'consumer_secret', 'shortcode', 'passkey', 'callback_url'] as $key) {
            if (! $this->credential($key, $branch)) {
                return false;
            }
        }

        return true;
    }

    public function normalizePhone(string $phone): string
    {
        $digits = preg_replace('/\D+/', '', $phone) ?? '';

        if (str_starts_with($digits, '0') && strlen($digits) === 10) {
            $digits = '254'.substr($digits, 1);
        } elseif (str_starts_with($digits, '7') && strlen($digits) === 9) {
            $digits = '254'.$digits;
        } elseif (str_starts_with($digits, '1') && strlen($digits) === 9) {
            $digits = '254'.$digits;
        }

        if (! preg_match('/^254[17]\d{8}$/', $digits)) {
            throw new RuntimeException('Enter a valid Kenyan M-Pesa phone number, for example 0712345678.');
        }

        return $digits;
    }

    public function initiateStkPush(string $phone, int $amount, string $accountReference, string $description, ?Branch $branch = null): array
    {
        $token = $this->accessToken($branch);
        $timestamp = now('Africa/Nairobi')->format('YmdHis');
        $shortcode = (string) $this->credential('shortcode', $branch);
        $password = base64_encode($shortcode.$this->credential('passkey', $branch).$timestamp);
        $baseUrl = $this->baseUrl();

        $response = Http::withToken($token)->acceptJson()->timeout(30)->post($baseUrl.'/mpesa/stkpush/v1/processrequest', [
            'BusinessShortCode' => $shortcode,
            'Password' => $password,
            'Timestamp' => $timestamp,
            'TransactionType' => config('services.mpesa.transaction_type', 'CustomerPayBillOnline'),
            'Amount' => $amount,
            'PartyA' => $phone,
            'PartyB' => $branch?->mpesa_till ?: config('services.mpesa.party_b', $shortcode),
            'PhoneNumber' => $phone,
            'CallBackURL' => $this->credential('callback_url', $branch),
            'AccountReference' => substr($accountReference, 0, 12),
            'TransactionDesc' => substr($description, 0, 13),
        ]);

        if (! $response->successful() || ! $response->json('CheckoutRequestID')) {
            throw new RuntimeException($response->json('errorMessage') ?? $response->json('ResponseDescription') ?? 'Daraja could not start the M-Pesa payment.');
        }

        return $response->json();
    }

    public function queryStkPush(string $checkoutRequestId, ?Branch $branch = null): array
    {
        $token = $this->accessToken($branch);
        $timestamp = now('Africa/Nairobi')->format('YmdHis');
        $shortcode = (string) $this->credential('shortcode', $branch);
        $password = base64_encode($shortcode.$this->credential('passkey', $branch).$timestamp);

        $response = Http::withToken($token)->acceptJson()->timeout(30)->post($this->baseUrl().'/mpesa/stkpushquery/v1/query', [
            'BusinessShortCode' => $shortcode,
            'Password' => $password,
            'Timestamp' => $timestamp,
            'CheckoutRequestID' => $checkoutRequestId,
        ]);

        if (! $response->successful()) {
            throw new RuntimeException($response->json('errorMessage') ?? 'Could not verify the M-Pesa transaction with Daraja.');
        }

        return $response->json();
    }

    protected function accessToken(?Branch $branch = null): string
    {
        $response = Http::withBasicAuth(
            (string) $this->credential('consumer_key', $branch),
            (string) $this->credential('consumer_secret', $branch),
        )->acceptJson()->timeout(20)->get($this->baseUrl().'/oauth/v1/generate', [
            'grant_type' => 'client_credentials',
        ]);

        $token = $response->json('access_token');
        if (! $response->successful() || ! $token) {
            throw new RuntimeException('Daraja authentication failed. Check the M-Pesa API credentials and environment.');
        }

        return $token;
    }

    protected function baseUrl(): string
    {
        return config('services.mpesa.environment') === 'production'
            ? 'https://api.safaricom.co.ke'
            : 'https://sandbox.safaricom.co.ke';
    }

    protected function credential(string $key, ?Branch $branch = null): ?string
    {
        $branchKey = match ($key) {
            'consumer_key' => 'mpesa_consumer_key',
            'consumer_secret' => 'mpesa_consumer_secret',
            'shortcode' => 'mpesa_shortcode',
            'passkey' => 'mpesa_passkey',
            default => null,
        };

        $value = $branchKey ? $branch?->{$branchKey} : null;

        return filled($value) ? (string) $value : (config('services.mpesa.'.$key) ?: null);
    }
}
