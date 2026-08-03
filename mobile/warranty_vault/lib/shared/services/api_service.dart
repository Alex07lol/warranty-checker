import "package:dio/dio.dart";
import "../../core/constants/api_constants.dart";
import "../../core/routes/app_router.dart";
import "storage_service.dart";

class ApiService {
  final StorageService storageService;
  final Dio dio;

  ApiService(this.storageService)
      : dio = Dio(
          BaseOptions(
            baseUrl: ApiConstants.baseUrl,
            connectTimeout: const Duration(seconds: 30),
            receiveTimeout: const Duration(seconds: 30),
          ),
        ) {
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final token = await storageService.getToken();
          if (token != null && token.isNotEmpty) {
            options.headers["Authorization"] = "Bearer $token";
          }
          handler.next(options);
        },
        onError: (error, handler) async {
          if (error.response?.statusCode == 401) {
            await storageService.deleteToken();
          }
          handler.next(error);
        },
      ),
    );
  }

  Future<Response<dynamic>> get(String path, {Map<String, dynamic>? query}) {
    return dio.get(path, queryParameters: query);
  }

  Future<Response<dynamic>> post(String path, {dynamic data}) {
    return dio.post(path, data: data);
  }

  Future<Response<dynamic>> put(String path, {dynamic data}) {
    return dio.put(path, data: data);
  }

  Future<Response<dynamic>> delete(String path) {
    return dio.delete(path);
  }
}
