<?php

namespace App\Http\Controllers\Api\Concerns;

use App\Models\Branch;
use Illuminate\Http\Request;

trait ResolvesBranch
{
    protected function branchId(Request $request): ?string
    {
        $user = $request->user();

        if (! $user) {
            return null;
        }

        return $user->branch_id ?: Branch::query()
            ->where('tenant_id', $user->tenant_id)
            ->value('id');
    }
}
