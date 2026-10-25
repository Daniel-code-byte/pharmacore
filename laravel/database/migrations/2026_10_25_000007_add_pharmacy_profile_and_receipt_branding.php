<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tenants', function (Blueprint $table) {
            $table->string('address')->nullable();
            $table->string('logo_path')->nullable();
            $table->string('receipt_header')->nullable();
            $table->string('receipt_footer')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('tenants', function (Blueprint $table) {
            $table->dropColumn(['address', 'logo_path', 'receipt_header', 'receipt_footer']);
        });
    }
};
