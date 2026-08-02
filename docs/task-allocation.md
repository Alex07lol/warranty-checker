# Task Allocation

## Team Structure

To maximize efficiency during this 2-day buildathon, the team is divided into two distinct roles with clear ownership, while maintaining close collaboration on architecture decisions and end-to-end testing.

- **Developer 1 — Backend Lead**: Responsible for the Node.js/Express API, MongoDB schema design, Cloudinary integration, JWT authentication, and overall server architecture.
- **Developer 2 — Frontend Lead**: Responsible for the Flutter application, UI/UX implementation, state management, and Android platform specifics.

Both developers collaborate on initial planning, architectural decisions, API contract definition, and final integration testing.

## Day 1 Task Allocation

| Task | Owner | Status |
|---|---|---|
| Repository setup and initial push | Both | Complete |
| Architecture design | Both | Complete |
| Database schema design | Backend Lead | Complete |
| API endpoint design | Backend Lead | Complete |
| Root folder structure | Both | Complete |
| Flutter folder planning | Frontend Lead | Complete |
| Documentation writing | Both | Complete |
| README.md | Both | Complete |
| Day 2 implementation plan | Both | Complete |
| Git commits and push to GitHub | Both | Complete |

## Day 2 Task Allocation

### Backend Lead Tasks

Execute in this order to allow the Frontend Lead to integrate as each layer becomes available.

1. Initialize Node.js project in `backend/`
2. Configure Express server with middleware stack
3. Establish MongoDB Atlas connection via Mongoose
4. Implement User model and authentication routes (register, login, logout, /me, change-password)
5. Implement JWT authorization middleware
6. Implement Product model and all 7 product endpoints
7. Implement Document model and upload endpoint with multer-storage-cloudinary
8. Implement Service History model and CRUD endpoints
9. Implement Notifications model and endpoints
10. Implement Dashboard aggregation endpoint
11. Add Joi validation to every route
12. Add rate limiting, Helmet, and Morgan middleware
13. Test all endpoints in Postman systematically

### Frontend Lead Tasks

Execute in this order. Begin Flutter initialization while the Backend Lead completes the auth API.

1. Initialize Flutter project in `mobile/warranty_vault/`
2. Add all dependencies to `pubspec.yaml` and run `flutter pub get`
3. Create the full folder structure under `lib/`
4. Configure `AndroidManifest.xml` with all required permissions
5. Implement `lib/core/theme/app_theme.dart`
6. Implement `lib/core/routes/app_router.dart`
7. Implement `lib/core/constants/api_constants.dart` and `app_constants.dart`
8. Implement `lib/shared/services/api_service.dart` (Dio with interceptors)
9. Implement `lib/shared/services/storage_service.dart` (SharedPreferences wrapper)
10. Build authentication screens: Splash, Welcome, Register, Login
11. Implement auth provider and state management
12. Build Dashboard screen
13. Build Product List screen with search
14. Build Add Product screen and Edit Product screen
15. Build Product Detail screen with tab layout
16. Build Upload Document screen with camera and file picker
17. Build Service History screen and Add Service Record screen
18. Build Notifications screen
19. Build Settings screen with logout
20. End-to-end integration testing with live backend

## Collaboration and Sync Points

| Sync Point | When | What to Align On |
|---|---|---|
| API Contract Review | After API design is finalized (Day 1) | Exact request body field names, response data shapes |
| Auth Integration | Day 2, Hour 3 complete | Backend shares Postman collection; frontend starts auth screens |
| Product Integration | Day 2, Hour 5 complete | Frontend integrates product CRUD screens with live API |
| Document Integration | Day 2, Hour 6 complete | Frontend integrates upload flow with live Cloudinary endpoint |
| Final Integration | Day 2, Hour 16 | End-to-end testing on a real Android device together |

## Definition of Done

A task is considered complete when all of the following criteria are met:

1. The code is written and follows the agreed coding standards in `tech-stack.md`.
2. The feature has been tested locally — Postman for API endpoints, Android emulator or device for Flutter screens.
3. All error cases are handled with appropriate user-facing messages.
4. The code is committed with a conventional commit message and pushed to the repository.
5. For backend features: the endpoint returns the correct response for both success and error cases.
6. For frontend features: the screen handles loading state, success state, and error state without crashing.
7. Integration points have been verified by both developers together.
