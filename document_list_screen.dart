import "package:flutter/material.dart";
import "../../features/auth/screens/splash_screen.dart";
import "../../features/auth/screens/welcome_screen.dart";
import "../../features/auth/screens/login_screen.dart";
import "../../features/auth/screens/register_screen.dart";
import "../../features/dashboard/screens/dashboard_screen.dart";
import "../../features/products/screens/product_list_screen.dart";

class AppRouter {
  static const String splash = "/splash";
  static const String welcome = "/welcome";
  static const String login = "/login";
  static const String register = "/register";
  static const String dashboard = "/dashboard";
  static const String products = "/products";

  static Map<String, WidgetBuilder> get routes => {
    splash: (_) => const SplashScreen(),
    welcome: (_) => const WelcomeScreen(),
    login: (_) => const LoginScreen(),
    register: (_) => const RegisterScreen(),
    dashboard: (_) => const DashboardScreen(),
    products: (_) => const ProductListScreen(),
  };
}
