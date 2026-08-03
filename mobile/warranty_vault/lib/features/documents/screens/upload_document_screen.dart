import "dart:io";
import "package:file_picker/file_picker.dart";
import "package:flutter/material.dart";
import "package:image_picker/image_picker.dart";
import "package:provider/provider.dart";
import "../providers/document_provider.dart";

class UploadDocumentScreen extends StatefulWidget {
  final String productId;

  const UploadDocumentScreen({super.key, required this.productId});

  @override
  State<UploadDocumentScreen> createState() => _UploadDocumentScreenState();
}

class _UploadDocumentScreenState extends State<UploadDocumentScreen> {
  File? file;
  String type = "receipt";
  final notes = TextEditingController();

  @override
  void dispose() {
    notes.dispose();
    super.dispose();
  }

  Future<void> pickImage(ImageSource source) async {
    final result = await ImagePicker().pickImage(source: source);
    if (result == null) return;
    setState(() => file = File(result.path));
  }

  Future<void> pickPdf() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ["pdf"],
    );
    if (result?.files.single.path == null) return;
    setState(() => file = File(result!.files.single.path!));
  }

  Future<void> upload() async {
    if (file == null) return;

    final provider = context.read<DocumentProvider>();
    await provider.upload(widget.productId, file!, type, notes.text.trim());

    if (!mounted) return;
    if (provider.error == null) {
      Navigator.pop(context);
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(provider.error!)),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final loading = context.watch<DocumentProvider>().isLoading;

    return Scaffold(
      appBar: AppBar(title: const Text("Upload Document")),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          DropdownButtonFormField<String>(
            value: type,
            decoration: const InputDecoration(labelText: "Document type"),
            items: const [
              DropdownMenuItem(value: "receipt", child: Text("Receipt")),
              DropdownMenuItem(value: "warranty_card", child: Text("Warranty card")),
              DropdownMenuItem(value: "product_photo", child: Text("Product photo")),
              DropdownMenuItem(value: "manual", child: Text("Manual")),
              DropdownMenuItem(value: "other", child: Text("Other")),
            ],
            onChanged: (value) => setState(() => type = value!),
          ),
          const SizedBox(height: 20),
          Wrap(
            spacing: 8,
            children: [
              FilledButton.tonal(
                onPressed: () => pickImage(ImageSource.camera),
                child: const Text("Camera"),
              ),
              FilledButton.tonal(
                onPressed: () => pickImage(ImageSource.gallery),
                child: const Text("Gallery"),
              ),
              FilledButton.tonal(
                onPressed: pickPdf,
                child: const Text("PDF"),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Text(file == null ? "No file selected" : file!.path.split(Platform.pathSeparator).last),
          const SizedBox(height: 16),
          TextField(
            controller: notes,
            maxLines: 4,
            decoration: const InputDecoration(labelText: "Notes"),
          ),
          const SizedBox(height: 20),
          ElevatedButton(
            onPressed: loading ? null : upload,
            child: loading ? const CircularProgressIndicator() : const Text("Upload"),
          ),
        ],
      ),
    );
  }
}
