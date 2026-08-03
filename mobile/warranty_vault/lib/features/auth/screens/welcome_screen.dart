import "package:flutter/material.dart";
import "../../../core/routes/app_router.dart";

class WelcomeScreen extends StatelessWidget {
  const WelcomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.inventory_2_outlined, size: 96),
              const SizedBox(height: 24),
              Text(
                "WarrantyVault",
                style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 12),
              const Text("Keep your products, warranties, receipts and service history together."),
              const SizedBox(height: 32),
              ElevatedButton(
                onPressed: () => Navigator.pushNamed(context, AppRouter.register),
                child: const Text("Create account"),
              ),
              const SizedBox(height: 12),
              OutlinedButton(
                onPressed: () => Navigator.pushNamed(context, AppRouter.login),
                child: const Text("Login"),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
