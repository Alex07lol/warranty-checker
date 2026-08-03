import "package:flutter/material.dart";
import "package:provider/provider.dart";
import "../../../core/routes/app_router.dart";
import "../providers/auth_provider.dart";

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final formKey = GlobalKey<FormState>();
  final name = TextEditingController();
  final email = TextEditingController();
  final password = TextEditingController();
  final confirmPassword = TextEditingController();

  @override
  void dispose() {
    name.dispose();
    email.dispose();
    password.dispose();
    confirmPassword.dispose();
    super.dispose();
  }

  Future<void> submit() async {
    if (!formKey.currentState!.validate()) return;

    final provider = context.read<AuthProvider>();
    await provider.register(
      name.text.trim(),
      email.text.trim(),
      password.text,
      confirmPassword.text,
    );

    if (!mounted) return;

    if (provider.isAuthenticated) {
      Navigator.pushNamedAndRemoveUntil(context, AppRouter.dashboard, (_) => false);
    } else if (provider.error != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(provider.error!)),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final loading = context.watch<AuthProvider>().isLoading;

    return Scaffold(
      appBar: AppBar(title: const Text("Create account")),
      body: Form(
        key: formKey,
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            TextFormField(
              controller: name,
              decoration: const InputDecoration(labelText: "Name"),
              validator: (value) => value != null && value.trim().length >= 2 ? null : "Minimum 2 characters",
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: email,
              keyboardType: TextInputType.emailAddress,
              decoration: const InputDecoration(labelText: "Email"),
              validator: (value) => value != null && value.contains("@") ? null : "Enter a valid email",
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: password,
              obscureText: true,
              decoration: const InputDecoration(labelText: "Password"),
              validator: (value) => value != null && value.length >= 8 ? null : "Minimum 8 characters",
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: confirmPassword,
              obscureText: true,
              decoration: const InputDecoration(labelText: "Confirm password"),
              validator: (value) => value == password.text ? null : "Passwords do not match",
            ),
            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: loading ? null : submit,
              child: loading ? const CircularProgressIndicator() : const Text("Register"),
            ),
          ],
        ),
      ),
    );
  }
}
