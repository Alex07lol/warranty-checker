# WarrantyVault Day 2 Code Package

This package follows the uploaded Day 2 implementation plan and the repository architecture, API, database, and technology documents.

## Backend

Open a terminal in backend and run:

npm install

Copy .env.example to .env and enter the real MongoDB Atlas and Cloudinary values.

Then:

npm run dev

The API runs on port 5000.

## Flutter

Create the generated Flutter platform project first:

cd mobile
flutter create warranty_vault --org com.warrantyvault

Replace the generated warranty_vault/lib directory with the lib directory in this package.

Replace pubspec.yaml with the package version and run:

flutter pub get
flutter run

For an Android emulator the API base URL is 10.0.2.2. For a physical device replace it with the development machine's LAN IP.

## Important

The package contains application source code. It cannot create or verify the Android SDK, Flutter-generated platform files, MongoDB Atlas credentials, Cloudinary credentials, emulator state, Postman state, or GitHub credentials.

Run the required tests and integration sequence locally before treating Day 2 as fully verified.
