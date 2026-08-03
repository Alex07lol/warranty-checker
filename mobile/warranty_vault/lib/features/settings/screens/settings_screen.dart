import "package:flutter/material.dart";
import "package:provider/provider.dart";
import "../../../core/routes/app_router.dart";
import "../../auth/providers/auth_provider.dart";

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final user = auth.currentUser;

    return Scaffold(
      appBar: AppBar(title: const Text("Settings")),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          ListTile(
            leading: const CircleAvatar(child: Icon(Icons.person)),
            title: Text(user?.name ?? ""),
            subtitle: Text(user?.email ?? ""),
          ),
          const Divider(),
          SwitchListTile(
            value: user?.notificationPreferences["expiryAlerts"] as bool? ?? true,
            onChanged: null,
            title: const Text("Expiry alerts"),
          ),
          const SizedBox(height: 24),
          FilledButton.tonal(
            onPressed: () async {
              await context.read<AuthProvider>().logout();
              if (!context.mounted) return;
              Navigator.pushNamedAndRemoveUntil(context, AppRouter.welcome, (_) => false);
            },
            child: const Text("Logout"),
          ),
        ],
      ),
    );
  }
}
