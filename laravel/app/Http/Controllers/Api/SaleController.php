<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MpesaTransaction;
use App\Models\Sale;
use App\Models\Branch;
use App\Models\Tenant;
use App\Services\DarajaService;
use App\Services\SalesService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use RuntimeException;

class SaleController extends Controller
{
    public function __construct(
        protected SalesService $sales,
        protected DarajaService $daraja,
    ) {}

    public function index(Request $request)
    {
        return Sale::query()
            ->where('tenant_id', $request->user()->tenant_id)
            ->where('branch_id', $this->branchId($request))
            ->with(['items.drug', 'payments'])
            ->orderByDesc('created_at')
            ->paginate(min(max((int) $request->query('per_page', 20), 1), 100));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'client_uuid' => 'nullable|uuid',
            'items' => 'required|array|min:1|max:50',
            'items.*.drug_id' => 'required|uuid|distinct',
            'items.*.quantity' => 'required|integer|min:1|max:10000',
            'payment_method' => 'required|in:cash,mpesa',
            'amount_received' => 'required_if:payment_method,cash|nullable|numeric|min:0',
            'phone' => 'required_if:payment_method,mpesa|nullable|string|max:30',
            'prescription_reference' => 'nullable|string|max:100',
        ]);

        $branchId = $this->branchId($request);
        if (! $branchId) {
            throw ValidationException::withMessages(['branch' => ['Your account is not assigned to an active branch.']]);
        }

        if ($data['payment_method'] === 'mpesa') {
            $branch = Branch::query()->where('tenant_id', $request->user()->tenant_id)->whereKey($branchId)->first();
            if (! $branch || ! $this->daraja->isConfigured($branch)) {
                return response()->json([
                    'message' => 'M-Pesa STK is not configured yet. Set the Daraja credentials and public HTTPS callback URL in laravel/.env.',
                ], 503);
            }
            try {
                $data['phone'] = $this->daraja->normalizePhone($data['phone']);
            } catch (RuntimeException $exception) {
                throw ValidationException::withMessages(['phone' => [$exception->getMessage()]]);
            }
        }

        if (! empty($data['client_uuid'])) {
            $existing = Sale::query()
                ->where('tenant_id', $request->user()->tenant_id)
                ->where('branch_id', $branchId)
                ->where('client_uuid', $data['client_uuid'])
                ->with(['items.drug', 'items.batch', 'payments'])
                ->first();
            if ($existing) {
                return response()->json($existing, $existing->status === 'paid' ? 200 : 202);
            }
        }

        $sale = $this->sales->create(
            $data,
            $request->user()->tenant_id,
            $branchId,
            $request->user()->id,
        );

        if ($data['payment_method'] === 'cash') {
            return response()->json($sale, 201);
        }

        $payment = $sale->payments->first();
        try {
            $stk = $this->daraja->initiateStkPush(
                $data['phone'],
                (int) round((float) $sale->total),
                $sale->receipt_no,
                'Pharmacy purchase',
                $branch,
            );

            DB::transaction(function () use ($sale, $payment, $branch, $data, $stk) {
                MpesaTransaction::create([
                    'tenant_id' => $sale->tenant_id,
                    'payment_id' => $payment->id,
                    'branch_id' => $branch->id,
                    'phone' => $data['phone'],
                    'amount' => $sale->total,
                    'merchant_request_id' => $stk['MerchantRequestID'] ?? null,
                    'checkout_request_id' => $stk['CheckoutRequestID'],
                    'status' => 'pending',
                    'result_desc' => $stk['ResponseDescription'] ?? 'STK prompt sent to customer.',
                ]);
            });
        } catch (RuntimeException $exception) {
            app(SalesService::class)->failPending($sale->id, $sale->tenant_id, $sale->branch_id, $exception->getMessage());
            $payment->update(['reference' => $exception->getMessage()]);

            return response()->json(['message' => $exception->getMessage()], 502);
        } catch (\Throwable $exception) {
            report($exception);

            return response()->json([
                'message' => 'The M-Pesa request may have reached the customer, but could not be recorded. Do not retry this sale until its payment status is reconciled.',
            ], 503);
        }

        return response()->json([
            'sale' => $sale->fresh()->load(['items.drug', 'payments']),
            'message' => 'An M-Pesa payment request was sent. Complete it on the customer phone; stock is deducted only after payment is confirmed.',
        ], 202);
    }

    public function show(Request $request, Sale $sale): JsonResponse
    {
        $this->authorizeSale($request, $sale);

        if ($sale->status === 'pending' && $sale->payment_method === 'mpesa') {
            $transaction = MpesaTransaction::query()
                ->where('tenant_id', $sale->tenant_id)
                ->whereHas('payment', fn ($query) => $query->where('sale_id', $sale->id))
                ->where('status', 'pending')
                ->first();

            if ($transaction && $transaction->branch) {
                try {
                    $branch = $transaction->branch;
                    $status = $this->daraja->queryStkPush((string) $transaction->checkout_request_id, $branch);
                    $resultCode = (string) ($status['ResultCode'] ?? '');

                    if ($resultCode === '0') {
                        $callback = $transaction->raw_callback ?? [];
                        $callbackData = collect(data_get($callback, 'Body.stkCallback.CallbackMetadata.Item', []))->keyBy('Name');
                        $receipt = $callbackData->get('MpesaReceiptNumber')['Value'] ?? null;

                        $this->sales->complete($sale->id, $sale->tenant_id, $sale->branch_id, $receipt);
                        $transaction->update([
                            'status' => 'paid',
                            'result_code' => 0,
                            'result_desc' => $status['ResultDesc'] ?? 'Daraja confirmed payment.',
                            'mpesa_receipt_no' => $receipt,
                        ]);
                    } elseif ($resultCode !== '' && $transaction->raw_callback) {
                        $callbackCode = (string) data_get($transaction->raw_callback, 'Body.stkCallback.ResultCode', '');
                        if ($callbackCode !== '' && $callbackCode === $resultCode) {
                            $this->failMpesa($transaction, (int) $resultCode, $status['ResultDesc'] ?? 'M-Pesa payment failed.', $transaction->raw_callback);
                        }
                    }
                } catch (RuntimeException) {
                    // Keep the checkout pending; a temporary Daraja outage must not mark a paid prompt as failed.
                }
            }
        }

        $tenant = Tenant::query()->whereKey($sale->tenant_id)->firstOrFail();
        $sale->load(['items.drug', 'items.batch', 'payments']);
        $sale->setAttribute('pharmacy', [
            'name' => $tenant->name,
            'phone' => $tenant->phone,
            'address' => $tenant->address,
            'kra_pin' => $tenant->kra_pin,
            'receipt_header' => $tenant->receipt_header,
            'receipt_footer' => $tenant->receipt_footer,
            'logo_url' => $tenant->logo_path ? \Illuminate\Support\Facades\Storage::disk('public')->url($tenant->logo_path) : null,
        ]);

        return response()->json($sale);
    }

    public function callback(Request $request): JsonResponse
    {
        $callback = $request->input('Body.stkCallback', []);
        $checkoutId = $callback['CheckoutRequestID'] ?? null;
        if (! $checkoutId) {
            return response()->json(['ResultCode' => 1, 'ResultDesc' => 'Checkout request ID is missing.']);
        }

        $transaction = MpesaTransaction::query()->where('checkout_request_id', $checkoutId)->first();
        if (! $transaction) {
            return response()->json(['ResultCode' => 0, 'ResultDesc' => 'Callback received.']);
        }

        if ($transaction->status !== 'pending') {
            return response()->json(['ResultCode' => 0, 'ResultDesc' => 'Callback already processed.']);
        }

        $resultCode = (int) ($callback['ResultCode'] ?? 1);
        $description = (string) ($callback['ResultDesc'] ?? 'M-Pesa payment failed.');
        $metadata = collect($callback['CallbackMetadata']['Item'] ?? [])->keyBy('Name');

        try {
            $branch = $transaction->branch;
            if (! $branch) {
                $transaction->update([
                    'result_code' => $resultCode,
                    'result_desc' => 'Branch merchant configuration is missing; reconciliation is required.',
                    'raw_callback' => $request->all(),
                ]);

                return response()->json(['ResultCode' => 0, 'ResultDesc' => 'Callback stored for reconciliation.']);
            }
            $verified = $this->daraja->queryStkPush($transaction->checkout_request_id, $branch);
            $verifiedCode = (string) ($verified['ResultCode'] ?? '');

            if ($resultCode !== 0) {
                if ($verifiedCode !== '' && $verifiedCode === (string) $resultCode) {
                    $this->failMpesa($transaction, $resultCode, $description, $request->all());
                    return response()->json(['ResultCode' => 0, 'ResultDesc' => 'Payment failure verified and recorded.']);
                }

                $transaction->update(['result_code' => $resultCode, 'result_desc' => $description, 'raw_callback' => $request->all()]);
                return response()->json(['ResultCode' => 0, 'ResultDesc' => 'Payment status is being verified.']);
            }

            if ($verifiedCode !== '0') {
                $transaction->update(['result_code' => $resultCode, 'result_desc' => $description, 'raw_callback' => $request->all()]);

                return response()->json(['ResultCode' => 0, 'ResultDesc' => 'Payment status is pending verification.']);
            }
        } catch (RuntimeException $exception) {
            $transaction->update([
                'result_code' => $resultCode,
                'result_desc' => 'Payment received; Daraja verification is pending: '.$exception->getMessage(),
                'raw_callback' => $request->all(),
            ]);

            return response()->json(['ResultCode' => 0, 'ResultDesc' => 'Callback saved for verification.']);
        }

        $receipt = (string) ($metadata->get('MpesaReceiptNumber')['Value'] ?? '');
        $amount = (float) ($metadata->get('Amount')['Value'] ?? 0);
        $phone = (string) ($metadata->get('PhoneNumber')['Value'] ?? '');
        if ($receipt === '' || $amount !== (float) $transaction->amount || $phone !== $transaction->phone) {
            $transaction->update([
                'result_code' => $resultCode,
                'result_desc' => 'Daraja confirmed payment, but callback fields are incomplete or mismatched; reconciliation is required.',
                'raw_callback' => $request->all(),
            ]);

            return response()->json(['ResultCode' => 0, 'ResultDesc' => 'Payment confirmed by Daraja; callback details require reconciliation.']);
        }

        DB::transaction(function () use ($transaction, $resultCode, $description, $request, $receipt) {
            $locked = MpesaTransaction::query()->whereKey($transaction->id)->lockForUpdate()->firstOrFail();
            if ($locked->status !== 'pending') {
                return;
            }

            $sale = $locked->payment->sale;
            app(SalesService::class)->complete(
                $sale->id,
                $sale->tenant_id,
                $sale->branch_id,
                $receipt,
            );
            $locked->update([
                'status' => 'paid',
                'result_code' => $resultCode,
                'result_desc' => $description,
                'mpesa_receipt_no' => $receipt,
                'raw_callback' => $request->all(),
            ]);
        });

        return response()->json(['ResultCode' => 0, 'ResultDesc' => 'Payment confirmed.']);
    }

    protected function branchId(Request $request): ?string
    {
        return $request->user()->branch_id ?: Branch::query()
            ->where('tenant_id', $request->user()->tenant_id)
            ->value('id');
    }

    protected function authorizeSale(Request $request, Sale $sale): void
    {
        if ($sale->tenant_id !== $request->user()->tenant_id || $sale->branch_id !== $this->branchId($request)) {
            abort(404);
        }
    }

    protected function failMpesa(MpesaTransaction $transaction, int $code, string $description, array $callback): void
    {
        DB::transaction(function () use ($transaction, $code, $description, $callback) {
            $transaction->update([
                'status' => 'failed',
                'result_code' => $code,
                'result_desc' => $description,
                'raw_callback' => $callback,
            ]);
            $transaction->payment()->update(['status' => 'failed', 'reference' => $description]);
            $sale = $transaction->payment->sale;
            app(SalesService::class)->failPending($sale->id, $sale->tenant_id, $sale->branch_id, $description);
        });
    }
}
