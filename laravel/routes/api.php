<?php

use App\Http\Controllers\Api\AlertController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BatchController;
use App\Http\Controllers\Api\CategoryController;
use App\Http\Controllers\Api\DrugController;
use App\Http\Controllers\Api\MpesaSettingsController;
use App\Http\Controllers\Api\PharmacySettingsController;
use App\Http\Controllers\Api\SaleController;
use App\Http\Controllers\Api\SalesReportController;
use App\Http\Controllers\Api\SupplierController;
use Illuminate\Support\Facades\Route;

Route::post('/register-pharmacy', [AuthController::class, 'registerPharmacy'])->middleware('throttle:10,1');
Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:10,1');
Route::post('/payments/mpesa/callback', [SaleController::class, 'callback'])->middleware('throttle:120,1');

Route::middleware(['tenant.context', 'auth:sanctum'])->group(function () {
    Route::get('/me', [AuthController::class, 'me']);
    Route::post('/logout', [AuthController::class, 'logout']);

    Route::get('/drugs', [DrugController::class, 'index']);
    Route::get('/drugs/{drug}', [DrugController::class, 'show']);
    Route::get('/drugs/{drug}/substitutes', [DrugController::class, 'substitutes']);
    Route::get('/categories', [CategoryController::class, 'index']);
    Route::get('/suppliers', [SupplierController::class, 'index']);
    Route::get('/batches', [BatchController::class, 'index']);
    Route::get('/alerts/expiry', [AlertController::class, 'expiry']);
    Route::get('/alerts/low-stock', [AlertController::class, 'lowStock']);
    Route::get('/sales', [SaleController::class, 'index']);
    Route::get('/sales/{sale}', [SaleController::class, 'show']);
    Route::get('/pharmacy/branding', [PharmacySettingsController::class, 'branding']);
    Route::get('/reports/sales', [SalesReportController::class, 'sales'])
        ->middleware('role:owner,admin,pharmacist');
    Route::get('/settings/mpesa', [MpesaSettingsController::class, 'show'])
        ->middleware('role:owner,admin');
    Route::get('/settings/pharmacy', [PharmacySettingsController::class, 'show'])
        ->middleware('role:owner,admin');
    Route::put('/settings/pharmacy', [PharmacySettingsController::class, 'update'])
        ->middleware('role:owner,admin');
    Route::post('/settings/pharmacy/logo', [PharmacySettingsController::class, 'uploadLogo'])
        ->middleware('role:owner,admin');
    Route::delete('/settings/pharmacy/logo', [PharmacySettingsController::class, 'deleteLogo'])
        ->middleware('role:owner,admin');
    Route::put('/settings/mpesa', [MpesaSettingsController::class, 'update'])
        ->middleware('role:owner,admin');

    Route::post('/sales', [SaleController::class, 'store'])
        ->middleware('role:owner,admin,pharmacist,cashier');

    Route::middleware('role:owner,admin,pharmacist,stock_clerk')->group(function () {
        Route::post('/drugs', [DrugController::class, 'store']);
        Route::put('/drugs/{drug}', [DrugController::class, 'update']);
        Route::post('/categories', [CategoryController::class, 'store']);
        Route::put('/categories/{category}', [CategoryController::class, 'update']);
        Route::post('/suppliers', [SupplierController::class, 'store']);
        Route::put('/suppliers/{supplier}', [SupplierController::class, 'update']);
        Route::post('/batches', [BatchController::class, 'store']);
    });

    Route::post('/batches/{batch}/adjust', [BatchController::class, 'adjust'])
        ->middleware('role:owner,admin,pharmacist');

    Route::middleware('role:owner,admin')->group(function () {
        Route::delete('/drugs/{drug}', [DrugController::class, 'destroy']);
        Route::delete('/categories/{category}', [CategoryController::class, 'destroy']);
        Route::delete('/suppliers/{supplier}', [SupplierController::class, 'destroy']);
    });
});
