class ApiConstants {
  static const String baseUrl = String.fromEnvironment(
    "API_BASE_URL",
    defaultValue: "http://10.0.2.2:5000/api/v1",
  );

  static const String authRegister = "/auth/register";
  static const String authLogin = "/auth/login";
  static const String authLogout = "/auth/logout";
  static const String authMe = "/auth/me";
  static const String authChangePassword = "/auth/change-password";
  static const String products = "/products";
  static const String productSearch = "/products/search";
  static const String productExpiring = "/products/expiring-soon";
  static const String dashboard = "/dashboard";
  static const String notifications = "/notifications";
  static const String notificationsReadAll = "/notifications/read-all";
  static const String documents = "/products/{productId}/documents";
  static const String serviceHistory = "/products/{productId}/service-history";
}
