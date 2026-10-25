<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tenants', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name');
            $table->string('slug')->unique();
            $table->string('kra_pin')->nullable();
            $table->string('ppb_licence_no')->nullable();
            $table->string('email')->nullable();
            $table->string('phone')->nullable();
            $table->string('plan')->default('trial');
            $table->timestamp('trial_ends_at')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamp('created_at')->useCurrent();
        });

        Schema::create('branches', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('tenant_id');
            $table->string('name');
            $table->string('address')->nullable();
            $table->string('phone')->nullable();
            $table->string('mpesa_till')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamp('created_at')->useCurrent();
            $table->unique(['tenant_id', 'name']);
        });

        Schema::create('users', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('tenant_id');
            $table->uuid('branch_id')->nullable();
            $table->string('full_name');
            $table->string('email');
            $table->string('phone')->nullable();
            $table->string('password_hash');
            $table->string('role')->default('cashier');
            $table->string('pharmacist_reg_no')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamp('last_login_at')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->unique(['tenant_id', 'email']);
        });

        Schema::create('categories', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('tenant_id');
            $table->string('name');
            $table->unique(['tenant_id', 'name']);
        });

        Schema::create('drugs', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('tenant_id');
            $table->uuid('category_id')->nullable();
            $table->string('brand_name');
            $table->string('generic_name')->nullable();
            $table->string('strength')->nullable();
            $table->string('dosage_form')->nullable();
            $table->string('pack_size')->nullable();
            $table->string('manufacturer')->nullable();
            $table->string('barcode')->nullable();
            $table->string('sku')->nullable();
            $table->string('schedule')->default('otc');
            $table->boolean('requires_rx')->default(false);
            $table->text('dosage_notes')->nullable();
            $table->decimal('selling_price', 12, 2)->default(0);
            $table->decimal('vat_rate', 5, 2)->default(0);
            $table->integer('reorder_level')->default(10);
            $table->boolean('is_active')->default(true);
            $table->timestamp('created_at')->useCurrent();
            $table->unique(['tenant_id', 'barcode']);
        });

        Schema::create('suppliers', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('tenant_id');
            $table->string('name');
            $table->string('contact_person')->nullable();
            $table->string('phone')->nullable();
            $table->string('email')->nullable();
            $table->string('address')->nullable();
            $table->string('kra_pin')->nullable();
            $table->integer('payment_terms_days')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamp('created_at')->useCurrent();
            $table->unique(['tenant_id', 'name']);
        });

        Schema::create('batches', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('tenant_id');
            $table->uuid('branch_id');
            $table->uuid('drug_id');
            $table->uuid('supplier_id')->nullable();
            $table->string('batch_no');
            $table->date('expiry_date');
            $table->decimal('cost_price', 12, 2);
            $table->integer('quantity')->default(0);
            $table->timestamp('received_at')->useCurrent();
            $table->unique(['branch_id', 'drug_id', 'batch_no']);
        });

        Schema::create('stock_movements', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('tenant_id');
            $table->uuid('branch_id');
            $table->uuid('batch_id');
            $table->uuid('drug_id');
            $table->string('move_type');
            $table->integer('quantity');
            $table->string('reference_type')->nullable();
            $table->uuid('reference_id')->nullable();
            $table->text('reason')->nullable();
            $table->uuid('user_id')->nullable();
            $table->timestamp('created_at')->useCurrent();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_movements');
        Schema::dropIfExists('batches');
        Schema::dropIfExists('suppliers');
        Schema::dropIfExists('drugs');
        Schema::dropIfExists('categories');
        Schema::dropIfExists('users');
        Schema::dropIfExists('branches');
        Schema::dropIfExists('tenants');
    }
};
