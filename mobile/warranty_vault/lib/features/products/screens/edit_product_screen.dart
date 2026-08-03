import "package:flutter/material.dart";
import "package:provider/provider.dart";
import "../models/product_model.dart";
import "../providers/product_provider.dart";

class EditProductScreen extends StatefulWidget {
  final ProductModel product;

  const EditProductScreen({super.key, required this.product});

  @override
  State<EditProductScreen> createState() => _EditProductScreenState();
}

class _EditProductScreenState extends State<EditProductScreen> {
  late final TextEditingController name;
  late final TextEditingController brand;
  late final TextEditingController model;
  late final TextEditingController category;
  late final TextEditingController notes;

  @override
  void initState() {
    super.initState();
    name = TextEditingController(text: widget.product.productName);
    brand = TextEditingController(text: widget.product.brand ?? "");
    model = TextEditingController(text: widget.product.model ?? "");
    category = TextEditingController(text: widget.product.category ?? "");
    notes = TextEditingController(text: widget.product.notes ?? "");
  }

  @override
  void dispose() {
    name.dispose();
    brand.dispose();
    model.dispose();
    category.dispose();
    notes.dispose();
    super.dispose();
  }

  Future<void> save() async {
    final provider = context.read<ProductProvider>();
    await provider.updateProduct(widget.product.id, {
      "productName": name.text.trim(),
      "brand": brand.text.trim(),
      "model": model.text.trim(),
      "category": category.text.trim(),
      "notes": notes.text.trim(),
    });

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
    return Scaffold(
      appBar: AppBar(title: const Text("Edit Product")),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          TextField(controller: name, decoration: const InputDecoration(labelText: "Product name")),
          const SizedBox(height: 12),
          TextField(controller: brand, decoration: const InputDecoration(labelText: "Brand")),
          const SizedBox(height: 12),
          TextField(controller: model, decoration: const InputDecoration(labelText: "Model")),
          const SizedBox(height: 12),
          TextField(controller: category, decoration: const InputDecoration(labelText: "Category")),
          const SizedBox(height: 12),
          TextField(controller: notes, maxLines: 4, decoration: const InputDecoration(labelText: "Notes")),
          const SizedBox(height: 20),
          ElevatedButton(onPressed: save, child: const Text("Save changes")),
        ],
      ),
    );
  }
}
