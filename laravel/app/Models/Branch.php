<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Branch extends Model
{
    use BelongsToTenant, HasUuids;

    public $timestamps = false;

    protected $fillable = [
        'tenant_id', 'name', 'address', 'phone', 'mpesa_till', 'mpesa_consumer_key',
        'mpesa_consumer_secret', 'mpesa_shortcode', 'mpesa_passkey', 'is_active',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'mpesa_consumer_key' => 'encrypted',
        'mpesa_consumer_secret' => 'encrypted',
        'mpesa_passkey' => 'encrypted',
    ];

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }

    public function batches(): HasMany
    {
        return $this->hasMany(Batch::class);
    }
}
