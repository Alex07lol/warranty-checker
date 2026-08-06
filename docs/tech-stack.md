# Technology Stack

> **Update (Aug 2026):** the project is now **web-only** — the Flutter frontend was removed (the client is HTML/CSS/JS served by the Express API). This document is the original stack design; the backend stack below is unchanged and current.

## Overview Table

| Layer | Technology | Version Target | Purpose |
|---|---|---|---|
| Mobile Frontend | Flutter | 3.x (stable) | Android UI and application logic |
| Language (Mobile) | Dart | 3.x | Strongly typed language for Flutter |
| State Management | Provider | 6.x | Application state management |
| HTTP Client | Dio | 5.x | Network requests with interceptors |
| Local Storage | SharedPreferences | 2.x | JWT token persistence |
| Backend Runtime | Node.js | 20 LTS | Server-side JavaScript runtime |
| Backend Framework | Express.js | 4.x | HTTP server and routing |
| Language (Backend) | JavaScript | ES2022+ | Server-side scripting |
| ODM | Mongoose | 8.x | MongoDB object data modeling |
| Database | MongoDB Atlas | M0 Free Tier | Cloud document database |
| File Storage | Cloudinary | SDK 2.x | Image and PDF storage and CDN |
| Authentication | JWT (jsonwebtoken) | 9.x | Stateless token authentication |
| Password Hashing | bcryptjs | 2.x | Secure password hashing |
| Validation | Joi | 17.x | Request body schema validation |
| Environment | dotenv | 16.x | Environment variable loading |
| File Upload | multer + multer-storage-cloudinary | Latest | Multipart form data handling |
| Security Headers | Helmet | 7.x | HTTP security header management |
| Rate Limiting | express-rate-limit | 7.x | Brute-force attack prevention |
| Request Logging | Morgan | 1.x | HTTP request logging |
| Testing | Jest + Supertest | Latest | API unit and integration testing |
| Version Control | Git | 2.x | Source code versioning |
| Repository Host | GitHub | N/A | Remote repository and CI/CD |
| API Testing | Postman | Desktop | Manual endpoint testing |

---

## Technology Justification

### Flutter

Flutter is Google's open-source UI SDK for building natively compiled applications from a single codebase. It was chosen for WarrantyVault because it provides a rich widget library, excellent performance on Android, and rapid iteration with hot reload. The Dart language's strong typing system catches errors at compile time rather than runtime, reducing debugging time during the buildathon's compressed schedule.

Alternatives considered:

- **React Native**: Rejected because it bridges to native components, introducing performance overhead for complex UI interactions. Flutter compiles directly to native ARM code, resulting in smoother animations and faster startup times.
- **Kotlin Native (Android-only)**: Rejected because it requires a separate iOS implementation later. Flutter's cross-platform capability preserves the option to add iOS support post-buildathon without rewriting the frontend.

### Node.js

Node.js provides a JavaScript runtime for server-side code, enabling the same language across frontend tooling and backend without cognitive context switching. Its event-driven, non-blocking I/O model is well-suited for an API that handles file uploads, database queries, and Cloudinary API calls concurrently. The npm ecosystem provides every library needed for this project as production-tested packages.

Alternatives considered:

- **Django (Python)**: Rejected due to the overhead of Python environment management and a more complex setup cycle. The buildathon's time constraint favors JavaScript's familiarity and the npm ecosystem's breadth.
- **Spring Boot (Java)**: Rejected due to its verbose configuration and longer startup time. Node.js starts faster and requires significantly less boilerplate for a RESTful API of this scale.

### Express.js

Express is the de facto standard for Node.js HTTP servers. It provides a minimal, unopinionated framework that gives full control over middleware ordering, routing structure, and error handling. For WarrantyVault, this means the middleware stack can be composed precisely: cors, helmet, morgan, rate-limiter, JSON body parser, routes, and the error handler — in exactly the right order.

No alternatives were seriously considered. Express is the correct tool for this scope.

### MongoDB Atlas

MongoDB is a document-oriented database that stores JSON-like documents. Its flexible schema is ideal for WarrantyVault's products collection, where different products have different optional fields and the schema may evolve. Atlas provides fully managed hosting with automatic backups, replica sets, and a generous free tier that eliminates infrastructure setup on Day 2.

Alternatives considered:

- **PostgreSQL**: A relational schema requires rigid table definitions upfront. For a product entity with many optional fields across different product categories, a document schema is more natural. Joining across many tables also introduces complexity that MongoDB avoids.
- **Firebase Firestore**: Rejected because it introduces vendor lock-in, limits query flexibility compared to MongoDB's aggregation pipeline, and the Firebase SDK adds weight to both backend and mobile implementations.

### Cloudinary

Cloudinary is a cloud-based image and video management platform with a purpose-built API for upload, storage, transformation, and CDN delivery. For WarrantyVault, it provides a single API to handle both image files and PDFs, with folder-based organization, direct URL access, and reliable deletion via public_id. The multer-storage-cloudinary package integrates directly with multer, enabling server-side streaming upload without temporary local file storage.

Alternatives considered:

- **AWS S3**: More powerful but significantly more complex to configure. Requires IAM roles, bucket policies, presigned URLs, and a much more involved SDK integration. Cloudinary's simplicity is the decisive advantage for a buildathon.
- **Firebase Storage**: Similar vendor lock-in concern as Firestore. Cloudinary is purpose-built for media management and provides superior image transformation capabilities.

### JWT (jsonwebtoken)

JSON Web Tokens provide stateless authentication. The server issues a signed token at login. Every subsequent request carries the token. The server verifies the signature on each request without consulting a session store. This stateless model means the API can be scaled horizontally without session synchronization infrastructure.

Alternatives considered:

- **Session-based authentication**: Requires a server-side session store (Redis, database). Introduces horizontal scaling complexity and additional infrastructure. Not appropriate for a buildathon with limited time.
- **OAuth**: Appropriate for third-party identity delegation. For this application where users register with email and password, JWT with bcrypt is the correct and simpler choice.

### Joi

Joi provides a declarative, readable validation schema DSL for JavaScript objects. A Joi schema reads like documentation of the expected request shape, making validation code self-documenting. The `validate.js` middleware accepts any Joi schema and applies it uniformly across all routes.

Alternatives considered:

- **Zod**: TypeScript-first validation library. Valid choice but adds TypeScript tooling overhead when the backend is plain JavaScript.
- **express-validator**: Middleware-style validation using chained methods. Less readable than Joi schemas for complex validation rules. Joi schemas are easier to review and test in isolation.

---

## Development Tools

### VS Code

The primary code editor for backend development. Extensions for ESLint, Prettier, Thunder Client, and the MongoDB extension provide a complete development environment. VS Code's integrated terminal, Git support, and workspace settings file make it straightforward to share editor configuration across the team.

### Android Studio

Required for Flutter Android development. Provides the Android SDK, Android Virtual Device manager, and the Dart/Flutter plugin for Flutter-specific tooling. Android Studio is the only supported environment for building and debugging Flutter Android apps.

### Postman

The API testing tool. All backend endpoints will be tested in Postman before frontend integration begins. A Postman collection will be maintained throughout Day 2 to document the live API and facilitate debugging.

### GitHub Desktop

Provides a visual interface for git operations. Useful during Day 2 when commit frequency is high and branching is active. The team can use GitHub Desktop for staging, committing, and pushing without leaving the IDE for the terminal.

### MongoDB Compass

The official MongoDB GUI. Used to inspect database collections during development, verify that data is being stored correctly, and run ad-hoc queries for debugging.

---

## Coding Standards

### JavaScript / Node.js Standards

**Naming Conventions:**

| Construct | Convention | Example |
|---|---|---|
| Variables and functions | camelCase | getUserById |
| Classes | PascalCase | AppError |
| Constants | UPPER_SNAKE_CASE | JWT_SECRET |
| Files | kebab-case | auth.controller.js |
| Folders | kebab-case | service-history/ |

**Style Rules:**

- Async/await is mandatory over callbacks and raw Promise chains.
- All async route handlers are wrapped in try/catch or use a wrapper utility.
- No dead code is committed. Commented-out code is removed before pushing.
- Destructuring is preferred for extracting properties from objects and arrays.
- Arrow functions are used for callbacks. Named functions are used for middleware and service methods.

**ESLint:** Configured with the following rules at minimum: no-unused-vars (error), no-console (warning), prefer-const, eqeqeq.

### Dart / Flutter Standards

**Naming Conventions:**

| Construct | Convention | Example |
|---|---|---|
| Classes and widgets | PascalCase | ProductDetailScreen |
| Variables and functions | camelCase | fetchProducts |
| Files | snake_case | product_detail_screen.dart |
| Constants | UPPER_SNAKE_CASE | API_BASE_URL |

**Style Rules:**

- Each screen widget is a `StatelessWidget` or `ConsumerWidget` with business logic delegated to a Provider.
- Providers extend `ChangeNotifier` and call `notifyListeners()` after state changes.
- API calls are in service classes, never directly in widgets.
- Form validation uses `TextFormField` with `validator` callbacks before calling any API.
- All nullable fields are handled explicitly. Null-safety is enforced by the Dart compiler.

---

## Git Workflow

### Branch Strategy

| Branch | Purpose | Protected |
|---|---|---|
| main | Production-ready code only | Yes |
| develop | Integration branch for Day 2 work | No |
| feature/feature-name | Individual feature development | No |
| fix/bug-description | Bug fixes | No |
| docs/document-name | Documentation updates | No |

Branches are created from `develop`. Pull requests target `develop`. Merges to `main` occur only at stable milestones.

### Commit Message Format

All commits follow the Conventional Commits specification:

```
type(scope): short description in present tense

Optional longer body explaining why, not what.
```

**Types:**

| Type | When to Use |
|---|---|
| feat | A new feature |
| fix | A bug fix |
| docs | Documentation changes only |
| refactor | Code change that neither fixes a bug nor adds a feature |
| test | Adding or modifying tests |
| chore | Dependency updates, build config, tooling changes |
| style | Formatting, missing semicolons, whitespace |

**Examples:**

```
feat(backend): implement JWT authentication system
fix(mobile): handle 401 response by clearing local session
docs: add database design specification
chore(backend): initialize Node.js project with dependencies
test(backend): add integration tests for product endpoints
```

### Pull Request Process

1. Create a branch from `develop` following the naming convention.
2. Implement the feature with regular commits following the commit format.
3. Self-review all changed files before opening a PR.
4. Open a PR targeting `develop` using the PR template.
5. Merge after self-review (solo buildathon) or peer review.
6. Delete the feature branch after merge.
7. Merge `develop` to `main` at each completed milestone.

### Repository Conventions

- All sensitive data (API keys, connection strings, JWT secrets) is in `.env` only. Never committed.
- The `.env.example` file must be kept up-to-date whenever new environment variables are added.
- No debug logging left in committed code.
- No TODO comments in committed code unless tracked as a GitHub issue.

---

## Error Handling Strategy

### Backend

**Centralized Error Handler:** A single error handling middleware at the end of the Express middleware stack receives all errors passed via `next(error)`. It formats the error into the standard `{ success: false, message, errors }` envelope and sends the response.

**AppError Class:** All intentional operational errors are thrown using `new AppError('message', statusCode)`. The error handler checks for `AppError` instances and uses their `statusCode`. Non-AppError instances are treated as unexpected 500 errors.

**Async Route Wrapper:** All async controller functions are wrapped with a utility that catches rejected promises and forwards them to `next()`. This eliminates repetitive try/catch in every controller.

**Validation Errors:** The `validate.js` middleware catches Joi validation failures before they reach the controller and returns a 422 response with an `errors` array containing human-readable messages per field.

**Production Safety:** In production (`NODE_ENV=production`), stack traces are never included in responses. Unexpected errors log the stack trace server-side and return "An unexpected error occurred" to the client.

### Frontend (Flutter)

**Dio Interceptors:** A response interceptor on the Dio client catches 401 responses globally, clears the stored JWT, and navigates to the login screen.

**User-Facing Messages:** All error responses from the API are mapped to user-readable strings before display. Raw error codes and server messages are never shown directly to users.

**SnackBar Errors:** Non-critical errors (failed load, submission error) are displayed as dismissible SnackBars. Critical errors (session expiry) trigger navigation.

---

## Validation Strategy

### Backend

Every route that accepts a request body passes through Joi validation middleware before reaching the controller. If any field fails validation, the request is rejected with HTTP 422 and an array of error messages. The controller never receives invalid data.

### Frontend

Flutter forms use `Form` with `GlobalKey<FormState>` and `TextFormField` with `validator` callbacks. The form is validated by calling `_formKey.currentState!.validate()` on submit. If validation fails, the submit action does not execute and the API is not called. Client-side validation rules mirror server-side Joi rules to provide immediate feedback without a round trip.

---

## Security Considerations

| Concern | Implementation |
|---|---|
| Password storage | bcrypt with cost factor 12. No plaintext. No MD5 or SHA1. |
| JWT security | Signed with a long random secret from environment variables. 7-day expiry. |
| HTTPS | Enforced in production. HTTP connections redirected. |
| CORS | Restricted to expected client origins. |
| Rate limiting | Auth endpoints: 10 requests per 15 minutes per IP. |
| Input validation | Joi validation on all request bodies. |
| NoSQL injection | Mongoose sanitization. Avoid raw query string interpolation. |
| Cloudinary credentials | Server-side only. Never sent to mobile client. |
| MongoDB credentials | Environment variables only. Atlas IP whitelist in production. |
| Sensitive logging | No passwords, tokens, or credentials logged at any log level. |
| Helmet | Security headers applied: Content-Security-Policy, X-Frame-Options, etc. |
