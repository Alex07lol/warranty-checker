import "package:flutter/foundation.dart";
import "../models/product_model.dart";
import "../services/product_service.dart";

class ProductProvider extends ChangeNotifier {
  final ProductService service;

  List<ProductModel> products = [];
  bool isLoading = false;
  String? error;

  ProductProvider(this.service);

  Future<void> fetchProducts() async {
    await _run(() async {
      products = await service.getProducts();
    });
  }

  Future<ProductModel?> fetchProductById(String id) async {
    ProductModel? result;
    await _run(() async {
      result = await service.getProductById(id);
    });
    return result;
  }

  Future<void> addProduct(Map<String, dynamic> data) async {
    await _run(() async {
      await service.createProduct(data);
      products = await service.getProducts();
    });
  }

  Future<void> updateProduct(String id, Map<String, dynamic> data) async {
    await _run(() async {
      await service.updateProduct(id, data);
      products = await service.getProducts();
    });
  }

  Future<void> deleteProduct(String id) async {
    await _run(() async {
      await service.deleteProduct(id);
      products = await service.getProducts();
    });
  }

  Future<void> searchProducts(String query) async {
    if (query.trim().isEmpty) {
      await fetchProducts();
      return;
    }

    await _run(() async {
      products = await service.searchProducts(query);
    });
  }

  Future<void> _run(Future<void> Function() operation) async {
    isLoading = true;
    error = null;
    notifyListeners();

    try {
      await operation();
    } catch (e) {
      error = e.toString();
    } finally {
      isLoading = false;
      notifyListeners();
    }
  }
}
