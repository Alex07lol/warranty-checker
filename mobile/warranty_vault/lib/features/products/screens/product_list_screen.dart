import "dart:async";
import "package:flutter/material.dart";
import "package:provider/provider.dart";
import "../providers/product_provider.dart";
import "../widgets/product_card.dart";
import "add_product_screen.dart";
import "edit_product_screen.dart";

class ProductListScreen extends StatefulWidget {
  const ProductListScreen({super.key});

  @override
  State<ProductListScreen> createState() => _ProductListScreenState();
}

class _ProductListScreenState extends State<ProductListScreen> {
  final searchController = TextEditingController();
  Timer? timer;

  @override
  void initState() {
    super.initState();
    Future.microtask(() => context.read<ProductProvider>().fetchProducts());
  }

  @override
  void dispose() {
    timer?.cancel();
    searchController.dispose();
    super.dispose();
  }

  void search(String value) {
    timer?.cancel();
    timer = Timer(const Duration(milliseconds: 300), () {
      context.read<ProductProvider>().searchProducts(value);
    });
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<ProductProvider>();

    return Scaffold(
      appBar: AppBar(title: const Text("Products")),
      body: RefreshIndicator(
        onRefresh: provider.fetchProducts,
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(12),
              child: TextField(
                controller: searchController,
                onChanged: search,
                decoration: const InputDecoration(
                  prefixIcon: Icon(Icons.search),
                  hintText: "Search products",
                ),
              ),
            ),
            Expanded(
              child: provider.isLoading && provider.products.isEmpty
                  ? const Center(child: CircularProgressIndicator())
                  : provider.products.isEmpty
                      ? const Center(child: Text("No products yet"))
                      : ListView.builder(
                          padding: const EdgeInsets.all(12),
                          itemCount: provider.products.length,
                          itemBuilder: (_, index) {
                            return ProductCard(
                              product: provider.products[index],
                              onTap: () async {
                                final product = await provider.fetchProductById(provider.products[index].id);
                                if (!context.mounted || product == null) return;
                                Navigator.push(
                                  context,
                                  MaterialPageRoute(builder: (_) => EditProductScreen(product: product)),
                                );
                              },
                            );
                          },
                        ),
            ),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () {
          Navigator.push(
            context,
            MaterialPageRoute(builder: (_) => const AddProductScreen()),
          );
        },
        child: const Icon(Icons.add),
      ),
    );
  }
}
