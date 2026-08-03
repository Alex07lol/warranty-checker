import "package:flutter/material.dart";
import "package:provider/provider.dart";
import "../providers/product_provider.dart";

class AddProductScreen extends StatefulWidget {
  const AddProductScreen({super.key});

  @override
  State<AddProductScreen> createState() => _AddProductScreenState();
}

class _AddProductScreenState extends State<AddProductScreen> {
  final formKey = GlobalKey<FormState>();
  final name = TextEditingController();
  final brand = TextEditingController();
  final model = TextEditingController();
  final category = TextEditingController();
  final price = TextEditingController();
  final currency = TextEditingController(text: "INR");
  final store = TextEditingController();
  final serial = TextEditingController();
  final warrantyMonths = TextEditingController();
  final notes = TextEditingController();
  DateTime? purchaseDate;
  DateTime? expiryDate;

  @override
  void dispose() {
    for (final controller in [
      name,
      brand,
      model,
      category,
      price,
      currency,
      store,
      serial,
      warrantyMonths,
      notes
    ]) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> pickDate(bool purchase) async {
    final value = await showDatePicker(
      context: context,
      firstDate: DateTime(2000),
      lastDate: DateTime(2100),
      initialDate: purchase ? DateTime.now() : DateTime.now().add(const Duration(days: 365)),
    );
    if (value == null) return;
    setState(() {
      if (purchase) {
        purchaseDate = value;
      } else {
        expiryDate = value;
      }
    });
  }

  Future<void> submit() async {
    if (!formKey.currentState!.validate()) return;

    final data = {
      "productName": name.text.trim(),
      "brand": brand.text.trim(),
      "model": model.text.trim(),
      "category": category.text.trim(),
      "purchaseDate": purchaseDate?.toIso8601String(),
      "purchasePrice": double.tryParse(price.text),
      "currency": currency.text.trim(),
      "purchaseStore": store.text.trim(),
      "serialNumber": serial.text.trim(),
      "warrantyExpiryDate": expiryDate?.toIso8601String(),
      "warrantyPeriodMonths": int.tryParse(warrantyMonths.text),
      "notes": notes.text.trim(),
    };

    final provider = context.read<ProductProvider>();
    await provider.addProduct(data);

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
    final loading = context.watch<ProductProvider>().isLoading;

    return Scaffold(
      appBar: AppBar(title: const Text("Add Product")),
      body: Form(
        key: formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            _field(name, "Product name", required: true),
            _field(brand, "Brand"),
            _field(model, "Model"),
            _field(category, "Category"),
            _field(price, "Purchase price", keyboard: TextInputType.number),
            _field(currency, "Currency"),
            _field(store, "Purchase store"),
            _field(serial, "Serial number"),
            _field(warrantyMonths, "Warranty period in months", keyboard: TextInputType.number),
            ListTile(
              title: Text(purchaseDate == null ? "Purchase date" : purchaseDate!.toLocal().toString().split(" ").first),
              trailing: const Icon(Icons.calendar_month),
              onTap: () => pickDate(true),
            ),
            ListTile(
              title: Text(expiryDate == null ? "Warranty expiry date" : expiryDate!.toLocal().toString().split(" ").first),
              trailing: const Icon(Icons.event_available),
              onTap: () => pickDate(false),
            ),
            _field(notes, "Notes", maxLines: 4),
            const SizedBox(height: 12),
            ElevatedButton(
              onPressed: loading ? null : submit,
              child: loading ? const CircularProgressIndicator() : const Text("Save product"),
            ),
          ],
        ),
      ),
    );
  }

  Widget _field(
    TextEditingController controller,
    String label, {
    bool required = false,
    TextInputType? keyboard,
    int maxLines = 1,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: TextFormField(
        controller: controller,
        keyboardType: keyboard,
        maxLines: maxLines,
        decoration: InputDecoration(labelText: label),
        validator: required
            ? (value) => value != null && value.trim().isNotEmpty ? null : "$label is required"
            : null,
      ),
    );
  }
}
