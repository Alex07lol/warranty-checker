class ServiceHistoryModel {
  final String id;
  final DateTime serviceDate;
  final String serviceType;
  final String? serviceProvider;
  final double? cost;
  final String? currency;
  final String? description;
  final DateTime? nextServiceDate;

  ServiceHistoryModel({
    required this.id,
    required this.serviceDate,
    required this.serviceType,
    this.serviceProvider,
    this.cost,
    this.currency,
    this.description,
    this.nextServiceDate,
  });

  factory ServiceHistoryModel.fromJson(Map<String, dynamic> json) {
    return ServiceHistoryModel(
      id: (json["_id"] ?? json["id"]).toString(),
      serviceDate: DateTime.parse(json["serviceDate"].toString()),
      serviceType: json["serviceType"].toString(),
      serviceProvider: json["serviceProvider"] as String?,
      cost: json["cost"] == null ? null : (json["cost"] as num).toDouble(),
      currency: json["currency"] as String?,
      description: json["description"] as String?,
      nextServiceDate: json["nextServiceDate"] == null
          ? null
          : DateTime.tryParse(json["nextServiceDate"].toString()),
    );
  }
}
