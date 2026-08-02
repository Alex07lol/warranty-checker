# Software Requirements Specification

## Overview

This document defines all functional and non-functional requirements for the WarrantyVault buildathon release. These requirements govern what the system must do and how it must perform. They serve as the primary reference for implementation decisions on Day 2.

---

## Functional Requirements

### Module 1: Authentication

| ID | Requirement |
|---|---|
| FR-AUTH-01 | The system shall allow a new user to register with a full name, email address, and password. |
| FR-AUTH-02 | The system shall reject registration if the email address is already associated with an existing account. |
| FR-AUTH-03 | The system shall hash all passwords using bcrypt with a cost factor of 12 before storage. Plaintext passwords shall never be stored. |
| FR-AUTH-04 | The system shall issue a signed JWT upon successful registration and login. |
| FR-AUTH-05 | The JWT shall expire after 7 days. |
| FR-AUTH-06 | The system shall allow a registered user to log in with their email and password. |
| FR-AUTH-07 | The system shall reject login attempts with incorrect credentials without revealing which field is incorrect. |
| FR-AUTH-08 | The system shall allow an authenticated user to retrieve their own profile information. |
| FR-AUTH-09 | The system shall allow an authenticated user to change their password by providing the current password and a new password. |
| FR-AUTH-10 | The system shall reject requests to protected endpoints that do not include a valid JWT in the Authorization header. |

### Module 2: Product Management

| ID | Requirement |
|---|---|
| FR-PROD-01 | The system shall allow an authenticated user to create a product record with the following fields: productName (required), brand, model, category, purchaseDate, purchasePrice, currency, purchaseStore, serialNumber, warrantyPeriodMonths, warrantyExpiryDate, notes. |
| FR-PROD-02 | The system shall automatically calculate warrantyExpiryDate from purchaseDate and warrantyPeriodMonths when both are provided and warrantyExpiryDate is not explicitly set. |
| FR-PROD-03 | The system shall return only products belonging to the authenticated user. |
| FR-PROD-04 | The system shall allow an authenticated user to view a list of all their active (non-deleted) products. |
| FR-PROD-05 | The system shall allow an authenticated user to view the complete details of a single product. |
| FR-PROD-06 | The system shall allow an authenticated user to update any field on a product they own. |
| FR-PROD-07 | The system shall allow an authenticated user to soft-delete a product by setting the isDeleted flag to true. Soft-deleted products shall be excluded from all list and search queries. |
| FR-PROD-08 | The system shall allow an authenticated user to search products by name, brand, or model using full-text search. |
| FR-PROD-09 | The system shall provide an endpoint that returns all products whose warrantyExpiryDate falls within the next 30 days, sorted by expiry date ascending. |
| FR-PROD-10 | The system shall reject requests to view, edit, or delete a product that does not belong to the authenticated user with a 403 response. |

### Module 3: Document Management

| ID | Requirement |
|---|---|
| FR-DOC-01 | The system shall allow an authenticated user to upload a file associated with a specific product. |
| FR-DOC-02 | Supported file types for upload shall be: JPEG, PNG, WEBP, and PDF. All other file types shall be rejected. |
| FR-DOC-03 | The maximum file size for upload shall be 10MB. Files exceeding this limit shall be rejected. |
| FR-DOC-04 | Uploaded files shall be stored on Cloudinary. The returned URL and public_id shall be stored in the documents collection in MongoDB. |
| FR-DOC-05 | Cloudinary folder structure for uploads shall follow the pattern: `warrantyvault/{userId}/{productId}/{documentType}`. |
| FR-DOC-06 | The documentType field shall be required for every upload and must be one of: receipt, warranty_card, product_photo, manual, other. |
| FR-DOC-07 | The system shall allow an authenticated user to view all documents associated with a specific product they own. |
| FR-DOC-08 | The system shall allow an authenticated user to retrieve a single document record by ID. |
| FR-DOC-09 | The system shall allow an authenticated user to delete a document. On deletion, the system shall destroy the corresponding Cloudinary asset using the stored public_id, then delete the database record. |
| FR-DOC-10 | Users shall not be able to access documents associated with products they do not own. |

### Module 4: Service History

| ID | Requirement |
|---|---|
| FR-SVC-01 | The system shall allow an authenticated user to add a service record to a product they own. |
| FR-SVC-02 | A service record shall capture: serviceDate (required), serviceType (required), serviceProvider, cost, currency, description, documentIds (array), and nextServiceDate. |
| FR-SVC-03 | serviceType shall be one of: repair, maintenance, inspection, replacement, other. |
| FR-SVC-04 | The system shall allow an authenticated user to view all service history records for a specific product, sorted by serviceDate descending. |
| FR-SVC-05 | The system shall allow an authenticated user to view a single service history record by ID. |
| FR-SVC-06 | The system shall allow an authenticated user to update a service history record. |
| FR-SVC-07 | The system shall allow an authenticated user to delete a service history record permanently. |
| FR-SVC-08 | Users shall not be able to access service records for products they do not own. |

### Module 5: Notifications

| ID | Requirement |
|---|---|
| FR-NOTIF-01 | The system shall generate notification records for products whose warrantyExpiryDate falls within the notification preference windows (30, 7, and 1 day before expiry by default). |
| FR-NOTIF-02 | Notification types shall include: expiry_warning, expiry_today, service_reminder. |
| FR-NOTIF-03 | The system shall allow an authenticated user to retrieve all their notifications, with unread notifications distinguished from read. |
| FR-NOTIF-04 | The system shall allow an authenticated user to mark a single notification as read. |
| FR-NOTIF-05 | The system shall allow an authenticated user to mark all their notifications as read in a single request. |
| FR-NOTIF-06 | The system shall allow an authenticated user to delete a notification. |
| FR-NOTIF-07 | The notification list response shall include the count of unread notifications. |

### Module 6: Dashboard

| ID | Requirement |
|---|---|
| FR-DASH-01 | The system shall provide a single dashboard endpoint that returns aggregated data for the authenticated user. |
| FR-DASH-02 | The dashboard response shall include: total product count, count of products expiring within 30 days, total document count, unread notification count. |
| FR-DASH-03 | The dashboard response shall include the 5 most recently added products. |
| FR-DASH-04 | The dashboard response shall include the list of products expiring within 30 days, sorted by expiry date ascending. |

---

## Non-Functional Requirements

### Performance

| ID | Requirement |
|---|---|
| NFR-PERF-01 | API response time for read endpoints shall not exceed 500ms under normal load conditions. |
| NFR-PERF-02 | File upload response time shall not exceed 5 seconds for files up to 5MB. |
| NFR-PERF-03 | The Flutter application shall not block the main thread during network operations. All API calls shall be asynchronous. |
| NFR-PERF-04 | Cached images shall be served from local cache after the first load to reduce perceived loading time. |

### Security

| ID | Requirement |
|---|---|
| NFR-SEC-01 | All API communication shall use HTTPS in production. |
| NFR-SEC-02 | Passwords shall be hashed with bcrypt at a cost factor of 12. |
| NFR-SEC-03 | JWT secrets shall be stored in environment variables and never committed to version control. |
| NFR-SEC-04 | Authentication endpoints shall be rate-limited to a maximum of 10 requests per 15 minutes per IP address. |
| NFR-SEC-05 | All user inputs shall be validated and sanitized before processing to prevent injection attacks. |
| NFR-SEC-06 | CORS shall be configured to restrict access to expected origins only. |
| NFR-SEC-07 | API keys and credentials for Cloudinary and MongoDB shall be stored in environment variables only. |
| NFR-SEC-08 | Server-side error details shall not be exposed in API responses in production. Generic messages shall be returned for 500 errors. |

### Scalability

| ID | Requirement |
|---|---|
| NFR-SCAL-01 | The Express API shall be stateless to allow horizontal scaling. |
| NFR-SCAL-02 | The MongoDB Atlas tier shall be upgradeable to higher capacity without application code changes. |

### Availability

| ID | Requirement |
|---|---|
| NFR-AVAIL-01 | The API shall handle unhandled exceptions gracefully with a centralized error handler, preventing server crashes from individual request failures. |
| NFR-AVAIL-02 | The Flutter application shall display appropriate error states for network failures without crashing. |

### Usability

| ID | Requirement |
|---|---|
| NFR-USE-01 | All form fields shall display inline validation errors before form submission. |
| NFR-USE-02 | All asynchronous operations shall display a loading indicator while in progress. |
| NFR-USE-03 | All error responses from the API shall be translated into human-readable messages for display in the Flutter application. |
| NFR-USE-04 | Touch targets shall maintain a minimum size of 48dp by 48dp. |
| NFR-USE-05 | Empty states shall be displayed for all list screens when no data exists. |

### Reliability

| ID | Requirement |
|---|---|
| NFR-REL-01 | File deletion shall be atomic: the Cloudinary asset shall be destroyed before the database record is deleted. If the Cloudinary deletion fails, the database record shall not be deleted. |
| NFR-REL-02 | Database writes shall use Mongoose's built-in validation to prevent invalid data from being stored. |

---

## Technical Constraints

| Constraint | Detail |
|---|---|
| Mobile Platform | Android only. Minimum SDK: API 21 (Android 5.0). |
| Mobile Framework | Flutter with Dart. |
| Backend Runtime | Node.js 20 or later. |
| Backend Framework | Express.js. |
| Database | MongoDB Atlas. No local MongoDB for production. |
| File Storage | Cloudinary. No local file storage for production assets. |
| Authentication | JWT. No OAuth, sessions, or third-party identity providers. |
| Programming Language (Backend) | JavaScript (Node.js). |
| Programming Language (Mobile) | Dart (Flutter). |

---

## Assumptions

1. The backend and Flutter app will run on the same local network during buildathon testing.
2. The Android device or emulator used for testing will have a camera available.
3. The MongoDB Atlas M0 free tier provides sufficient storage and throughput for buildathon scope.
4. The Cloudinary free tier provides sufficient upload bandwidth and storage for buildathon scope.
5. All developers have Node.js 20+, Flutter SDK, and Android Studio installed before Day 2 begins.
6. Internet connectivity is available throughout Day 2 for MongoDB Atlas and Cloudinary access.

---

## Dependencies

| Dependency | Purpose | Managed By |
|---|---|---|
| MongoDB Atlas | Cloud database hosting | External service |
| Cloudinary | Image and PDF storage and CDN | External service |
| Express.js npm package | HTTP server framework | npm |
| Mongoose npm package | MongoDB ODM | npm |
| jsonwebtoken npm package | JWT signing and verification | npm |
| bcryptjs npm package | Password hashing | npm |
| Joi npm package | Request validation | npm |
| multer npm package | Multipart file handling | npm |
| multer-storage-cloudinary npm package | Cloudinary storage adapter for multer | npm |
| cors npm package | CORS middleware | npm |
| express-rate-limit npm package | Rate limiting middleware | npm |
| helmet npm package | Security headers middleware | npm |
| dotenv npm package | Environment variable loading | npm |
| dio Flutter package | HTTP client | pub.dev |
| provider Flutter package | State management | pub.dev |
| shared_preferences Flutter package | Local JWT storage | pub.dev |
| image_picker Flutter package | Camera and gallery access | pub.dev |
| file_picker Flutter package | PDF file selection | pub.dev |
| google_fonts Flutter package | Typography | pub.dev |
