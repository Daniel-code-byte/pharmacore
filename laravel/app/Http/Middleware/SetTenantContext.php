<?php

namespace App\Http\Middleware;

use App\Support\TenantContext;
use Closure;
use Illuminate\Http\Request;

class SetTenantContext
{
    public function handle(Request $request, Closure $next)
    {
        if ($request->user()) {
            TenantContext::set($request->user()->tenant_id);
        }

        return $next($request);
    }
}
