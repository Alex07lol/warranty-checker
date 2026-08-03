import "package:flutter/material.dart";
import "package:provider/provider.dart";
import "../providers/notification_provider.dart";

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() => context.read<NotificationProvider>().fetch());
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<NotificationProvider>();

    return Scaffold(
      appBar: AppBar(
        title: const Text("Notifications"),
        actions: [
          TextButton(
            onPressed: provider.notifications.isEmpty ? null : provider.markAllRead,
            child: const Text("Read all"),
          ),
        ],
      ),
      body: provider.isLoading && provider.notifications.isEmpty
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: provider.fetch,
              child: ListView.builder(
                itemCount: provider.notifications.length,
                itemBuilder: (_, index) {
                  final notification = provider.notifications[index];
                  return Dismissible(
                    key: ValueKey(notification.id),
                    onDismissed: (_) => provider.delete(notification.id),
                    child: ListTile(
                      tileColor: notification.isRead
                          ? null
                          : Theme.of(context).colorScheme.secondaryContainer,
                      title: Text(
                        notification.title,
                        style: TextStyle(
                          fontWeight: notification.isRead ? FontWeight.normal : FontWeight.bold,
                        ),
                      ),
                      subtitle: Text(notification.message),
                      onTap: () => provider.markRead(notification.id),
                    ),
                  );
                },
              ),
            ),
    );
  }
}
