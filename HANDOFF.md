# WarrantyVault — Handoff Instructions

## What Has Been Built

### Day 1 — Architecture and Documentation
All architecture, API, database, and technology decisions are fully documented under `docs/`.

Key documents:
- `docs/api-design.md` — Complete REST API contract for every endpoint
- `docs/database-design.md` — MongoDB collection schemas with indexes
- `docs/architecture.md` — System architecture overview
- `docs/tech-stack.md` — Technology justifications and coding standards
- `docs/day2-plan.md` — Original Day 2 implementation roadmap

### Day 2 — Backend and Flutter Code Package
The zip file `WarrantyVault-Day2-Fixed (1) (2).zip` in the root of this repository contains the complete backend and Flutter source code.

Backend (Node.js / Express):
- JWT authentication (register, login, logout, me, change-password)
- Product CRUD with full-text search and warranty expiry filter
- Document upload to Cloudinary (receipt, warranty card, photo, manual, other)
- Notifications system (expiry alerts at 30 days, 7 days, 1 day)
- Dashboard aggregation endpoint
- Rate limiting, Helmet, Morgan, Joi validation

Flutter (Dart):
- Provider-based state management
- Dio HTTP client with JWT interceptor
- All screens: splash, welcome, register, login, dashboard, product list, product detail, add product, edit product, document upload, notifications, settings
- Android permissions configured

### Web UI Mockup (Current Session)
A minimal phone-form-factor web UI mockup is live at `backend/public/index.html`.

It is served by the Express backend on port 5000 when run without a database. Open `http://localhost:5000` in a browser after running `node src/server.js` from inside the `backend/` directory.

The mockup demonstrates:
- Phone shell container with status bar
- Home view showing only products that need attention (expired or expiring warranties)
- Product cards with real images pulled from Unsplash by brand and category
- Custom photo upload per product (stored in localStorage)
- Product detail overlay with warranty status block, specifications, and document chips
- Camera (Scan) tab — placeholder for future OCR receipt scanning
- Repair / Service tab — placeholder for future nearest service center map
- Glassmorphism floating pill bottom navigation bar (only element with glassmorphism)
- State persisted in browser localStorage

---

## What Needs to Be Done Next

### Priority 1 — Backend Environment Setup
The backend code is complete but needs real credentials to run against MongoDB Atlas and Cloudinary.

Steps:
1. Copy `backend/.env.example` to `backend/.env`
2. Fill in `MONGO_URI` with your MongoDB Atlas connection string
3. Fill in `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
4. Fill in `JWT_SECRET` with a long random string (minimum 32 characters)
5. Run `npm install --legacy-peer-deps` inside `backend/`
6. Run `npm run dev` to start the development server on port 5000
7. Test every endpoint in Postman using `docs/api-design.md` as the reference

The `multer-storage-cloudinary` package requires `--legacy-peer-deps` because it has a peer dependency on `cloudinary@^1.x` while the installed version is `cloudinary@^2.x`. The API is compatible at runtime.

### Priority 2 — Flutter Project Initialization
The Flutter source is inside the zip file at `mobile/warranty_vault/lib/` and `mobile/warranty_vault/pubspec.yaml`.

Steps:
1. Extract the zip file contents into the repository root (overwriting existing files)
2. Install Flutter SDK if not already installed: https://docs.flutter.dev/get-started/install/windows
3. Inside `mobile/`, run: `flutter create warranty_vault --org com.warrantyvault`
4. Delete the generated `lib/` and `pubspec.yaml` from the newly created project
5. Copy the `lib/` and `pubspec.yaml` from the zip into `mobile/warranty_vault/`
6. Open `mobile/warranty_vault/android/app/src/main/AndroidManifest.xml`
7. Add inside the `<manifest>` tag:
   ```xml
   <uses-permission android:name="android.permission.INTERNET"/>
   <uses-permission android:name="android.permission.CAMERA"/>
   <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE"/>
   <uses-permission android:name="android.permission.READ_MEDIA_IMAGES"/>
   ```
8. Update `lib/core/constants/api_constants.dart`:
   - For Android emulator: base URL is `http://10.0.2.2:5000/api/v1`
   - For physical device: replace with your machine's LAN IP address
9. Run `flutter pub get` then `flutter run` with an emulator or device connected

### Priority 3 — OCR Camera Feature (Scan Tab)
The Camera tab currently shows a placeholder shutter screen.

Implementation plan:
- Use the `camera` Flutter package for device camera access
- Use `google_ml_kit` or `tesseract_ocr` Flutter package for on-device OCR text recognition
- After capture, parse the OCR output to extract: product name, brand, model, purchase date, serial number, warranty period
- Pre-fill the Add Product form with the extracted values and allow user to confirm or correct
- The backend requires no changes for this feature

The web UI mockup at `backend/public/index.html` has the Camera tab shell ready. When implementing OCR for web, use the browser MediaDevices API and a JavaScript OCR library such as Tesseract.js.

### Priority 4 — Repair and Service Center Map (Repair Tab)
The Repair tab currently shows a placeholder map grid.

Implementation plan:
- Use Google Maps Flutter plugin (`google_maps_flutter`) or the Google Maps JavaScript API for the web mockup
- Require the Google Maps Platform API key and enable the Places API and Maps SDK
- When the tab opens, request location permission and get the device's current GPS coordinates
- Call the Google Places API with the query: `authorized service center for [product brand]` filtered by proximity
- Display results as map pins with tap-to-call and directions support
- The backend can optionally cache service center results in MongoDB to reduce API call costs

### Priority 5 — Product Image Auto-Pull
The current mockup uses Unsplash as a free placeholder. For production:

- Integrate the Google Custom Search JSON API with image search enabled
- Query: `[brand] [model] [category] product`
- Cache the returned image URL in the product document in MongoDB under `thumbnailUrl`
- Display the cached URL in the Flutter app using `cached_network_image`
- Keep the manual upload option as the override: if `customPhoto` exists, use it over the auto-pulled URL

### Priority 6 — Web Mockup to Production Connection
The `backend/public/index.html` web mockup currently runs entirely on localStorage.

To connect it to the real backend:
- Replace localStorage reads and writes with API calls to `/api/v1/products` using the Fetch API or Axios
- Implement a login screen before the main view that calls `POST /api/v1/auth/login` and stores the JWT
- Attach the JWT as `Authorization: Bearer <token>` header on every API request
- Replace Unsplash image URLs with `thumbnailUrl` values returned by the products API

---

## Technical Guidelines for the Next Developer or AI Agent

### Repository Structure
Follow the folder structure defined in `docs/folder-structure.md` exactly.
Do not introduce new top-level directories without updating that document.

### API Contract
Every backend endpoint must conform to the response envelope defined in `docs/api-design.md`:

Success:
```json
{ "success": true, "message": "string", "data": {} }
```

Error:
```json
{ "success": false, "message": "string", "errors": [] }
```

Never break this contract. Flutter and the web client both depend on it.

### Coding Standards
- JavaScript: camelCase for variables and functions, PascalCase for classes, UPPER_SNAKE_CASE for constants, kebab-case for file names
- Dart: PascalCase for widgets and classes, camelCase for variables and methods, snake_case for file names
- No emojis in code or comments
- No dead code committed
- All secrets in `.env`, never committed
- Commit messages must follow Conventional Commits format: `type(scope): description`

### Git Workflow
- Branch from `main` for all new features: `feature/feature-name`
- Keep commits atomic and focused on one logical change
- Push after every commit
- Never force-push `main` unless correcting author history

### Dependency Notes
- The backend dependency tree has a peer conflict between `cloudinary@2.x` and `multer-storage-cloudinary@4.x`
- Always run `npm install --legacy-peer-deps` for the backend
- This is a known acceptable conflict — the APIs used are compatible at runtime

### Database Notes
- Never hard-delete product records — use the `isDeleted` soft-delete flag
- Warranty expiry notifications must be deduplicated per product per interval (30d, 7d, 1d)
- All ObjectId references must be validated in the service layer before database operations

### Environment
- Node.js 20 or higher is required
- Flutter SDK 3.x or higher is required
- MongoDB Atlas M0 free tier is sufficient for development
- Cloudinary free tier is sufficient for development
