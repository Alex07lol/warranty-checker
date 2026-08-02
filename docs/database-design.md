# Database Design

## Overview

The system uses MongoDB Atlas with a single database named `warrantyvault_db`. The database comprises five collections: users, products, documents, servicehistory, and notifications.

---

## Collection 1: users

### Purpose

Stores all registered user accounts and their notification preferences.

### Fields

| Field | Type | Required | Description |
|---|---|---|---|
| _id | ObjectId | Yes | Unique identifier for the user. |
| name | String | Yes | Full name of the user. |
| email | String | Yes | Unique email address used for login. |
| passwordHash | String | Yes | Bcrypt hashed password. |
| createdAt | Date | Yes | Timestamp of account creation. |
| updatedAt | Date | Yes | Timestamp of last account update. |
| isActive | Boolean | Yes | Flag indicating whether the account is active. Defaults to true. |
| profilePicture | String | No | Cloudinary URL to the user's profile image. |
| notificationPreferences | Object | Yes | Container for user alert preferences. |
| notificationPreferences.expiryAlerts | Boolean | Yes | Whether the user has opted in to warranty expiry alerts. |
| notificationPreferences.reminderDays | Array of Number | Yes | Days before expiry on which to trigger alerts. Example: [30, 7, 1]. |

### Indexes

- Unique index on `email` to enforce one account per email address.
- Index on `createdAt` for sorting and basic analytics queries.

### Validation Rules

- `email` must match a valid RFC 5322 email address pattern.
- `passwordHash` must be a non-empty string. It is set by the service layer after bcrypt processing and never accepted directly from user input.
- `name` requires a minimum of 2 characters and a maximum of 100 characters.
- `notificationPreferences.reminderDays` values must be positive integers.

### Relationships

One user has many products. The relationship is established via a `userId` foreign key field stored in the `products` collection.

---

## Collection 2: products

### Purpose

Represents a physical product owned by the user. This is the central entity in the system. All documents and service history records are associated with a product.

### Fields

| Field | Type | Required | Description |
|---|---|---|---|
| _id | ObjectId | Yes | Unique identifier for the product. |
| userId | ObjectId | Yes | Reference to the owning user. |
| productName | String | Yes | Name of the product. |
| brand | String | No | Brand or manufacturer. |
| model | String | No | Specific model number or name. |
| category | String | No | Classification of the product (e.g., Electronics, Appliances). |
| purchaseDate | Date | No | Date the product was acquired. |
| purchasePrice | Number | No | Cost of the product at time of purchase. |
| currency | String | No | Currency code for the purchase price (e.g., INR, USD). |
| purchaseStore | String | No | Retailer or platform where the product was purchased. |
| serialNumber | String | No | Product serial number. |
| warrantyExpiryDate | Date | No | Calculated or manually entered warranty end date. |
| warrantyPeriodMonths | Number | No | Duration of the warranty in months. |
| notes | String | No | Free-form notes about the product. |
| createdAt | Date | Yes | Timestamp of record creation. |
| updatedAt | Date | Yes | Timestamp of last record modification. |
| isDeleted | Boolean | Yes | Soft delete flag. Defaults to false. Deleted products are excluded from all queries via this flag. |
| thumbnailUrl | String | No | Cloudinary URL to a primary product image. |

### Indexes

- Index on `userId` to optimize queries that retrieve all products belonging to a user.
- Index on `warrantyExpiryDate` to support fast queries for products with upcoming or past expiry dates.
- Compound index on `userId` and `isDeleted` to efficiently retrieve the active product list for any given user.
- Text index on `productName`, `brand`, and `model` to support full-text search across these fields.

### Validation Rules

- `userId` must be a valid ObjectId referencing a document in the `users` collection.
- `productName` is required and must have a minimum length of 1 character.
- `purchaseDate` must be a valid date and must not be set in the future.
- `warrantyExpiryDate` must be chronologically after `purchaseDate` when both values are provided.
- `purchasePrice` must be a non-negative number when provided.
- `warrantyPeriodMonths` must be a positive integer when provided.

### Relationships

Belongs to one user. Has many documents stored in the `documents` collection. Has many service records in the `servicehistory` collection.

---

## Collection 3: documents

### Purpose

Stores metadata for every uploaded file associated with a product. Supported document types include receipts, warranty cards, product photos, and PDF manuals. Binary file content is stored on Cloudinary. This collection holds only the reference metadata.

### Fields

| Field | Type | Required | Description |
|---|---|---|---|
| _id | ObjectId | Yes | Unique identifier for the document record. |
| productId | ObjectId | Yes | Reference to the associated product. |
| userId | ObjectId | Yes | Reference to the user who uploaded the document. |
| documentType | String | Yes | Categorization of the file. Enum: receipt, warranty_card, product_photo, manual, other. |
| fileName | String | Yes | Original filename of the uploaded file. |
| fileUrl | String | Yes | Direct HTTPS URL to the asset on Cloudinary. |
| publicId | String | Yes | Cloudinary public identifier used to manage or delete the asset. |
| fileSize | Number | Yes | File size in bytes. |
| mimeType | String | Yes | MIME type of the file. |
| uploadedAt | Date | Yes | Timestamp of the upload. |
| notes | String | No | Optional context or description about the document. |

### Indexes

- Index on `productId` to retrieve all documents belonging to a specific product.
- Index on `userId` to support user-centric document queries.
- Index on `documentType` to filter documents by category across a user's portfolio.

### Validation Rules

- `documentType` must be one of: `receipt`, `warranty_card`, `product_photo`, `manual`, `other`.
- `fileUrl` must be a non-empty string in valid URL format.
- `fileSize` must be a positive number.
- `mimeType` must be one of: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`.

### Relationships

Belongs to one product and one user.

---

## Collection 4: servicehistory

### Purpose

Tracks all service, repair, maintenance, and inspection events for a specific product. Provides a chronological service log.

### Fields

| Field | Type | Required | Description |
|---|---|---|---|
| _id | ObjectId | Yes | Unique identifier for the service record. |
| productId | ObjectId | Yes | Reference to the serviced product. |
| userId | ObjectId | Yes | Reference to the user who owns the product. |
| serviceDate | Date | Yes | Date the service was performed. |
| serviceType | String | Yes | Categorization of the service event. Enum: repair, maintenance, inspection, replacement, other. |
| serviceProvider | String | No | Name of the technician, shop, or provider. |
| cost | Number | No | Total cost incurred for the service. |
| currency | String | No | Currency code for the cost. |
| description | String | No | Detailed description of work performed. |
| documentIds | Array of ObjectId | No | References to related documents in the `documents` collection. |
| nextServiceDate | Date | No | Recommended or scheduled date for the next service event. |
| createdAt | Date | Yes | Timestamp of record creation. |
| updatedAt | Date | Yes | Timestamp of last modification. |

### Indexes

- Index on `productId` to retrieve the full service history of a product.
- Index on `userId` to aggregate service records across all products owned by a user.
- Index on `serviceDate` to support chronological sorting and timeline views.

### Validation Rules

- `serviceDate` is required and must be a valid date.
- `cost` must be a non-negative number when provided.
- `serviceType` must be one of: `repair`, `maintenance`, `inspection`, `replacement`, `other`.
- Each element in `documentIds` must be a valid ObjectId.

### Relationships

Belongs to one product. May reference multiple documents in the `documents` collection.

---

## Collection 5: notifications

### Purpose

Stores pending and dispatched notifications for warranty expiry alerts and service reminders. Supports both in-app notification display and scheduled dispatch by a background worker.

### Fields

| Field | Type | Required | Description |
|---|---|---|---|
| _id | ObjectId | Yes | Unique identifier for the notification. |
| userId | ObjectId | Yes | Reference to the target user. |
| productId | ObjectId | Yes | Reference to the product triggering the notification. |
| notificationType | String | Yes | Categorization. Enum: expiry_warning, expiry_today, service_reminder. |
| title | String | Yes | Short notification title. |
| message | String | Yes | Detailed notification body. |
| isRead | Boolean | Yes | Whether the user has read the notification. Defaults to false. |
| isSent | Boolean | Yes | Whether the notification has been dispatched. Defaults to false. |
| scheduledAt | Date | Yes | Date and time the notification is scheduled to be sent. |
| sentAt | Date | No | Timestamp of actual dispatch. Null until sent. |
| createdAt | Date | Yes | Timestamp of record creation. |

### Indexes

- Index on `userId` to fetch a user's notification inbox.
- Compound index on `userId` and `isRead` to efficiently retrieve unread notifications for a user.
- Index on `scheduledAt` to support background worker queries for notifications due to be dispatched.
- Index on `isSent` to distinguish pending notifications from dispatched ones.

### Validation Rules

- `notificationType` must be one of: `expiry_warning`, `expiry_today`, `service_reminder`.
- `scheduledAt` is required and must be a valid date.
- `title` must be a non-empty string.
- `message` must be a non-empty string.

### Relationships

Belongs to one user and one product.

---

## Data Integrity Strategy

Referential integrity is enforced at the application layer within the Node.js API. Mongoose validation schemas check that ObjectId references are structurally valid before writes. Cascading deletes are handled in the service layer: when a product is deleted, the service layer also removes or soft-deletes associated documents and service history records. Soft deletes via the `isDeleted` flag are the preferred approach for products, preserving audit trails and enabling potential data recovery. Hard deletes are used for documents only after successfully deleting the corresponding Cloudinary asset.

## Indexing Strategy

Indexes are selected based on the primary query patterns of the application:

- Foreign key indexes (`userId`, `productId`) are applied universally because every query operates within the scope of a user or a product.
- Compound indexes are used where queries filter on two fields simultaneously (e.g., active products for a user: `userId` + `isDeleted`).
- Date field indexes (`warrantyExpiryDate`, `scheduledAt`, `serviceDate`) support time-based queries without full collection scans.
- A text index on product fields enables keyword search without requiring a dedicated search service.
- The `isSent` and `isRead` indexes on notifications support frequent filtering by status.

## Connection and Environment

The application connects to a MongoDB Atlas M0 free tier cluster. The connection string, including credentials, is injected exclusively via the `MONGO_URI` environment variable and is never committed to version control. Mongoose manages a connection pool configured for the concurrency requirements of the Express application. The pool is initialized once at application startup and reused across all requests.
