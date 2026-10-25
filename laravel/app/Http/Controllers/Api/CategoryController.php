<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Category;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CategoryController extends Controller
{
    public function index(Request $request)
    {
        $query = Category::query()->where('tenant_id', $request->user()->tenant_id)->orderBy('name');

        return $query->get();
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => 'required|string|max:150',
        ]);

        $category = Category::create([
            'tenant_id' => $request->user()->tenant_id,
            'name' => trim($data['name']),
        ]);

        return response()->json($category, 201);
    }

    public function update(Request $request, Category $category): JsonResponse
    {
        $this->authorizeTenant($request, $category);

        $data = $request->validate([
            'name' => 'required|string|max:150',
        ]);

        $category->update(['name' => trim($data['name'])]);

        return response()->json($category->fresh());
    }

    public function destroy(Request $request, Category $category): JsonResponse
    {
        $this->authorizeTenant($request, $category);
        $category->delete();

        return response()->json(['message' => 'Category deleted.']);
    }

    protected function authorizeTenant(Request $request, Category $category): void
    {
        if ($category->tenant_id !== $request->user()->tenant_id) {
            abort(403);
        }
    }
}
