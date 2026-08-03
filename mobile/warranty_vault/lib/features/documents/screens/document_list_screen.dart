import "package:flutter/material.dart";
import "package:provider/provider.dart";
import "../providers/document_provider.dart";
import "../widgets/document_card.dart";

class DocumentListScreen extends StatefulWidget {
  final String productId;

  const DocumentListScreen({super.key, required this.productId});

  @override
  State<DocumentListScreen> createState() => _DocumentListScreenState();
}

class _DocumentListScreenState extends State<DocumentListScreen> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() => context.read<DocumentProvider>().fetch(widget.productId));
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<DocumentProvider>();

    return Scaffold(
      appBar: AppBar(title: const Text("Documents")),
      body: provider.isLoading && provider.documents.isEmpty
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: () => provider.fetch(widget.productId),
              child: ListView(
                padding: const EdgeInsets.all(12),
                children: provider.documents
                    .map(
                      (document) => DocumentCard(
                        document: document,
                        onDelete: () => provider.delete(widget.productId, document.id),
                      ),
                    )
                    .toList(),
              ),
            ),
    );
  }
}
