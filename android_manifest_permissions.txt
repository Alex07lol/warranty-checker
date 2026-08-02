import "../../../shared/services/api_service.dart";
import "../../../core/constants/api_constants.dart";
import "../models/dashboard_model.dart";

class DashboardService {
  final ApiService api;

  DashboardService(this.api);

  Future<DashboardModel> getDashboard() async {
    final response = await api.get(ApiConstants.dashboard);
    return DashboardModel.fromJson(
      Map<String, dynamic>.from(response.data["data"]),
    );
  }
}
