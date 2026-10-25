<?php

namespace App\Support;

use Illuminate\Support\Facades\Cache;

class TenantContext
{
    public const KEY = 'tenant_context_id';

    public static function set(string $tenantId): void
    {
        Cache::put(self::KEY, $tenantId, 3600);
    }

    public static function id(): ?string
    {
        return Cache::get(self::KEY);
    }

    public static function clear(): void
    {
        Cache::forget(self::KEY);
    }
}
