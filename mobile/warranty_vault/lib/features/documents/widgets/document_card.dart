import "package:flutter/material.dart";
import "../models/document_model.dart";

class DocumentCard extends StatelessWidget {
  final DocumentModel document;
  final VoidCallback? onDelete;

  const DocumentCard({
    super.key,
    required this.document,
    this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
        leading: Icon(document.mimeType == "application/pdf" ? Icons.picture_as_pdf : Icons.image),
        title: Text(document.fileName),
        subtitle: Text(document.documentType),
        trailing: IconButton(
          onPressed: onDelete,
          icon: const Icon(Icons.delete_outline),
        ),
      ),
    );
  }
}
