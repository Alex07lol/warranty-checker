# WarrantyVault

A mobile-first digital ownership platform built for Android. WarrantyVault lets users securely store receipts, warranty cards, product photos, manuals, serial numbers, and service history for every product they own — all in one place, with automatic expiry tracking and push notifications.

---

## Table of Contents

- [About the Project](#about-the-project)
- [Features](#features)
- [Architecture](#architecture)
- [Technology Stack](#technology-stack)
- [Repository Structure](#repository-structure)
- [Installation](#installation)
- [API Overview](#api-overview)
- [Roadmap](#roadmap)
- [Buildathon Information](#buildathon-information)
- [License](#license)
- [Contributors](#contributors)

---

## About the Project

Most people lose their warranty cards, receipts, and product documentation within weeks of purchasing a product. When something breaks, they have no proof of purchase, no warranty card, and no service history — leading to denied warranty claims and avoidable repair costs.

WarrantyVault solves this by providing a dedicated, secure, mobile-first platform where every ownership document is stored, organized, and accessible from a single app. The platform automatically tracks warranty expiry dates and notifies users before their coverage lapses.

---

## Features

**Product Management**
- Add products with name, brand, model, category, purchase date, price, store, and serial number
- Set warranty period and track expiry dates automatically
- Soft-delete products to preserve historical data
- Full-text search across product name, brand, and model

**Document Storage**
- Upload receipts, warranty cards, product photos, and PDF manuals
- Files stored securely on Cloudinary CDN
- Per-product document library with type labeling
- Cloudinary public_id stored for secure deletion

**Service History**
- Log every repair, maintenance, and inspection event
- Record service provider, cost, description, and next service date
- Attach documents to service records
- View full service timeline per product

**Warranty Expiry Notifications**
- Automatic notifications for warranties expiring within 30 days
- Notification center with read/unread state management
- Per-user notification preferences

**Dashboard**
- Summary of total products, documents, and expiring warranties
- Expiring-soon section
- Recently added products

**Security**
- JWT authentication with 7-day token expiry
- Passwords hashed with bcrypt (cost factor 12)
- Input validation on every endpoint
- Rate limiting on authentication routes
- Security headers via Helmet

---

## Architecture

```
Flutter Android App
        |
        | HTTPS REST API
        |
Node.js / Express API Server
        |
   +----+----+
   |         |
MongoDB    Cloudinary
Atlas      (Files)
(Data)
```

The Flutter application communicates exclusively with the Express REST API over HTTPS. The API layer handles authentication, business logic, validation, and orchestration. Persistent data is stored in MongoDB Atlas. Binary files (images and PDFs) are stored in Cloudinary and referenced in MongoDB by URL and public_id.

For a detailed architecture breakdown see [docs/architecture.md](docs/architecture.md).

---

## Technology Stack

| Layer | Technology |
|---|---|
| Mobile Frontend | Flutter (Dart) |
| State Management | Provider |
| HTTP Client | Dio |
| Local Storage | SharedPreferences |
| Backend Framework | Node.js + Express |
| Database | MongoDB Atlas |
| ODM | Mongoose |
| File Storage | Cloudinary |
| Authentication | JWT (jsonwebtoken) |
| Password Hashing | bcrypt |
| Validation | Joi |
| Environment | dotenv |

For full technology justification see [docs/tech-stack.md](docs/tech-stack.md).

---

## Repository Structure

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
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── models/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── utils/
│   │   ├── validators/
│   │   └── config/
│   ├── tests/
│   └── .env.example
├── mobile/
│   └── warranty_vault/
│       ├── lib/
│       │   ├── core/
│       │   ├── features/
│       │   └── shared/
│       └── assets/
└── assets/
    ├── images/
    ├── icons/
    └── fonts/
```

---

## Installation

Implementation begins on Day 2 (August 3, 2026). Complete setup and installation instructions will be added after the backend and Flutter app are initialized.

**Backend prerequisites:** Node.js 20+, MongoDB Atlas account, Cloudinary account.

**Mobile prerequisites:** Flutter SDK, Android Studio, Android SDK.

---

## API Overview

All endpoints are prefixed with `/api/v1`.

| Resource | Methods |
|---|---|
| Authentication | POST /auth/register, POST /auth/login, POST /auth/logout, GET /auth/me |
| Products | GET, POST /products — GET, PUT, DELETE /products/:id |
| Documents | GET, POST /products/:id/documents — DELETE /products/:id/documents/:docId |
| Service History | GET, POST /products/:id/service-history — GET, PUT, DELETE /products/:id/service-history/:recordId |
| Notifications | GET /notifications — PUT /notifications/:id/read — PUT /notifications/read-all |
| Dashboard | GET /dashboard |

For the complete API specification including request and response schemas see [docs/api-design.md](docs/api-design.md).

---

## Roadmap

**Day 1 (August 2, 2026) — Current**
- Repository structure and organization
- Complete technical documentation
- Database design
- API design
- Flutter folder planning
- Backend folder scaffolding
- Day 2 implementation plan

**Day 2 (August 3, 2026) — Planned**
- Backend: Node.js/Express initialization
- Backend: MongoDB Atlas connection
- Backend: JWT authentication system
- Backend: Product, Document, Service History, Notification APIs
- Mobile: Flutter project initialization
- Mobile: Authentication screens
- Mobile: Product management screens
- Mobile: Document upload with camera/gallery
- Mobile: Dashboard, Notifications, Settings
- End-to-end integration testing

**Future (Post-Buildathon)**
- Web portal for desktop access
- AI-based receipt parsing (extract product info automatically)
- Barcode/QR code scanner for product registration
- Multi-user household accounts
- Warranty claim assistance workflow
- Export ownership records to PDF
- Insurance company integrations
- Scheduled service reminders

---

## Buildathon Information

- **Event:** Buildathon
- **Project:** WarrantyVault
- **Start Date:** August 2, 2026
- **Repository:** https://github.com/Alex07lol/Buildathon

---

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.

---

## Contributors

- Alex — Lead Developer
