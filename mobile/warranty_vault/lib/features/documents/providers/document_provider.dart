import "dart:io";
import "package:flutter/foundation.dart";
import "../models/document_model.dart";
import "../services/document_service.dart";

class DocumentProvider extends ChangeNotifier {
  final DocumentService service;
  List<DocumentModel> documents = [];
  bool isLoading = false;
  String? error;

  DocumentProvider(this.service);

  Future<void> fetch(String productId) async {
    isLoading = true;
    error = null;
    notifyListeners();

    try {
      final data = await service.getDocuments(productId);
      documents = data.map(DocumentModel.fromJson).toList();
    } catch (e) {
      error = e.toString();
    } finally {
      isLoading = false;
      notifyListeners();
    }
  }

  Future<void> upload(
    String productId,
    File file,
    String documentType,
    String? notes,
  ) async {
    isLoading = true;
    error = null;
    notifyListeners();

    try {
      await service.uploadDocument(productId, file, documentType, notes);
      await fetch(productId);
    } catch (e) {
      error = e.toString();
      isLoading = false;
      notifyListeners();
    }
  }

  Future<void> delete(String productId, String documentId) async {
    try {
      await service.deleteDocument(productId, documentId);
      await fetch(productId);
    } catch (e) {
      error = e.toString();
      notifyListeners();
    }
  }
}
