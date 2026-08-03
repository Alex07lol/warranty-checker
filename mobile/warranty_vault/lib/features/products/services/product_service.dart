import "../../../shared/services/api_service.dart";
import "../../../core/constants/api_constants.dart";
import "../models/product_model.dart";

class ProductService {
  final ApiService api;

  ProductService(this.api);

  Future<List<ProductModel>> getProducts() async {
    final response = await api.get(ApiConstants.products);
    final items = List<Map<String, dynamic>>.from(
      response.data["data"]["products"].map((item) => Map<String, dynamic>.from(item)),
    );
    return items.map(ProductModel.fromJson).toList();
  }

  Future<ProductModel> getProductById(String id) async {
    final response = await api.get("${ApiConstants.products}/$id");
    return ProductModel.fromJson(Map<String, dynamic>.from(response.data["data"]));
  }

  Future<ProductModel> createProduct(Map<String, dynamic> data) async {
    final response = await api.post(ApiConstants.products, data: data);
    return ProductModel.fromJson(Map<String, dynamic>.from(response.data["data"]));
  }

  Future<ProductModel> updateProduct(String id, Map<String, dynamic> data) async {
    final response = await api.put("${ApiConstants.products}/$id", data: data);
    return ProductModel.fromJson(Map<String, dynamic>.from(response.data["data"]));
  }

  Future<void> deleteProduct(String id) async {
    await api.delete("${ApiConstants.products}/$id");
  }

  Future<List<ProductModel>> searchProducts(String query) async {
    final response = await api.get(ApiConstants.productSearch, query: {"q": query});
    final items = List<Map<String, dynamic>>.from(
      response.data["data"].map((item) => Map<String, dynamic>.from(item)),
    );
    return items.map(ProductModel.fromJson).toList();
  }

  Future<List<ProductModel>> getExpiringSoon() async {
    final response = await api.get(ApiConstants.productExpiring);
    final items = List<Map<String, dynamic>>.from(
      response.data["data"].map((item) => Map<String, dynamic>.from(item)),
    );
    return items.map(ProductModel.fromJson).toList();
  }
}
