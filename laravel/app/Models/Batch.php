<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Batch extends Model
{
    use BelongsToTenant, HasUuids;

    public $timestamps = false;

    protected $fillable = [
        'tenant_id', 'branch_id', 'drug_id', 'supplier_id', 'batch_no', 'expiry_date',
        'cost_price', 'quantity', 'received_at'
    ];

    protected $casts = [
        'expiry_date' => 'date',
        'received_at' => 'datetime',
        'cost_price' => 'decimal:2',
        'reserved_quantity' => 'integer',
    ];

    protected $appends = ['available_quantity'];

    protected function availableQuantity(): Attribute
    {
        return Attribute::get(fn (): int => max(0, (int) $this->quantity - (int) $this->reserved_quantity));
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function drug(): BelongsTo
    {
        return $this->belongsTo(Drug::class);
    }

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
    }
}
