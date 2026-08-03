class DocumentModel {
  final String id;
  final String productId;
  final String documentType;
  final String fileName;
  final String fileUrl;
  final int fileSize;
  final String mimeType;
  final DateTime? uploadedAt;
  final String? notes;

  DocumentModel({
    required this.id,
    required this.productId,
    required this.documentType,
    required this.fileName,
    required this.fileUrl,
    required this.fileSize,
    required this.mimeType,
    this.uploadedAt,
    this.notes,
  });

  factory DocumentModel.fromJson(Map<String, dynamic> json) {
    return DocumentModel(
      id: (json["_id"] ?? json["id"]).toString(),
      productId: json["productId"].toString(),
      documentType: json["documentType"] as String? ?? "other",
      fileName: json["fileName"] as String? ?? "",
      fileUrl: json["fileUrl"] as String? ?? "",
      fileSize: json["fileSize"] as int? ?? 0,
      mimeType: json["mimeType"] as String? ?? "",
      uploadedAt: json["uploadedAt"] == null ? null : DateTime.tryParse(json["uploadedAt"].toString()),
      notes: json["notes"] as String?,
    );
  }
}
