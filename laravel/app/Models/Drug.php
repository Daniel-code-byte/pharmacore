<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Drug extends Model
{
    use BelongsToTenant, HasUuids;

    public $timestamps = false;

    protected $fillable = [
        'tenant_id', 'category_id', 'brand_name', 'generic_name', 'strength', 'dosage_form',
        'pack_size', 'manufacturer', 'barcode', 'sku', 'schedule', 'requires_rx',
        'dosage_notes', 'selling_price', 'vat_rate', 'reorder_level', 'is_active'
    ];

    protected $casts = [
        'requires_rx' => 'boolean',
        'is_active' => 'boolean',
        'selling_price' => 'decimal:2',
        'vat_rate' => 'decimal:2',
    ];

    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
    }

    public function batches(): HasMany
    {
        return $this->hasMany(Batch::class);
    }
}
