class ProductModel {
  final String id;
  final String productName;
  final String? brand;
  final String? model;
  final String? category;
  final DateTime? purchaseDate;
  final double? purchasePrice;
  final String? currency;
  final String? purchaseStore;
  final String? serialNumber;
  final DateTime? warrantyExpiryDate;
  final int? warrantyPeriodMonths;
  final String? notes;
  final DateTime? createdAt;
  final DateTime? updatedAt;
  final bool isDeleted;
  final String? thumbnailUrl;

  ProductModel({
    required this.id,
    required this.productName,
    this.brand,
    this.model,
    this.category,
    this.purchaseDate,
    this.purchasePrice,
    this.currency,
    this.purchaseStore,
    this.serialNumber,
    this.warrantyExpiryDate,
    this.warrantyPeriodMonths,
    this.notes,
    this.createdAt,
    this.updatedAt,
    this.isDeleted = false,
    this.thumbnailUrl,
  });

  factory ProductModel.fromJson(Map<String, dynamic> json) {
    return ProductModel(
      id: (json["_id"] ?? json["id"]).toString(),
      productName: json["productName"] as String? ?? "",
      brand: json["brand"] as String?,
      model: json["model"] as String?,
      category: json["category"] as String?,
      purchaseDate: _date(json["purchaseDate"]),
      purchasePrice: json["purchasePrice"] == null ? null : (json["purchasePrice"] as num).toDouble(),
      currency: json["currency"] as String?,
      purchaseStore: json["purchaseStore"] as String?,
      serialNumber: json["serialNumber"] as String?,
      warrantyExpiryDate: _date(json["warrantyExpiryDate"]),
      warrantyPeriodMonths: json["warrantyPeriodMonths"] as int?,
      notes: json["notes"] as String?,
      createdAt: _date(json["createdAt"]),
      updatedAt: _date(json["updatedAt"]),
      isDeleted: json["isDeleted"] as bool? ?? false,
      thumbnailUrl: json["thumbnailUrl"] as String?,
    );
  }

  static DateTime? _date(dynamic value) {
    if (value == null) return null;
    return DateTime.tryParse(value.toString());
  }

  Map<String, dynamic> toJson() {
    return {
      "productName": productName,
      "brand": brand,
      "model": model,
      "category": category,
      "purchaseDate": purchaseDate?.toIso8601String(),
      "purchasePrice": purchasePrice,
      "currency": currency,
      "purchaseStore": purchaseStore,
      "serialNumber": serialNumber,
      "warrantyExpiryDate": warrantyExpiryDate?.toIso8601String(),
      "warrantyPeriodMonths": warrantyPeriodMonths,
      "notes": notes,
      "thumbnailUrl": thumbnailUrl,
    };
  }
}
