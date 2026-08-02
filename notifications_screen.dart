import "../../../shared/services/api_service.dart";
import "../models/service_history_model.dart";

class ServiceHistoryService {
  final ApiService api;

  ServiceHistoryService(this.api);

  String path(String productId) => "/products/$productId/service-history";

  Future<List<ServiceHistoryModel>> get(String productId) async {
    final response = await api.get(path(productId));
    return List<Map<String, dynamic>>.from(
      response.data["data"].map((item) => Map<String, dynamic>.from(item)),
    ).map(ServiceHistoryModel.fromJson).toList();
  }

  Future<ServiceHistoryModel> add(String productId, Map<String, dynamic> data) async {
    final response = await api.post(path(productId), data: data);
    return ServiceHistoryModel.fromJson(Map<String, dynamic>.from(response.data["data"]));
  }

  Future<void> delete(String productId, String id) async {
    await api.delete("${path(productId)}/$id");
  }
}
