import "package:flutter/foundation.dart";
import "../models/user_model.dart";
import "../services/auth_service.dart";
import "../../../shared/services/storage_service.dart";

class AuthProvider extends ChangeNotifier {
  final AuthService authService;
  final StorageService storageService;

  UserModel? currentUser;
  bool isLoading = false;
  String? error;
  bool isAuthenticated = false;

  AuthProvider(this.authService, this.storageService);

  Future<void> register(
    String name,
    String email,
    String password,
    String confirmPassword,
  ) async {
    await _run(() async {
      final data = await authService.register(name, email, password, confirmPassword);
      await storageService.saveToken(data["token"].toString());
      currentUser = UserModel.fromJson(Map<String, dynamic>.from(data["user"]));
      isAuthenticated = true;
    });
  }

  Future<void> login(String email, String password) async {
    await _run(() async {
      final data = await authService.login(email, password);
      await storageService.saveToken(data["token"].toString());
      currentUser = UserModel.fromJson(Map<String, dynamic>.from(data["user"]));
      isAuthenticated = true;
    });
  }

  Future<void> fetchCurrentUser() async {
    await _run(() async {
      currentUser = await authService.getCurrentUser();
      isAuthenticated = true;
    });
  }

  Future<void> logout() async {
    try {
      await authService.logout();
    } catch (_) {}
    await storageService.deleteToken();
    currentUser = null;
    isAuthenticated = false;
    error = null;
    notifyListeners();
  }

  Future<void> _run(Future<void> Function() operation) async {
    isLoading = true;
    error = null;
    notifyListeners();

    try {
      await operation();
    } catch (e) {
      error = e.toString();
      isAuthenticated = false;
    } finally {
      isLoading = false;
      notifyListeners();
    }
  }
}
