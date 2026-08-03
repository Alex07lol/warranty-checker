import "dart:io";
import "package:dio/dio.dart";
import "../../../shared/services/api_service.dart";

class DocumentService {
  final ApiService api;

  DocumentService(this.api);

  String path(String productId) => "/products/$productId/documents";

  Future<List<Map<String, dynamic>>> getDocuments(String productId) async {
    final response = await api.get(path(productId));
    return List<Map<String, dynamic>>.from(
      response.data["data"]["documents"].map((item) => Map<String, dynamic>.from(item)),
    );
  }

  Future<Map<String, dynamic>> uploadDocument(
    String productId,
    File file,
    String documentType,
    String? notes,
  ) async {
    final form = FormData.fromMap({
      "file": await MultipartFile.fromFile(file.path),
      "documentType": documentType,
      "notes": notes,
    });

    final response = await api.dio.post(path(productId), data: form);
    return Map<String, dynamic>.from(response.data["data"]);
  }

  Future<void> deleteDocument(String productId, String documentId) async {
    await api.delete("${path(productId)}/$documentId");
  }
}
