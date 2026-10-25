<?php

namespace App\Providers;

use Illuminate\Support\Facades\Gate;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        Gate::before(function ($user, $ability) {
            if ($user && in_array($ability, ['owner', 'admin', 'pharmacist', 'stock_clerk', 'cashier'], true)) {
                return null;
            }

            return null;
        });
    }
}
