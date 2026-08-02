# Mobile

This directory will contain the Flutter Android application for WarrantyVault.

Implementation begins on Day 2. The Flutter project will be initialized inside `warranty_vault/` using the Flutter CLI.

See [../docs/day2-plan.md](../docs/day2-plan.md) for the complete step-by-step implementation plan.

## Planned Structure

```
mobile/
└── warranty_vault/
    ├── android/
    ├── lib/
    │   ├── core/
    │   │   ├── constants/     - API base URL, app constants, storage keys
    │   │   ├── routes/        - Named route definitions
    │   │   ├── theme/         - Material theme, colors, typography
    │   │   └── utils/         - Date helpers, formatters
    │   ├── features/
    │   │   ├── auth/
    │   │   ├── products/
    │   │   ├── documents/
    │   │   ├── service_history/
    │   │   ├── notifications/
    │   │   ├── dashboard/
    │   │   └── settings/
    │   ├── shared/
    │   │   ├── models/        - Shared data models
    │   │   ├── widgets/       - Reusable widgets
    │   │   └── services/      - API client, storage service
    │   └── main.dart
    └── pubspec.yaml
```

## Target Platform

Android (minimum SDK: API 21, Android 5.0)
