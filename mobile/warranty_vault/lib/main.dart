import "package:flutter/material.dart";
import "package:provider/provider.dart";
import "core/routes/app_router.dart";
import "core/theme/app_theme.dart";
import "shared/services/api_service.dart";
import "shared/services/storage_service.dart";
import "features/auth/providers/auth_provider.dart";
import "features/auth/services/auth_service.dart";
import "features/products/providers/product_provider.dart";
import "features/products/services/product_service.dart";
import "features/dashboard/providers/dashboard_provider.dart";
import "features/dashboard/services/dashboard_service.dart";
import "features/documents/providers/document_provider.dart";
import "features/documents/services/document_service.dart";
import "features/service_history/providers/service_history_provider.dart";
import "features/service_history/services/service_history_service.dart";
import "features/notifications/providers/notification_provider.dart";
import "features/notifications/services/notification_service.dart";

void main() {
  final storage = StorageService();
  final api = ApiService(storage);

  runApp(
    MultiProvider(
      providers: [
        Provider<StorageService>.value(value: storage),
        Provider<ApiService>.value(value: api),
        Provider<AuthService>(create: (_) => AuthService(api)),
        ChangeNotifierProvider<AuthProvider>(
          create: (context) => AuthProvider(
            context.read<AuthService>(),
            storage,
          ),
        ),
        Provider<ProductService>(create: (_) => ProductService(api)),
        ChangeNotifierProvider<ProductProvider>(
          create: (context) => ProductProvider(context.read<ProductService>()),
        ),
        Provider<DashboardService>(create: (_) => DashboardService(api)),
        ChangeNotifierProvider<DashboardProvider>(
          create: (context) => DashboardProvider(context.read<DashboardService>()),
        ),
        Provider<DocumentService>(create: (_) => DocumentService(api)),
        ChangeNotifierProvider<DocumentProvider>(
          create: (context) => DocumentProvider(context.read<DocumentService>()),
        ),
        Provider<ServiceHistoryService>(create: (_) => ServiceHistoryService(api)),
        ChangeNotifierProvider<ServiceHistoryProvider>(
          create: (context) => ServiceHistoryProvider(context.read<ServiceHistoryService>()),
        ),
        Provider<NotificationService>(create: (_) => NotificationService(api)),
        ChangeNotifierProvider<NotificationProvider>(
          create: (context) => NotificationProvider(context.read<NotificationService>()),
        ),
      ],
      child: MaterialApp(
        title: "WarrantyVault",
        debugShowCheckedModeBanner: false,
        theme: AppTheme.theme,
        routes: AppRouter.routes,
        initialRoute: AppRouter.splash,
      ),
    ),
  );
}
