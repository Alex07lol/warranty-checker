import "package:flutter/material.dart";
import "package:provider/provider.dart";
import "../providers/service_history_provider.dart";

class ServiceHistoryScreen extends StatefulWidget {
  final String productId;

  const ServiceHistoryScreen({super.key, required this.productId});

  @override
  State<ServiceHistoryScreen> createState() => _ServiceHistoryScreenState();
}

class _ServiceHistoryScreenState extends State<ServiceHistoryScreen> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() => context.read<ServiceHistoryProvider>().fetch(widget.productId));
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<ServiceHistoryProvider>();

    return Scaffold(
      appBar: AppBar(title: const Text("Service History")),
      body: provider.isLoading && provider.records.isEmpty
          ? const Center(child: CircularProgressIndicator())
          : ListView.builder(
              padding: const EdgeInsets.all(12),
              itemCount: provider.records.length,
              itemBuilder: (_, index) {
                final record = provider.records[index];
                return Card(
                  child: ListTile(
                    title: Text(record.serviceType),
                    subtitle: Text(
                      "${record.serviceDate.toLocal().toString().split(" ").first}\n${record.serviceProvider ?? ""}\n${record.description ?? ""}",
                    ),
                    isThreeLine: true,
                  ),
                );
              },
            ),
    );
  }
}
