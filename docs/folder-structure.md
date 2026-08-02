# Folder Structure

## Repository Root Structure

```
BUILDATHON/
├── README.md
├── LICENSE
├── .gitignore
├── .github/
│   ├── workflows/
│   │   └── ci.yml
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.md
│   │   └── feature_request.md
│   └── PULL_REQUEST_TEMPLATE.md
├── docs/
│   ├── project-overview.md
│   ├── problem-statement.md
│   ├── requirements.md
│   ├── architecture.md
│   ├── database-design.md
│   ├── api-design.md
│   ├── user-flow.md
│   ├── wireframes.md
│   ├── folder-structure.md
│   ├── tech-stack.md
│   ├── timeline.md
│   ├── task-allocation.md
│   ├── day1-summary.md
│   └── day2-plan.md
├── backend/
│   ├── src/
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── models/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── utils/
│   │   └── validators/
│   ├── tests/
│   ├── .env.example
│   └── README.md
├── mobile/
│   └── warranty_vault/
│       ├── android/
│       ├── lib/
│       │   ├── core/
│       │   │   ├── constants/
│       │   │   ├── routes/
│       │   │   ├── theme/
│       │   │   └── utils/
│       │   ├── features/
│       │   │   ├── auth/
│       │   │   │   ├── models/
│       │   │   │   ├── providers/
│       │   │   │   ├── screens/
│       │   │   │   ├── services/
│       │   │   │   └── widgets/
│       │   │   ├── products/
│       │   │   │   ├── models/
│       │   │   │   ├── providers/
│       │   │   │   ├── screens/
│       │   │   │   ├── services/
│       │   │   │   └── widgets/
│       │   │   ├── documents/
│       │   │   ├── service_history/
│       │   │   ├── notifications/
│       │   │   ├── dashboard/
│       │   │   └── settings/
│       │   ├── shared/
│       │   │   ├── models/
│       │   │   ├── services/
│       │   │   └── widgets/
│       │   └── main.dart
│       ├── assets/
│       │   ├── images/
│       │   ├── icons/
│       │   └── fonts/
│       └── pubspec.yaml
└── assets/
    ├── images/
    ├── icons/
    └── fonts/
```

---

## Root Level

### README.md

The primary entry point for anyone visiting the repository. Contains the project introduction, feature list, architecture overview, technology stack table, repository structure tree, installation guide (added Day 2), API overview, roadmap, buildathon information, license, and contributors.

### LICENSE

The MIT License covering the WarrantyVault source code. Defines the terms under which the code may be used, copied, modified, and distributed.

### .gitignore

Covers all file types that must never be committed: `node_modules/`, `.env` files, Flutter build artifacts, IDE configuration files, OS metadata files, Cloudinary credentials, and coverage reports. The `.env.example` file is explicitly allowed through the ignore rules.

### .github/

Contains all GitHub-specific configuration. This directory is read by GitHub to apply repository behaviors.

- `workflows/ci.yml`: GitHub Actions workflow that runs ESLint and Jest on every push and pull request to `main` and `develop` branches.
- `ISSUE_TEMPLATE/bug_report.md`: Template that enforces structured information collection when a bug is reported.
- `ISSUE_TEMPLATE/feature_request.md`: Template for proposing new features.
- `PULL_REQUEST_TEMPLATE.md`: Template that appears in the PR description field on GitHub, guiding contributors to provide type of change, description, related issues, testing notes, and a checklist.

---

## docs/

The centralized repository for all project documentation. Every file in this directory is a complete, self-contained document. No placeholders. No stubs.

| File | Purpose |
|---|---|
| project-overview.md | Product vision, motivation, goals, non-goals, features, future scope |
| problem-statement.md | The consumer problem, market context, existing solutions, the opportunity |
| requirements.md | Functional and non-functional requirements with IDs |
| architecture.md | System architecture with ASCII diagram, layer descriptions, data flow, security |
| database-design.md | MongoDB collections: fields, indexes, validation rules, relationships |
| api-design.md | Every REST endpoint: method, URL, auth, request/response schemas, error codes |
| user-flow.md | 11 user flows with step-by-step instructions and error states |
| wireframes.md | ASCII wireframe layouts for all 13 application screens |
| folder-structure.md | This document |
| tech-stack.md | Technology justifications, coding standards, Git workflow, security strategy |
| timeline.md | Day 1 and Day 2 schedules, risk register, milestones |
| task-allocation.md | Task ownership, sync points, definition of done |
| day1-summary.md | Day 1 accomplishments, decisions made, outstanding items |
| day2-plan.md | Hour-by-hour implementation plan for Day 2 |

---

## backend/

All server-side code for the Node.js/Express API. The source code is isolated within `src/` to keep the root of `backend/` clean for configuration files.

### backend/src/config/

Configuration files that initialize external connections and validate environment variables.

- `database.js`: Establishes the Mongoose connection to MongoDB Atlas. Logs connection status. Exports the connection for use in `server.js`.
- `cloudinary.js`: Configures the Cloudinary SDK with the environment credentials. Exports the configured instance for use in the upload middleware.
- `env.js`: Centralizes environment variable access. Validates that all required variables are present at startup. Throws an error if any required variable is missing to prevent partial configuration from causing silent failures at runtime.

### backend/src/controllers/

Request handlers. One file per resource. Each controller function extracts data from the request, calls the appropriate service function, and sends an HTTP response. Controllers do not contain business logic.

- `auth.controller.js`
- `product.controller.js`
- `document.controller.js`
- `serviceHistory.controller.js`
- `notification.controller.js`
- `dashboard.controller.js`

### backend/src/middleware/

Reusable functions applied to the Express request-response pipeline.

- `auth.js`: Extracts the JWT from the `Authorization` header, verifies it using `jwtHelper`, and attaches the decoded user payload to `req.user`. Returns 401 if the token is missing, expired, or invalid.
- `errorHandler.js`: Centralized error handling middleware. Catches all errors passed via `next(error)`, formats them into the standard response envelope, and sends the appropriate HTTP status code. Prevents stack trace exposure in production.
- `notFound.js`: Catches requests to undefined routes and returns a 404 response.
- `validate.js`: A middleware factory that accepts a Joi schema. Returns a middleware function that validates `req.body` against the schema. Returns 422 with an array of validation error messages if validation fails.
- `upload.js`: Configures multer to use CloudinaryStorage for direct streaming uploads. Sets allowed MIME types and file size limits. Exports named middleware for single-file and array uploads.
- `rateLimiter.js`: Configures express-rate-limit for the authentication routes. Set to 10 requests per 15 minutes per IP address.

### backend/src/models/

Mongoose schema definitions. Each file defines the schema, indexes, and exports the model.

- `User.js`
- `Product.js`
- `Document.js`
- `ServiceHistory.js`
- `Notification.js`

### backend/src/routes/

Express Router instances that map URL paths and HTTP methods to controller functions. Each router file mounts the auth middleware on protected routes.

- `auth.routes.js`: mounted at `/api/v1/auth`
- `product.routes.js`: mounted at `/api/v1/products`
- `document.routes.js`: mounted at `/api/v1/products/:productId/documents`
- `serviceHistory.routes.js`: mounted at `/api/v1/products/:productId/service-history`
- `notification.routes.js`: mounted at `/api/v1/notifications`
- `dashboard.routes.js`: mounted at `/api/v1/dashboard`

### backend/src/services/

Business logic layer. Services interact with Mongoose models and external APIs (Cloudinary). Controllers call services. Services do not know about HTTP.

- `auth.service.js`: registerUser, loginUser, getUserById, changePassword
- `product.service.js`: getAllProducts, getProductById, createProduct, updateProduct, softDeleteProduct, searchProducts, getExpiringProducts
- `document.service.js`: getDocumentsByProduct, uploadDocument, getDocumentById, deleteDocument
- `serviceHistory.service.js`: getServiceHistory, addServiceRecord, getServiceRecordById, updateServiceRecord, deleteServiceRecord
- `notification.service.js`: getNotifications, markAsRead, markAllAsRead, deleteNotification, createExpiryNotifications
- `dashboard.service.js`: getDashboardData (MongoDB aggregation)

### backend/src/utils/

Standalone helper functions with no Express dependencies.

- `AppError.js`: Custom error class extending the native Error class. Accepts a message and HTTP status code. Used throughout the codebase to throw typed errors.
- `response.js`: Exports `sendSuccess(res, data, message, statusCode)` and `sendError(res, message, statusCode)` to enforce the response envelope format.
- `jwtHelper.js`: Exports `generateToken(userId)` and `verifyToken(token)`. Wraps `jsonwebtoken` sign and verify calls with the configured secret and expiry.

### backend/src/validators/

Joi validation schemas. One file per resource. Exported as named schemas and used by the `validate.js` middleware.

- `auth.validator.js`: registerSchema, loginSchema, changePasswordSchema
- `product.validator.js`: createProductSchema, updateProductSchema
- `document.validator.js`: uploadDocumentSchema
- `serviceHistory.validator.js`: createServiceRecordSchema, updateServiceRecordSchema
- `notification.validator.js`: (minimal, most notification endpoints require no body)

### backend/tests/

Jest test files. Integration tests use Supertest to make real HTTP requests against an in-memory or test MongoDB instance.

- `auth.test.js`
- `product.test.js`
- `document.test.js`

---

## mobile/warranty_vault/

The Flutter Android application. Initialized with `flutter create warranty_vault --org com.warrantyvault`.

### mobile/warranty_vault/lib/core/

Application-wide configuration that is not feature-specific.

- `constants/api_constants.dart`: Base URL and all API endpoint path strings.
- `constants/app_constants.dart`: App name, version, storage key names (e.g., the key used to store the JWT in SharedPreferences).
- `routes/app_router.dart`: Named route definitions mapping route name strings to screen widget constructors.
- `theme/app_theme.dart`: MaterialTheme configuration including color scheme, text theme, input decoration theme, button theme, and card theme.
- `utils/`: Date formatting helpers, currency formatters, and other pure utility functions.

### mobile/warranty_vault/lib/features/

Feature-based organization. Each subdirectory is a self-contained feature module.

Every feature folder follows this internal structure:

```
feature_name/
├── models/        Data models for this feature
├── providers/     ChangeNotifier classes managing state
├── screens/       Screen widgets (full-page UI)
├── services/      API communication for this feature
└── widgets/       Feature-specific reusable UI components
```

Feature directories:

- `auth/`: Splash, Welcome, Register, Login screens; AuthProvider; AuthService
- `products/`: Product List, Add Product, Edit Product, Product Detail screens; ProductProvider; ProductService
- `documents/`: Document List, Upload Document screens; DocumentProvider; DocumentService
- `service_history/`: Service History, Add Service Record screens; ServiceHistoryProvider; ServiceHistoryService
- `notifications/`: Notifications screen; NotificationProvider; NotificationService
- `dashboard/`: Dashboard screen with stat cards; DashboardProvider; DashboardService
- `settings/`: Settings screen with profile display, notification preferences, logout

### mobile/warranty_vault/lib/shared/

Reusable code shared across multiple features.

- `models/`: Generic response model wrappers used by all API services.
- `services/api_service.dart`: Dio HTTP client configured with base URL, timeout, and interceptors for JWT injection and 401 handling.
- `services/storage_service.dart`: SharedPreferences wrapper with typed methods for storing and retrieving the JWT token.
- `widgets/bottom_nav_bar.dart`: The main bottom navigation bar widget.
- `widgets/app_bar_widget.dart`: Custom app bar with notification bell badge.
- `widgets/loading_overlay.dart`: Full-screen loading indicator overlay.
- `widgets/error_snackbar.dart`: Standardized Snackbar for error messages.

### mobile/warranty_vault/lib/main.dart

Application entry point. Initializes providers using MultiProvider, configures the MaterialApp with the theme and named routes, and sets the initial route to the splash screen.

### mobile/warranty_vault/assets/

Static assets used within the Flutter application and declared in `pubspec.yaml`.

- `assets/images/`: Logo, splash background, and placeholder images.
- `assets/icons/`: Custom icon assets.
- `assets/fonts/`: Custom font files if any are used beyond Google Fonts CDN.

---

## assets/ (Root Level)

Project-level static assets for documentation, marketing, and repository purposes.

- `assets/images/`: App logo, screenshots for the README, and promotional images.
- `assets/icons/`: App icons in various sizes for documentation.
- `assets/fonts/`: Font files if shared between documentation tooling and the application.

These assets are distinct from `mobile/warranty_vault/assets/`, which are bundled into the compiled Android APK. Root-level assets are not bundled and are used only for documentation and repository purposes.
