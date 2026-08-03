import "package:flutter/material.dart";
import "package:provider/provider.dart";
import "../providers/dashboard_provider.dart";
import "../../auth/providers/auth_provider.dart";
import "../../products/widgets/product_card.dart";
import "../../products/screens/product_list_screen.dart";
import "../../notifications/screens/notifications_screen.dart";
import "../../settings/screens/settings_screen.dart";

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() => context.read<DashboardProvider>().fetch());
  }

  @override
  Widget build(BuildContext context) {
    final dashboard = context.watch<DashboardProvider>();
    final user = context.watch<AuthProvider>().currentUser;

    return Scaffold(
      appBar: AppBar(
        title: const Text("Dashboard"),
        actions: [
          IconButton(
            tooltip: "Notifications",
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const NotificationsScreen()),
            ),
            icon: const Icon(Icons.notifications_outlined),
          ),
          IconButton(
            tooltip: "Settings",
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const SettingsScreen()),
            ),
            icon: const Icon(Icons.settings_outlined),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: dashboard.fetch,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(
              "Hello, ${user?.name ?? "there"}",
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 16),
            if (dashboard.isLoading && dashboard.dashboard == null)
              const Center(child: CircularProgressIndicator())
            else if (dashboard.dashboard != null) ...[
              Row(
                children: [
                  Expanded(child: _stat("Products", dashboard.dashboard!.totalProducts)),
                  const SizedBox(width: 12),
                  Expanded(child: _stat("Expiring", dashboard.dashboard!.expiringSoonCount)),
                ],
              ),
              const SizedBox(height: 24),
              Text("Expiring Soon", style: Theme.of(context).textTheme.titleLarge),
              ...dashboard.dashboard!.expiringSoon.map((p) => ProductCard(product: p)),
              const SizedBox(height: 16),
              Text("Recently Added", style: Theme.of(context).textTheme.titleLarge),
              ...dashboard.dashboard!.recentProducts.map((p) => ProductCard(product: p)),
            ],
          ],
        ),
      ),
    );
  }

  Widget _stat(String title, int value) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          children: [
            Text("$value", style: const TextStyle(fontSize: 28, fontWeight: FontWeight.bold)),
            Text(title),
          ],
        ),
      ),
    );
  }
}
