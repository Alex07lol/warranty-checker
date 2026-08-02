# API Design Specification

## Base URL

```
/api/v1
```

All endpoints are prefixed with `/api/v1`. In local development the full base URL is `http://localhost:5000/api/v1`.

## Authentication Strategy

JWT Bearer Token authentication is used for all protected endpoints. The client must include the token in the `Authorization` header on every protected request.

```
Authorization: Bearer <token>
```

Tokens are signed with the server's `JWT_SECRET` and expire after 7 days. On expiry the client must prompt the user to log in again.

## Standard Response Format

All successful responses follow this envelope structure:

```json
{
  "success": true,
  "message": "Human-readable success message",
  "data": {}
}
```

All error responses follow this structure:

```json
{
  "success": false,
  "message": "Human-readable error message",
  "errors": []
}
```

The `errors` array contains an array of strings describing each validation or processing error. It is empty for non-validation errors.

## HTTP Status Codes

| Code | Meaning | When Used |
|---|---|---|
| 200 | OK | Successful GET, PUT, PATCH, DELETE |
| 201 | Created | Successful POST that creates a resource |
| 400 | Bad Request | Malformed request syntax |
| 401 | Unauthorized | Missing or invalid JWT token |
| 403 | Forbidden | Valid token but insufficient permissions |
| 404 | Not Found | Resource does not exist |
| 409 | Conflict | Duplicate resource (e.g., email already registered) |
| 422 | Unprocessable Entity | Validation failed |
| 500 | Internal Server Error | Unexpected server-side error |

---

## Auth Endpoints

### POST /api/v1/auth/register

**Purpose:** Register a new user account.

**Auth Required:** No

**Request Body:**

| Field | Type | Required | Description |
|---|---|---|---|
| name | String | Yes | Full name. Min 2 characters, max 100. |
| email | String | Yes | Valid email address. |
| password | String | Yes | Min 8 characters. |
| confirmPassword | String | Yes | Must match password. |

**Response Body (201):**

```json
{
  "success": true,
  "message": "Registration successful",
  "data": {
    "token": "eyJhbGci...",
    "user": {
      "_id": "64f1a2b3c4d5e6f7a8b9c0d1",
      "name": "Alex",
      "email": "alex@example.com",
      "createdAt": "2026-08-03T09:00:00.000Z"
    }
  }
}
```

**Error Responses:**

| Status | Message |
|---|---|
| 409 | Email address is already registered |
| 422 | Validation failed (array of field errors) |
| 500 | Internal server error |

---

### POST /api/v1/auth/login

**Purpose:** Authenticate an existing user and receive a JWT.

**Auth Required:** No

**Request Body:**

| Field | Type | Required | Description |
|---|---|---|---|
| email | String | Yes | Registered email address. |
| password | String | Yes | Account password. |

**Response Body (200):**

```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "eyJhbGci...",
    "user": {
      "_id": "64f1a2b3c4d5e6f7a8b9c0d1",
      "name": "Alex",
      "email": "alex@example.com"
    }
  }
}
```

**Error Responses:**

| Status | Message |
|---|---|
| 401 | Invalid email or password |
| 422 | Validation failed |
| 500 | Internal server error |

---

### POST /api/v1/auth/logout

**Purpose:** Signals logout intent. Token invalidation is handled client-side by deleting the stored JWT. The server returns a success response.

**Auth Required:** Yes

**Request Body:** None

**Response Body (200):**

```json
{
  "success": true,
  "message": "Logged out successfully",
  "data": null
}
```

---

### GET /api/v1/auth/me

**Purpose:** Retrieve the authenticated user's profile.

**Auth Required:** Yes

**Request Body:** None

**Response Body (200):**

```json
{
  "success": true,
  "message": "User profile retrieved",
  "data": {
    "_id": "64f1a2b3c4d5e6f7a8b9c0d1",
    "name": "Alex",
    "email": "alex@example.com",
    "createdAt": "2026-08-03T09:00:00.000Z",
    "notificationPreferences": {
      "expiryAlerts": true,
      "reminderDays": [30, 7, 1]
    }
  }
}
```

**Error Responses:**

| Status | Message |
|---|---|
| 401 | Unauthorized |
| 500 | Internal server error |

---

### PUT /api/v1/auth/change-password

**Purpose:** Update the authenticated user's password.

**Auth Required:** Yes

**Request Body:**

| Field | Type | Required | Description |
|---|---|---|---|
| currentPassword | String | Yes | The user's current password for verification. |
| newPassword | String | Yes | New password. Min 8 characters. |
| confirmNewPassword | String | Yes | Must match newPassword. |

**Response Body (200):**

```json
{
  "success": true,
  "message": "Password updated successfully",
  "data": null
}
```

**Error Responses:**

| Status | Message |
|---|---|
| 401 | Unauthorized |
| 400 | Current password is incorrect |
| 422 | Validation failed |
| 500 | Internal server error |

---

## Product Endpoints

### GET /api/v1/products

**Purpose:** Retrieve all active products for the authenticated user.

**Auth Required:** Yes

**Query Parameters:**

| Parameter | Type | Description |
|---|---|---|
| page | Number | Page number for pagination. Defaults to 1. |
| limit | Number | Results per page. Defaults to 20. |
| sortBy | String | Field to sort by. Defaults to createdAt. |
| order | String | asc or desc. Defaults to desc. |

**Response Body (200):**

```json
{
  "success": true,
  "message": "Products retrieved",
  "data": {
    "products": [
      {
        "_id": "64f1a2b3c4d5e6f7a8b9c0d2",
        "productName": "Samsung TV",
        "brand": "Samsung",
        "model": "QN55Q80C",
        "category": "Electronics",
        "purchaseDate": "2025-01-15T00:00:00.000Z",
        "warrantyExpiryDate": "2027-01-15T00:00:00.000Z",
        "thumbnailUrl": "https://res.cloudinary.com/...",
        "createdAt": "2026-08-03T09:15:00.000Z"
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 20
  }
}
```

---

### GET /api/v1/products/:id

**Purpose:** Retrieve a single product by ID.

**Auth Required:** Yes

**URL Parameters:** `id` — the product ObjectId.

**Response Body (200):** Full product object including all fields.

**Error Responses:**

| Status | Message |
|---|---|
| 401 | Unauthorized |
| 403 | Product does not belong to authenticated user |
| 404 | Product not found |
| 500 | Internal server error |

---

### POST /api/v1/products

**Purpose:** Create a new product.

**Auth Required:** Yes

**Request Body:**

| Field | Type | Required | Description |
|---|---|---|---|
| productName | String | Yes | Name of the product. |
| brand | String | No | Brand or manufacturer. |
| model | String | No | Model number or name. |
| category | String | No | Product category. |
| purchaseDate | Date | No | ISO 8601 date string. |
| purchasePrice | Number | No | Purchase cost. |
| currency | String | No | Currency code. |
| purchaseStore | String | No | Retailer name. |
| serialNumber | String | No | Serial number. |
| warrantyExpiryDate | Date | No | ISO 8601 date string. |
| warrantyPeriodMonths | Number | No | Warranty duration in months. |
| notes | String | No | Free-form notes. |

**Response Body (201):** Created product object.

**Error Responses:**

| Status | Message |
|---|---|
| 401 | Unauthorized |
| 422 | Validation failed |
| 500 | Internal server error |

---

### PUT /api/v1/products/:id

**Purpose:** Update an existing product.

**Auth Required:** Yes

**Request Body:** Same fields as POST, all optional.

**Response Body (200):** Updated product object.

**Error Responses:**

| Status | Message |
|---|---|
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Product not found |
| 422 | Validation failed |
| 500 | Internal server error |

---

### DELETE /api/v1/products/:id

**Purpose:** Soft-delete a product. Sets `isDeleted` to true. The product is excluded from all future queries.

**Auth Required:** Yes

**Response Body (200):**

```json
{
  "success": true,
  "message": "Product deleted",
  "data": null
}
```

**Error Responses:**

| Status | Message |
|---|---|
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Product not found |
| 500 | Internal server error |

---

### GET /api/v1/products/search?q=

**Purpose:** Full-text search across product name, brand, and model fields.

**Auth Required:** Yes

**Query Parameters:**

| Parameter | Type | Description |
|---|---|---|
| q | String | Search query string. |

**Response Body (200):** Array of matching product objects.

---

### GET /api/v1/products/expiring-soon

**Purpose:** Retrieve products whose warranty expires within the next 30 days.

**Auth Required:** Yes

**Response Body (200):** Array of product objects sorted by warrantyExpiryDate ascending.

---

## Document Endpoints

### GET /api/v1/products/:productId/documents

**Purpose:** Retrieve all documents associated with a specific product.

**Auth Required:** Yes

**Response Body (200):**

```json
{
  "success": true,
  "message": "Documents retrieved",
  "data": {
    "documents": [
      {
        "_id": "64f1a2b3c4d5e6f7a8b9c0d3",
        "documentType": "receipt",
        "fileName": "receipt_samsung_tv.jpg",
        "fileUrl": "https://res.cloudinary.com/...",
        "fileSize": 245678,
        "mimeType": "image/jpeg",
        "uploadedAt": "2026-08-03T10:00:00.000Z"
      }
    ]
  }
}
```

---

### POST /api/v1/products/:productId/documents

**Purpose:** Upload a new document for a product.

**Auth Required:** Yes

**Content-Type:** `multipart/form-data`

**Request Body:**

| Field | Type | Required | Description |
|---|---|---|---|
| file | File | Yes | The file to upload. Max 10MB. JPEG, PNG, WEBP, or PDF. |
| documentType | String | Yes | One of: receipt, warranty_card, product_photo, manual, other. |
| notes | String | No | Optional description. |

**Response Body (201):** Created document object.

**Error Responses:**

| Status | Message |
|---|---|
| 400 | File type not supported |
| 400 | File exceeds maximum size of 10MB |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Product not found |
| 422 | Validation failed |
| 500 | Internal server error |

---

### GET /api/v1/products/:productId/documents/:documentId

**Purpose:** Retrieve a single document record by ID.

**Auth Required:** Yes

**Response Body (200):** Full document object.

---

### DELETE /api/v1/products/:productId/documents/:documentId

**Purpose:** Delete a document. Removes the record from MongoDB and destroys the asset on Cloudinary using the stored public_id.

**Auth Required:** Yes

**Response Body (200):**

```json
{
  "success": true,
  "message": "Document deleted",
  "data": null
}
```

---

## Service History Endpoints

### GET /api/v1/products/:productId/service-history

**Purpose:** Retrieve all service history records for a product, sorted by serviceDate descending.

**Auth Required:** Yes

**Response Body (200):** Array of service history objects.

---

### POST /api/v1/products/:productId/service-history

**Purpose:** Add a service record to a product.

**Auth Required:** Yes

**Request Body:**

| Field | Type | Required | Description |
|---|---|---|---|
| serviceDate | Date | Yes | ISO 8601 date string. |
| serviceType | String | Yes | One of: repair, maintenance, inspection, replacement, other. |
| serviceProvider | String | No | Provider name. |
| cost | Number | No | Service cost. |
| currency | String | No | Currency code. |
| description | String | No | Description of work. |
| documentIds | Array | No | Array of existing document ObjectIds to link. |
| nextServiceDate | Date | No | ISO 8601 date string. |

**Response Body (201):** Created service history object.

---

### GET /api/v1/products/:productId/service-history/:recordId

**Purpose:** Retrieve a single service history record.

**Auth Required:** Yes

**Response Body (200):** Full service history object.

---

### PUT /api/v1/products/:productId/service-history/:recordId

**Purpose:** Update a service history record.

**Auth Required:** Yes

**Request Body:** Same fields as POST, all optional.

**Response Body (200):** Updated service history object.

---

### DELETE /api/v1/products/:productId/service-history/:recordId

**Purpose:** Delete a service history record permanently.

**Auth Required:** Yes

**Response Body (200):**

```json
{
  "success": true,
  "message": "Service record deleted",
  "data": null
}
```

---

## Notification Endpoints

### GET /api/v1/notifications

**Purpose:** Retrieve all notifications for the authenticated user, sorted by createdAt descending.

**Auth Required:** Yes

**Query Parameters:**

| Parameter | Type | Description |
|---|---|---|
| unreadOnly | Boolean | If true, returns only unread notifications. |

**Response Body (200):**

```json
{
  "success": true,
  "message": "Notifications retrieved",
  "data": {
    "notifications": [
      {
        "_id": "64f1a2b3c4d5e6f7a8b9c0d4",
        "notificationType": "expiry_warning",
        "title": "Warranty Expiring Soon",
        "message": "The warranty for Samsung TV expires in 7 days.",
        "isRead": false,
        "createdAt": "2026-08-03T08:00:00.000Z",
        "product": {
          "_id": "64f1a2b3c4d5e6f7a8b9c0d2",
          "productName": "Samsung TV"
        }
      }
    ],
    "unreadCount": 1
  }
}
```

---

### PUT /api/v1/notifications/:id/read

**Purpose:** Mark a single notification as read.

**Auth Required:** Yes

**Response Body (200):** Updated notification object with `isRead: true`.

---

### PUT /api/v1/notifications/read-all

**Purpose:** Mark all of the authenticated user's notifications as read.

**Auth Required:** Yes

**Response Body (200):**

```json
{
  "success": true,
  "message": "All notifications marked as read",
  "data": null
}
```

---

### DELETE /api/v1/notifications/:id

**Purpose:** Permanently delete a notification.

**Auth Required:** Yes

**Response Body (200):**

```json
{
  "success": true,
  "message": "Notification deleted",
  "data": null
}
```

---

## Dashboard Endpoint

### GET /api/v1/dashboard

**Purpose:** Retrieve aggregated summary statistics for the authenticated user's dashboard.

**Auth Required:** Yes

**Response Body (200):**

```json
{
  "success": true,
  "message": "Dashboard data retrieved",
  "data": {
    "totalProducts": 12,
    "expiringSoonCount": 3,
    "totalDocuments": 28,
    "unreadNotificationsCount": 2,
    "recentProducts": [
      {
        "_id": "64f1a2b3c4d5e6f7a8b9c0d2",
        "productName": "Samsung TV",
        "brand": "Samsung",
        "warrantyExpiryDate": "2027-01-15T00:00:00.000Z",
        "thumbnailUrl": "https://res.cloudinary.com/...",
        "createdAt": "2026-08-03T09:15:00.000Z"
      }
    ],
    "expiringSoon": [
      {
        "_id": "64f1a2b3c4d5e6f7a8b9c0d5",
        "productName": "LG Refrigerator",
        "warrantyExpiryDate": "2026-08-25T00:00:00.000Z",
        "daysRemaining": 23
      }
    ]
  }
}
```

The `recentProducts` array contains the 5 most recently added products. The `expiringSoon` array contains products whose `warrantyExpiryDate` falls within the next 30 days, sorted by expiry date ascending.
