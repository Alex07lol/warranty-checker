import "../../products/models/product_model.dart";

class DashboardModel {
  final int totalProducts;
  final int expiringSoonCount;
  final int totalDocuments;
  final int unreadNotificationsCount;
  final List<ProductModel> recentProducts;
  final List<ProductModel> expiringSoon;

  DashboardModel({
    required this.totalProducts,
    required this.expiringSoonCount,
    required this.totalDocuments,
    required this.unreadNotificationsCount,
    required this.recentProducts,
    required this.expiringSoon,
  });

  factory DashboardModel.fromJson(Map<String, dynamic> json) {
    List<ProductModel> parse(dynamic value) {
      return List<Map<String, dynamic>>.from(
        value.map((item) => Map<String, dynamic>.from(item)),
      ).map(ProductModel.fromJson).toList();
    }

    return DashboardModel(
      totalProducts: json["totalProducts"] as int? ?? 0,
      expiringSoonCount: json["expiringSoonCount"] as int? ?? 0,
      totalDocuments: json["totalDocuments"] as int? ?? 0,
      unreadNotificationsCount: json["unreadNotificationsCount"] as int? ?? 0,
      recentProducts: parse(json["recentProducts"] ?? []),
      expiringSoon: parse(json["expiringSoon"] ?? []),
    );
  }
}
