<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

class Tenant extends Model
{
    use HasUuids;

    public $timestamps = false;

    protected $fillable = [
        'name', 'kra_pin', 'ppb_licence_no', 'email', 'phone', 'address', 'logo_path',
        'receipt_header', 'receipt_footer', 'plan', 'trial_ends_at', 'is_active',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'trial_ends_at' => 'datetime',
    ];

    public function branches(): HasMany
    {
        return $this->hasMany(Branch::class);
    }

    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }

    public static function booted(): void
    {
        static::creating(function (self $tenant) {
            $tenant->slug = $tenant->slug ?: Str::slug($tenant->name) ?: 'pharmacy';
        });
    }
}
