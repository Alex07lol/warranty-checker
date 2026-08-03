import "package:flutter/material.dart";
import "package:provider/provider.dart";
import "../../../core/routes/app_router.dart";
import "../providers/auth_provider.dart";

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final formKey = GlobalKey<FormState>();
  final email = TextEditingController();
  final password = TextEditingController();

  @override
  void dispose() {
    email.dispose();
    password.dispose();
    super.dispose();
  }

  Future<void> submit() async {
    if (!formKey.currentState!.validate()) return;

    final provider = context.read<AuthProvider>();
    await provider.login(email.text.trim(), password.text);

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
      appBar: AppBar(title: const Text("Login")),
      body: Form(
        key: formKey,
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
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
            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: loading ? null : submit,
              child: loading ? const CircularProgressIndicator() : const Text("Login"),
            ),
          ],
        ),
      ),
    );
  }
}
