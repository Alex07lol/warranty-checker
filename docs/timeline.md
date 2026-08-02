# Project Timeline

## Overview

WarrantyVault is a 2-day buildathon project. Day 1 focuses on planning and documentation to ensure a solid foundation. Day 2 is dedicated to the full implementation of both the backend and frontend systems.

## Day 1: Planning and Documentation (August 2, 2026)

The primary goal of Day 1 is to define the project scope, design the architecture, and establish the repository structure.

### Schedule Breakdown

| Time | Activity |
|---|---|
| 09:00 - 10:00 | Project ideation, team alignment, technology decisions |
| 10:00 - 11:00 | Repository setup, folder structure creation |
| 11:00 - 12:00 | Architecture design, database design |
| 12:00 - 13:00 | API endpoint design, documentation writing |
| 13:00 - 14:00 | User flow documentation, wireframe descriptions |
| 14:00 - 15:00 | Technology stack documentation, coding standards |
| 15:00 - 16:00 | Day 2 implementation plan writing |
| 16:00 - 17:00 | Review, Git commits, push to GitHub |

### Day 1 Deliverables

- Complete documentation suite in `docs/`
- Initialized repository structure with all directories
- All markdown documentation files
- Root `README.md` rewritten from scratch
- `.gitignore` covering Node.js, Flutter, and IDE files
- `LICENSE` file
- `.github/` with PR template, issue templates, and CI workflow
- `backend/.env.example` with all required variables
- Backend `src/` folder scaffolding with `.gitkeep` files

## Day 2: Implementation (August 3, 2026)

Day 2 shifts focus to executing the plan, building out the API, and developing the mobile application.

### Implementation Blocks

| Hours | Activity |
|---|---|
| 1 - 2 | Backend project initialization, MongoDB connection, environment setup |
| 3 - 4 | Authentication system: JWT, bcrypt, register, login |
| 5 - 6 | Product API: CRUD endpoints and data validation |
| 7 - 8 | Document upload API: Cloudinary integration with multer |
| 9 - 10 | Service History and Notifications API |
| 11 - 12 | Flutter project initialization, navigation setup, auth screens |
| 13 - 14 | Flutter product screens |
| 15 - 16 | Flutter document upload, camera and gallery integration |
| 17 - 18 | End-to-end integration testing, bug fixing, demo preparation |

### Day 2 Deliverables

A fully functional Flutter Android application connected to a live Node.js/Express API backed by a MongoDB Atlas database, with file storage on Cloudinary.

## Risk Register

| Risk | Likelihood | Impact | Mitigation Strategy |
|---|---|---|---|
| MongoDB Atlas connection issues | Medium | High | Configure IP whitelist to 0.0.0.0/0 for development. Verify connection string format. |
| Cloudinary upload limits | Low | Medium | Monitor usage dashboard. Compress images client-side before upload. |
| Flutter Android build errors | Medium | High | Lock dependency versions in pubspec.yaml. Run flutter clean between builds. |
| JWT implementation bugs | Medium | High | Use proven libraries. Test auth endpoints in Postman in isolation before frontend integration. |
| Time overruns | High | High | Prioritize auth and product CRUD first. Treat notifications as a secondary objective if time is short. |
| Android permissions issues | Medium | Medium | Test on physical device early in Day 2. Handle permission_handler responses correctly. |

## Milestones

| Milestone | Description | Target Time |
|---|---|---|
| 1. Planning Complete | All Day 1 documentation merged to main | Day 1, 17:00 |
| 2. Backend Foundation | Express server running and connected to MongoDB | Day 2, Hour 2 |
| 3. Auth API Ready | Register, login, JWT validation all working and tested | Day 2, Hour 4 |
| 4. Core API Ready | Product CRUD endpoints tested and functional | Day 2, Hour 6 |
| 5. API Feature Complete | Document upload, service history, notifications all working | Day 2, Hour 10 |
| 6. Flutter Foundation | Flutter app routing and auth screens ready | Day 2, Hour 12 |
| 7. Core App Flow | User can manage products via the mobile app | Day 2, Hour 14 |
| 8. App Feature Complete | Document upload and service history functional in app | Day 2, Hour 16 |
| 9. Project Delivery | All systems tested, integrated, and ready for demonstration | Day 2, Hour 18 |
