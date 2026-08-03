import "../../../shared/services/api_service.dart";
import "../../../core/constants/api_constants.dart";
import "../models/user_model.dart";

class AuthService {
  final ApiService api;

  AuthService(this.api);

  Future<Map<String, dynamic>> register(
    String name,
    String email,
    String password,
    String confirmPassword,
  ) async {
    final response = await api.post(
      ApiConstants.authRegister,
      data: {
        "name": name,
        "email": email,
        "password": password,
        "confirmPassword": confirmPassword,
      },
    );
    return Map<String, dynamic>.from(response.data["data"]);
  }

  Future<Map<String, dynamic>> login(String email, String password) async {
    final response = await api.post(
      ApiConstants.authLogin,
      data: {"email": email, "password": password},
    );
    return Map<String, dynamic>.from(response.data["data"]);
  }

  Future<void> logout() async {
    await api.post(ApiConstants.authLogout);
  }

  Future<UserModel> getCurrentUser() async {
    final response = await api.get(ApiConstants.authMe);
    return UserModel.fromJson(Map<String, dynamic>.from(response.data["data"]));
  }

  Future<void> changePassword(
    String currentPassword,
    String newPassword,
    String confirmNewPassword,
  ) async {
    await api.put(
      ApiConstants.authChangePassword,
      data: {
        "currentPassword": currentPassword,
        "newPassword": newPassword,
        "confirmNewPassword": confirmNewPassword,
      },
    );
  }
}
