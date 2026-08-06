# WarrantyVault

A web-based digital ownership platform. WarrantyVault lets users securely store receipts, warranty cards, product photos, manuals, serial numbers, and service history for every product they own — all in one place, with automatic expiry tracking and in-app notifications.

> **Note (August 2026):** the project is now **web-only**. The Flutter/Android app was removed; the frontend is a web app served by the API. The old mobile code is recoverable from git history.

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

WarrantyVault solves this by providing a dedicated, secure, web platform where every ownership document is stored, organized, and accessible from a single app. The platform automatically tracks warranty expiry dates and notifies users before their coverage lapses.

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
Web Browser (HTML/CSS/JS frontend)
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

The web frontend — served statically from `API/backend/public/` by the Express API — communicates with the REST API over HTTPS. The API layer handles authentication, business logic, validation, and orchestration. Persistent data is stored in MongoDB Atlas. Binary files (images and PDFs) are stored in Cloudinary and referenced in MongoDB by URL and public_id.

For a detailed architecture breakdown see [docs/architecture.md](docs/architecture.md).

---

## Technology Stack

| Layer | Technology |
|---|---|
| Web Frontend | HTML/CSS/JS (served by the Express API) |
| Backend Framework | Node.js + Express |
| Database | MongoDB Atlas |
| ODM | Mongoose |
| File Storage | Cloudinary |
| Authentication | JWT (jsonwebtoken) |
| Password Hashing | bcrypt |
| Validation | Joi |
| OCR | tesseract.js |
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
├── API/
│   ├── backend/
│   │   ├── src/
│   │   │   ├── controllers/
│   │   │   ├── middleware/
│   │   │   ├── models/
│   │   │   ├── routes/
│   │   │   ├── services/
│   │   │   ├── utils/
│   │   │   ├── validators/
│   │   │   └── config/
│   │   ├── public/
│   │   │   └── index.html   (web frontend)
│   │   ├── scripts/
│   │   ├── tests/
│   │   └── .env.example
│   └── docs/
└── assets/
    ├── images/
    ├── icons/
    └── fonts/
```

---

## Installation

**Backend prerequisites:** Node.js 20+, MongoDB Atlas account, Cloudinary account (for file uploads/OCR).

**Run the full demo (no database install needed):**

```bash
cd API/backend
npm install
npm run demo          # in-memory MongoDB + real Cloudinary from .env
# open http://localhost:5000
```

The web frontend requires no build step — it is served directly by the API.

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

**Day 1 (August 2, 2026) — Done**
- Repository structure and organization
- Complete technical documentation
- Database design and API design
- Backend folder scaffolding

**Day 2 (August 3–6, 2026) — Done**
- Backend: Node.js/Express + MongoDB Atlas + Cloudinary (JWT auth, products, documents, service history, notifications, dashboard)
- OCR: tesseract.js receipt/warranty-card parsing with auto-fill (async after upload + retry endpoint)
- Tests: 60+ integration tests, CI workflow, smoke script
- Web frontend served from `API/backend/public/`
- **Pivot (Aug 6):** web-only — the Flutter/Android app was removed (recoverable in git history)

**Next**
- Replace the static demo page with a real web app wired to the API (products CRUD, document upload + OCR status, dashboard)
- Deploy backend (Render/Railway) with real Atlas + Cloudinary env vars

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
