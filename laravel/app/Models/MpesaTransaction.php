<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MpesaTransaction extends Model
{
    use HasUuids;

    public $timestamps = false;

    protected $fillable = [
        'tenant_id', 'payment_id', 'branch_id', 'phone', 'amount', 'merchant_request_id', 'checkout_request_id',
        'mpesa_receipt_no', 'result_code', 'result_desc', 'status', 'raw_callback',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'raw_callback' => 'array',
    ];

    public function payment(): BelongsTo
    {
        return $this->belongsTo(Payment::class);
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }
}
