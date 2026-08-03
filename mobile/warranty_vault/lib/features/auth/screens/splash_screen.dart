import "dart:async";
import "package:flutter/material.dart";
import "package:provider/provider.dart";
import "../../../core/routes/app_router.dart";
import "../providers/auth_provider.dart";
import "../../../shared/services/storage_service.dart";

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  @override
  void initState() {
    super.initState();
    unawaited(_start());
  }

  Future<void> _start() async {
    await Future<void>.delayed(const Duration(milliseconds: 700));
    final storage = context.read<StorageService>();

    if (!mounted) return;

    if (await storage.hasToken()) {
      await context.read<AuthProvider>().fetchCurrentUser();
      if (!mounted) return;
      if (context.read<AuthProvider>().isAuthenticated) {
        Navigator.pushReplacementNamed(context, AppRouter.dashboard);
        return;
      }
    }

    if (!mounted) return;
    Navigator.pushReplacementNamed(context, AppRouter.welcome);
  }

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.verified_user_outlined, size: 80),
            SizedBox(height: 16),
            Text("WarrantyVault", style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold)),
          ],
        ),
      ),
    );
  }
}
