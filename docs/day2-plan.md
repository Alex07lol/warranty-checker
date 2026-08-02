# Day 2 Implementation Plan

## Overview
Full implementation of WarrantyVault on August 3, 2026. Both backend and frontend must be production-quality and fully connected by end of day.

## Prerequisites
Before starting Day 2:
- [ ] Node.js 20+ installed
- [ ] Flutter SDK installed
- [ ] Android Studio with Android SDK installed
- [ ] MongoDB Atlas account created, free cluster provisioned
- [ ] Cloudinary account created, credentials available
- [ ] Git configured
- [ ] Postman installed

## Hour 1: Backend Project Initialization (09:00 - 10:00)

### Objectives
Initialize Node.js/Express project with all dependencies.

### Step-by-Step Instructions

1. Navigate to backend/ folder
2. Run `npm init -y`
3. Install production dependencies:
   ```bash
   npm install express mongoose dotenv bcryptjs jsonwebtoken joi multer cloudinary multer-storage-cloudinary cors express-rate-limit helmet morgan
   ```
4. Install dev dependencies:
   ```bash
   npm install --save-dev nodemon jest supertest
   ```
5. Create `.env` file from `.env.example`:
   ```env
   PORT=5000
   NODE_ENV=development
   MONGO_URI=mongodb+srv://<user>:<password>@cluster0.mongodb.net/warrantyvault_db
   JWT_SECRET=<your-long-random-secret>
   JWT_EXPIRES_IN=7d
   CLOUDINARY_CLOUD_NAME=<your-cloud-name>
   CLOUDINARY_API_KEY=<your-api-key>
   CLOUDINARY_API_SECRET=<your-api-secret>
   CLIENT_URL=http://localhost
   ```
6. Update package.json scripts:
   ```json
   {
     "scripts": {
       "start": "node src/server.js",
       "dev": "nodemon src/server.js",
       "test": "jest --runInBand"
     }
   }
   ```
7. Create folder structure:
   ```bash
   mkdir src src\controllers src\middleware src\models src\routes src\services src\utils src\validators src\config tests
   ```
8. Create `src/server.js` - Express app entry point
9. Create `src/config/database.js` - MongoDB connection
10. Create `src/config/cloudinary.js` - Cloudinary configuration
11. Test: `npm run dev` should show server running on port 5000

### Git Commit
```text
chore(backend): initialize Node.js project with dependencies
```

### Expected Deliverables
- Running Express server on port 5000
- MongoDB connection established
- Cloudinary configured

### Possible Blockers
- MongoDB Atlas IP whitelist: add 0.0.0.0/0 for development
- Cloudinary credentials: verify in Cloudinary dashboard

---

## Hour 2: Backend Configuration and Structure (10:00 - 11:00)

### Objectives
Create all configuration files, middleware scaffolding, utility files.

### Files to Create

1. `src/config/env.js` - Centralized environment variable access and validation
2. `src/middleware/errorHandler.js` - Global error handling middleware
3. `src/middleware/notFound.js` - 404 handler
4. `src/utils/AppError.js` - Custom error class extending Error
5. `src/utils/response.js` - Helper functions: sendSuccess(res, data, message, statusCode), sendError(res, message, statusCode)
6. `src/utils/jwtHelper.js` - generateToken(userId), verifyToken(token)
7. `src/middleware/auth.js` - JWT verification middleware, attaches req.user
8. `src/middleware/validate.js` - Joi validation middleware factory
9. `src/middleware/upload.js` - Multer/Cloudinary storage configuration

### Description of File Behavior

- `env.js`: Parses and validates all environment variables upon startup to prevent runtime crashes due to missing configuration.
- `errorHandler.js`: Intercepts unhandled exceptions, formatting them into standard JSON responses and preventing stack trace leakage in production.
- `notFound.js`: Catches requests to unmapped routes and returns a standard 404 JSON response.
- `AppError.js`: Provides a structured way to throw operational errors containing specific HTTP status codes and messages.
- `response.js`: Ensures a uniform JSON structure across all API responses, aiding frontend parsing.
- `jwtHelper.js`: Abstracts the signing and verification logic for JSON Web Tokens.
- `auth.js`: Extracts the Bearer token from incoming requests, verifies it via `jwtHelper`, and populates the `req.user` object for downstream handlers.
- `validate.js`: Accepts a Joi schema, validates incoming request bodies/params against it, and throws formatted errors if validation fails.
- `upload.js`: Configures multer to stream uploaded files directly to Cloudinary and attaches the resulting URLs to the request object.

### Git Commit
```text
feat(backend): add configuration, utilities, and middleware scaffolding
```

---

## Hour 3: Authentication Implementation (11:00 - 12:00)

### Objectives
Implement complete JWT authentication system.

### Files to Create

1. `src/models/User.js` - Mongoose User schema with password hashing pre-save hook
2. `src/validators/auth.validator.js` - Joi schemas for register and login
3. `src/services/auth.service.js` - Business logic: registerUser, loginUser, getUserById
4. `src/controllers/auth.controller.js` - Request handlers calling service layer
5. `src/routes/auth.routes.js` - Express router mounting auth endpoints

### Auth Endpoints to Implement
- POST /api/v1/auth/register
- POST /api/v1/auth/login
- POST /api/v1/auth/logout (client-side token deletion, returns success)
- GET  /api/v1/auth/me (protected)
- PUT  /api/v1/auth/change-password (protected)

### Testing Steps
In Postman:
1. POST register with valid body - expect 201 with token
2. POST register with duplicate email - expect 409
3. POST login with correct credentials - expect 200 with token
4. POST login with wrong password - expect 401
5. GET /me without token - expect 401
6. GET /me with valid token - expect 200 with user data

### Git Commit
```text
feat(backend): implement JWT authentication system
```

---

## Hour 4: Product API Implementation (12:00 - 13:00)

### Objectives
Implement full product CRUD with search and expiry filtering.

### Files to Create

1. `src/models/Product.js` - Mongoose Product schema
2. `src/validators/product.validator.js` - Joi schemas for create and update
3. `src/services/product.service.js` - getAllProducts, getProductById, createProduct, updateProduct, deleteProduct (soft), searchProducts, getExpiringProducts
4. `src/controllers/product.controller.js` - Request handlers
5. `src/routes/product.routes.js` - Express router with auth middleware on all routes

### Git Commit
```text
feat(backend): implement product CRUD API with search and expiry filter
```

---

## Hour 5: Document Upload API (13:00 - 14:00)

### Objectives
Implement file upload to Cloudinary with metadata stored in MongoDB.

### Files to Create

1. `src/models/Document.js` - Mongoose Document schema
2. `src/validators/document.validator.js` - Joi schema for document metadata
3. `src/services/document.service.js` - getDocumentsByProduct, uploadDocument (Cloudinary upload + DB save), deleteDocument (Cloudinary destroy + DB delete)
4. `src/controllers/document.controller.js`
5. `src/routes/document.routes.js`

### Cloudinary Integration Notes
- Use multer with CloudinaryStorage from multer-storage-cloudinary
- Folder structure in Cloudinary: `warrantyvault/{userId}/{productId}/{documentType}`
- Allowed file types: JPEG, PNG, WEBP, PDF
- Max file size: 10MB
- Store Cloudinary public_id in DB for deletion

### Testing Steps
Test file upload with Postman using form-data.

### Git Commit
```text
feat(backend): implement document upload API with Cloudinary integration
```

---

## Hour 6: Service History and Notifications API (14:00 - 15:00)

### Objectives
Implement service history CRUD and notifications system.

### Files to Create

1. `src/models/ServiceHistory.js`
2. `src/validators/serviceHistory.validator.js`
3. `src/services/serviceHistory.service.js`
4. `src/controllers/serviceHistory.controller.js`
5. `src/routes/serviceHistory.routes.js`
6. `src/models/Notification.js`
7. `src/services/notification.service.js` - createExpiryNotifications (cron-ready), getNotifications, markAsRead, markAllAsRead, deleteNotification
8. `src/controllers/notification.controller.js`
9. `src/routes/notification.routes.js`
10. `src/routes/dashboard.routes.js` - GET /dashboard with MongoDB aggregation

### Git Commit
```text
feat(backend): implement service history, notifications, and dashboard API
```

---

## Hour 7: Backend Polish, Validation, and Testing (15:00 - 16:00)

### Objectives
Add rate limiting, polish error handling, test all endpoints end-to-end.

### Tasks
1. Add rate limiting with express-rate-limit to auth routes (max 10 requests per 15 minutes)
2. Add helmet middleware for security headers
3. Add morgan for request logging
4. Review all validation schemas for completeness
5. Test every endpoint in Postman systematically
6. Fix any bugs found
7. Verify all error responses follow standard format

### Git Commit
```text
feat(backend): add security middleware and complete API validation
```

---

## Hour 8: Flutter Project Initialization (16:00 - 17:00)

### Objectives
Initialize Flutter project with all dependencies and folder structure.

### Steps
1. Navigate to mobile/ folder
2. Run: `flutter create warranty_vault --org com.warrantyvault`
3. Navigate to warranty_vault/
4. Add dependencies to pubspec.yaml:
   - dio: ^5.0.0 (HTTP client)
   - provider: ^6.0.0 (state management)
   - shared_preferences: ^2.0.0 (local JWT storage)
   - image_picker: ^1.0.0 (camera/gallery)
   - file_picker: ^6.0.0 (PDF selection)
   - intl: ^0.18.0 (date formatting)
   - google_fonts: ^6.0.0 (typography)
   - flutter_local_notifications: ^16.0.0 (local notifications)
   - cached_network_image: ^3.0.0 (image caching)
   - flutter_svg: ^2.0.0 (SVG icons)
   - permission_handler: ^11.0.0 (Android permissions)
5. Run `flutter pub get`
6. Create folder structure under lib/:
   ```text
   lib/
   ├── core/
   │   ├── constants/
   │   ├── routes/
   │   ├── theme/
   │   └── utils/
   ├── features/
   │   ├── auth/
   │   │   ├── screens/
   │   │   ├── widgets/
   │   │   ├── providers/
   │   │   └── services/
   │   ├── products/
   │   │   ├── screens/
   │   │   ├── widgets/
   │   │   ├── providers/
   │   │   ├── models/
   │   │   └── services/
   │   ├── documents/
   │   ├── service_history/
   │   ├── notifications/
   │   ├── dashboard/
   │   └── settings/
   └── shared/
       ├── models/
       ├── widgets/
       └── services/
   ```
7. Configure AndroidManifest.xml: add internet permission, camera permission, storage permission

### Git Commit
```text
chore(mobile): initialize Flutter project with dependencies and structure
```

---

## Hour 9: Flutter Core Configuration (17:00 - 18:00)

### Objectives
Set up theme, routing, constants, and API service foundation.

### Files to Create

1. `lib/core/constants/api_constants.dart` - base URL, endpoint paths
2. `lib/core/constants/app_constants.dart` - app name, version, storage keys
3. `lib/core/theme/app_theme.dart` - MaterialTheme with color scheme, typography
4. `lib/core/routes/app_router.dart` - Named routes map
5. `lib/shared/services/api_service.dart` - Dio client with interceptors (token injection, error handling)
6. `lib/shared/services/storage_service.dart` - SharedPreferences wrapper for JWT token

### Git Commit
```text
feat(mobile): add theme, routing, and API service configuration
```

---

## Hour 10: Flutter Authentication Screens (18:00 - 19:00)

### Files to Create

1. `lib/features/auth/models/user_model.dart`
2. `lib/features/auth/services/auth_service.dart` - register, login, logout, getCurrentUser
3. `lib/features/auth/providers/auth_provider.dart` - ChangeNotifier managing auth state
4. `lib/features/auth/screens/splash_screen.dart` - checks stored token, routes to dashboard or welcome
5. `lib/features/auth/screens/welcome_screen.dart` - Register and Login buttons
6. `lib/features/auth/screens/register_screen.dart` - Registration form
7. `lib/features/auth/screens/login_screen.dart` - Login form

### Behavior
- Splash screen: on app start, check SharedPreferences for JWT. If exists, navigate to Dashboard. If not, navigate to Welcome.
- Registration: validate form, call auth service, on success store JWT, navigate to Dashboard.
- Login: validate form, call auth service, on success store JWT, navigate to Dashboard.

### Git Commit
```text
feat(mobile): implement authentication screens and auth state management
```

---

## Hour 11: Flutter Product Screens (19:00 - 20:00)

### Files to Create

1. `lib/features/products/models/product_model.dart`
2. `lib/features/products/services/product_service.dart`
3. `lib/features/products/providers/product_provider.dart`
4. `lib/features/products/screens/product_list_screen.dart` - search bar, product cards grid/list
5. `lib/features/products/screens/add_product_screen.dart` - full form with date pickers
6. `lib/features/products/screens/product_detail_screen.dart` - product info, tabs
7. `lib/features/products/screens/edit_product_screen.dart` - pre-filled form
8. `lib/features/products/widgets/product_card.dart` - reusable card widget

### Git Commit
```text
feat(mobile): implement product management screens
```

---

## Hour 12: Flutter Dashboard Screen (20:00 - 21:00)

### Files to Create

1. `lib/features/dashboard/models/dashboard_model.dart`
2. `lib/features/dashboard/services/dashboard_service.dart`
3. `lib/features/dashboard/providers/dashboard_provider.dart`
4. `lib/features/dashboard/screens/dashboard_screen.dart`
5. `lib/features/dashboard/widgets/stat_card.dart`
6. `lib/features/dashboard/widgets/expiring_soon_card.dart`
7. `lib/shared/widgets/bottom_nav_bar.dart` - main navigation
8. `lib/shared/widgets/app_bar_widget.dart`

### Git Commit
```text
feat(mobile): implement dashboard screen with stats and navigation
```

---

## Hour 13: Flutter Document Upload (21:00 - 22:00)

### Files to Create

1. `lib/features/documents/models/document_model.dart`
2. `lib/features/documents/services/document_service.dart`
3. `lib/features/documents/providers/document_provider.dart`
4. `lib/features/documents/screens/document_list_screen.dart`
5. `lib/features/documents/screens/upload_document_screen.dart` - document type picker, file picker (image_picker/file_picker), upload progress
6. `lib/features/documents/widgets/document_card.dart`

### Android Permissions Needed
- CAMERA
- READ_EXTERNAL_STORAGE (or READ_MEDIA_IMAGES for Android 13+)
- INTERNET

### Git Commit
```text
feat(mobile): implement document upload with camera and gallery support
```

---

## Hour 14: Flutter Service History and Notifications (22:00 - 23:00)

### Files to Create

1. `lib/features/service_history/models/service_history_model.dart`
2. `lib/features/service_history/services/service_history_service.dart`
3. `lib/features/service_history/providers/service_history_provider.dart`
4. `lib/features/service_history/screens/service_history_screen.dart`
5. `lib/features/service_history/screens/add_service_record_screen.dart`
6. `lib/features/notifications/models/notification_model.dart`
7. `lib/features/notifications/services/notification_service.dart`
8. `lib/features/notifications/providers/notification_provider.dart`
9. `lib/features/notifications/screens/notifications_screen.dart`
10. `lib/features/settings/screens/settings_screen.dart` - profile info, logout

### Git Commit
```text
feat(mobile): implement service history, notifications, and settings screens
```

---

## Hour 15: Integration Testing and Bug Fixes (23:00 - End)

### Test Checklist
- [ ] Register new user
- [ ] Login with registered user
- [ ] Add a product
- [ ] Upload a receipt image
- [ ] Upload a warranty card image
- [ ] Upload a PDF manual
- [ ] Add a service record
- [ ] View dashboard stats (correct counts)
- [ ] Search for a product by name
- [ ] View notifications
- [ ] Delete a product (verify soft delete)
- [ ] Logout and re-login (JWT persisted)

### Git Commit After All Tests Pass
```text
test: complete end-to-end integration testing
```

### Final Git Commit
```text
feat: WarrantyVault Day 2 complete - full stack implementation
```

## Success Criteria

Day 2 is complete when:
1. Flutter app runs on Android device or emulator without errors
2. User can register and login
3. User can add, view, edit, and delete products
4. User can upload images and PDFs
5. User can add service records
6. Dashboard shows accurate statistics
7. All API endpoints return correct responses
8. No uncaught exceptions in either backend or frontend

## Possible Blockers and Solutions

| Blocker | Solution |
| :--- | :--- |
| Android build failure | Execute `flutter clean && flutter pub get` to reset the build cache. |
| MongoDB Atlas connection refused | Check IP whitelist in the Atlas dashboard and ensure `0.0.0.0/0` is allowed for development. |
| Cloudinary upload error | Verify credentials in the `.env` file and check payload file size limits. |
| JWT token invalid | Verify the `JWT_SECRET` string matches precisely between token generation and middleware verification steps. |
| CORS error | Verify `CLIENT_URL` in `.env` and ensure the `cors` middleware is applied before any route definitions. |
| Flutter network error on device | Check the device uses the same local network as the backend; update the base URL in `api_constants.dart` to the machine's local IP address instead of localhost. |
