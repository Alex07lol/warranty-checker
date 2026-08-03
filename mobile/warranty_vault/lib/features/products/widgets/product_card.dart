import "package:flutter/material.dart";
import "../models/product_model.dart";

class ProductCard extends StatelessWidget {
  final ProductModel product;
  final VoidCallback? onTap;

  const ProductCard({
    super.key,
    required this.product,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final days = product.warrantyExpiryDate == null
        ? null
        : product.warrantyExpiryDate!.difference(DateTime.now()).inDays;

    final Color color;
    if (days == null || days > 30) {
      color = Colors.green;
    } else if (days >= 0) {
      color = Colors.amber.shade800;
    } else {
      color = Colors.red;
    }

    return Card(
      child: ListTile(
        onTap: onTap,
        leading: const CircleAvatar(child: Icon(Icons.inventory_2_outlined)),
        title: Text(product.productName),
        subtitle: Text(
          "${product.brand ?? ""}${product.brand != null ? " • " : ""}${product.warrantyExpiryDate?.toLocal().toString().split(" ").first ?? "No expiry"}",
        ),
        trailing: days == null
            ? null
            : Text(
                days < 0 ? "Expired" : "$days d",
                style: TextStyle(fontWeight: FontWeight.bold, color: color),
              ),
      ),
    );
  }
}
