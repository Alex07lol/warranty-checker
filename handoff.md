# WarrantyVault --- Day 2 Handoff

## Project Overview

**WarrantyVault** is a warranty/document management application that
lets users store product information, warranty details, purchase
documents, service history, notifications, and dashboard information in
one place.

The current project stack is:

-   **Frontend:** Flutter
-   **Backend:** Node.js + Express REST API
-   **Database:** MongoDB / MongoDB Atlas
-   **File storage:** Cloudinary
-   **Authentication:** JWT
-   **API response format:** JSON

The repository currently follows a structure similar to:

``` text
WarrantyVault/
├── backend/
├── mobile/
└── docs/
```

The project repository is associated with the WarrantyVault /
warranty-checker project.

------------------------------------------------------------------------

# Day 2 Objective

Day 2 focuses on building the application's backend foundation around
MongoDB.

The main backend responsibilities are:

1.  User authentication
2.  User registration/login
3.  Product management
4.  Warranty information
5.  Document metadata and uploads
6.  Service-history records
7.  Notifications
8.  Dashboard data
9.  MongoDB data models and relationships
10. Consistent API responses and error handling

The backend should expose REST APIs that the Flutter application can
consume.

------------------------------------------------------------------------

# 1. Backend Architecture

The intended request flow is:

``` text
Flutter App
    |
    | HTTP / JSON
    v
Express REST API
    |
    +---- JWT Authentication
    |
    +---- Controllers
    |
    +---- Services
    |
    +---- Mongoose Models
    |
    v
MongoDB Atlas
    |
    +---- Users
    +---- Products
    +---- Documents
    +---- Service History
    +---- Notifications
```

For uploaded files:

``` text
Flutter
   |
   | multipart/form-data
   v
Express
   |
   v
Cloudinary
   |
   +---- document URL
   |
   v
MongoDB
   |
   +---- document metadata + Cloudinary URL
```

MongoDB should store application data and document metadata. The actual
uploaded files should be stored in Cloudinary rather than inside
MongoDB.

------------------------------------------------------------------------

# 2. MongoDB Setup

Use MongoDB Atlas for the hosted database.

The backend should read the MongoDB connection string from environment
variables.

Example `.env`:

``` env
PORT=5000

MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>/<database>

JWT_SECRET=<strong-secret>

CLOUDINARY_CLOUD_NAME=<cloud-name>
CLOUDINARY_API_KEY=<api-key>
CLOUDINARY_API_SECRET=<api-secret>
```

Never commit `.env` to Git.

Add this to `.gitignore`:

``` text
.env
node_modules/
```

A typical MongoDB database name can be:

``` text
warrantyvault
```

------------------------------------------------------------------------

# 3. MongoDB Collections

The initial MongoDB collections are:

``` text
users
products
documents
servicehistories
notifications
```

MongoDB will create these collections automatically when Mongoose saves
the first document.

------------------------------------------------------------------------

# 4. User Model

The `User` collection stores account information.

Suggested schema:

``` js
const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },

    passwordHash: {
      type: String,
      required: true
    }
  },
  {
    timestamps: true
  }
);
```

Important points:

-   Passwords must never be stored as plain text.
-   Hash passwords before saving them.
-   Email should be unique.
-   JWT should be generated after successful login.

Example document:

``` json
{
  "_id": "ObjectId(...)",
  "name": "Alex",
  "email": "alex@example.com",
  "passwordHash": "hashed-password",
  "createdAt": "2026-08-02T00:00:00.000Z",
  "updatedAt": "2026-08-02T00:00:00.000Z"
}
```

------------------------------------------------------------------------

# 5. Product Model

A product belongs to a user.

Required product information from Day 2:

-   Name
-   Brand
-   Model
-   Category
-   Purchase date
-   Price
-   Store
-   Serial number
-   Warranty expiry
-   Warranty period
-   Notes

Suggested Mongoose schema:

``` js
const productSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    name: {
      type: String,
      required: true,
      trim: true
    },

    brand: {
      type: String,
      trim: true
    },

    model: {
      type: String,
      trim: true
    },

    category: {
      type: String,
      trim: true
    },

    purchaseDate: {
      type: Date
    },

    price: {
      type: Number,
      min: 0
    },

    store: {
      type: String,
      trim: true
    },

    serialNumber: {
      type: String,
      trim: true
    },

    warrantyExpiry: {
      type: Date
    },

    warrantyPeriod: {
      type: Number,
      min: 0
    },

    notes: {
      type: String,
      trim: true
    }
  },
  {
    timestamps: true
  }
);
```

Example:

``` json
{
  "_id": "ObjectId(...)",
  "userId": "ObjectId(...)",
  "name": "Laptop",
  "brand": "Dell",
  "model": "Inspiron",
  "category": "Electronics",
  "purchaseDate": "2026-01-15",
  "price": 65000,
  "store": "Example Store",
  "serialNumber": "ABC123",
  "warrantyExpiry": "2027-01-15",
  "warrantyPeriod": 12,
  "notes": "Keep purchase invoice"
}
```

------------------------------------------------------------------------

# 6. Document Model

Documents are associated with products.

The actual file is uploaded to Cloudinary.

MongoDB stores the metadata and URL.

Suggested fields:

``` js
const documentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true
    },

    documentType: {
      type: String,
      required: true
    },

    fileName: {
      type: String,
      required: true
    },

    fileUrl: {
      type: String,
      required: true
    },

    publicId: {
      type: String
    },

    mimeType: {
      type: String
    },

    fileSize: {
      type: Number
    }
  },
  {
    timestamps: true
  }
);
```

Supported document formats from Day 2:

``` text
JPEG
PNG
WEBP
PDF
```

Maximum upload size:

``` text
10 MB
```

Cloudinary folder convention:

``` text
warrantyvault/{userId}/{productId}/{documentType}
```

Example:

``` text
warrantyvault/64abc.../72def.../invoice
```

------------------------------------------------------------------------

# 7. Service History Model

Service history records maintenance or repair activity for a product.

Suggested schema:

``` js
const serviceHistorySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true
    },

    serviceDate: {
      type: Date,
      required: true
    },

    serviceCenter: {
      type: String,
      trim: true
    },

    description: {
      type: String,
      trim: true
    },

    cost: {
      type: Number,
      min: 0
    },

    notes: {
      type: String,
      trim: true
    }
  },
  {
    timestamps: true
  }
);
```

Example:

``` json
{
  "_id": "ObjectId(...)",
  "userId": "ObjectId(...)",
  "productId": "ObjectId(...)",
  "serviceDate": "2026-07-20",
  "serviceCenter": "Authorized Service Center",
  "description": "Battery replacement",
  "cost": 2500,
  "notes": "Warranty claim submitted"
}
```

------------------------------------------------------------------------

# 8. Notification Model

Notifications are used for warranty reminders and application events.

Suggested schema:

``` js
const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product"
    },

    title: {
      type: String,
      required: true
    },

    message: {
      type: String,
      required: true
    },

    type: {
      type: String,
      enum: [
        "warranty_expiring",
        "warranty_expired",
        "service",
        "system"
      ],
      default: "system"
    },

    isRead: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true
  }
);
```

------------------------------------------------------------------------

# 9. MongoDB Relationships

MongoDB uses ObjectId references between collections.

Relationship:

``` text
User
 |
 +---- Product
 |       |
 |       +---- Documents
 |       |
 |       +---- ServiceHistory
 |
 +---- Notifications
```

More specifically:

``` text
User 1 ---- N Products

Product 1 ---- N Documents

Product 1 ---- N ServiceHistory

User 1 ---- N Notifications
```

The `userId` field ensures that users can only access their own data.

The backend must always verify ownership before returning, modifying, or
deleting a product/document/service record.

------------------------------------------------------------------------

# 10. Authentication

Authentication uses JWT.

Login flow:

``` text
User
 |
 | email + password
 v
POST /api/auth/login
 |
 v
Find User in MongoDB
 |
 v
Compare password hash
 |
 v
Generate JWT
 |
 v
Return token
```

Example response:

``` json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "JWT_TOKEN",
    "user": {
      "id": "USER_ID",
      "name": "Alex",
      "email": "alex@example.com"
    }
  }
}
```

Authenticated requests should include:

``` text
Authorization: Bearer <JWT>
```

The JWT middleware should extract the user ID and attach it to the
request.

Example:

``` js
req.user = {
  id: decoded.userId
};
```

------------------------------------------------------------------------

# 11. API Response Standard

All API responses should follow a consistent format.

Success:

``` json
{
  "success": true,
  "message": "Operation successful",
  "data": {}
}
```

Error:

``` json
{
  "success": false,
  "message": "Something went wrong",
  "errors": []
}
```

Example validation error:

``` json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "field": "email",
      "message": "Email is required"
    }
  ]
}
```

------------------------------------------------------------------------

# 12. Authentication APIs

## Register

``` http
POST /api/auth/register
```

Request:

``` json
{
  "name": "Alex",
  "email": "alex@example.com",
  "password": "password123"
}
```

Response:

``` json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "id": "USER_ID",
    "name": "Alex",
    "email": "alex@example.com"
  }
}
```

## Login

``` http
POST /api/auth/login
```

Request:

``` json
{
  "email": "alex@example.com",
  "password": "password123"
}
```

## Current User

``` http
GET /api/auth/me
```

Requires JWT.

------------------------------------------------------------------------

# 13. Product APIs

## Create Product

``` http
POST /api/products
```

Requires JWT.

## Get Products

``` http
GET /api/products
```

Returns products belonging only to the authenticated user.

## Get Product

``` http
GET /api/products/:id
```

## Update Product

``` http
PUT /api/products/:id
```

## Delete Product

``` http
DELETE /api/products/:id
```

Ownership check is mandatory for all product operations.

------------------------------------------------------------------------

# 14. Document APIs

## Upload Document

``` http
POST /api/products/:productId/documents
```

Content type:

``` text
multipart/form-data
```

Fields:

``` text
file
documentType
```

Flow:

``` text
Request
  |
  v
Authenticate user
  |
  v
Find product
  |
  v
Verify product belongs to user
  |
  v
Validate file
  |
  +---- Maximum 10 MB
  +---- JPEG/PNG/WEBP/PDF
  |
  v
Upload to Cloudinary
  |
  v
Save Cloudinary metadata in MongoDB
  |
  v
Return document
```

## Get Product Documents

``` http
GET /api/products/:productId/documents
```

## Delete Document

``` http
DELETE /api/documents/:id
```

When deleting a document, remove the Cloudinary asset as well as the
MongoDB metadata where appropriate.

------------------------------------------------------------------------

# 15. Service History APIs

## Add Service Record

``` http
POST /api/products/:productId/service-history
```

## Get Service History

``` http
GET /api/products/:productId/service-history
```

## Update Service Record

``` http
PUT /api/service-history/:id
```

## Delete Service Record

``` http
DELETE /api/service-history/:id
```

Every operation must verify that the related product belongs to the
authenticated user.

------------------------------------------------------------------------

# 16. Notification APIs

## Get Notifications

``` http
GET /api/notifications
```

## Mark Notification as Read

``` http
PATCH /api/notifications/:id/read
```

## Delete Notification

``` http
DELETE /api/notifications/:id
```

Notifications should be filtered by `userId`.

------------------------------------------------------------------------

# 17. Dashboard API

The dashboard can aggregate information from MongoDB.

Example:

``` http
GET /api/dashboard
```

Possible response:

``` json
{
  "success": true,
  "message": "Dashboard data fetched successfully",
  "data": {
    "totalProducts": 8,
    "activeWarranties": 5,
    "expiringSoon": 2,
    "expiredWarranties": 1,
    "unreadNotifications": 3
  }
}
```

MongoDB aggregation can be used later for efficient dashboard
statistics.

------------------------------------------------------------------------

# 18. Recommended Backend Structure

``` text
backend/
├── src/
│   ├── config/
│   │   ├── db.js
│   │   └── cloudinary.js
│   │
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── productController.js
│   │   ├── documentController.js
│   │   ├── serviceHistoryController.js
│   │   ├── notificationController.js
│   │   └── dashboardController.js
│   │
│   ├── middleware/
│   │   ├── authMiddleware.js
│   │   ├── errorMiddleware.js
│   │   └── uploadMiddleware.js
│   │
│   ├── models/
│   │   ├── User.js
│   │   ├── Product.js
│   │   ├── Document.js
│   │   ├── ServiceHistory.js
│   │   └── Notification.js
│   │
│   ├── routes/
│   │   ├── authRoutes.js
│   │   ├── productRoutes.js
│   │   ├── documentRoutes.js
│   │   ├── serviceHistoryRoutes.js
│   │   ├── notificationRoutes.js
│   │   └── dashboardRoutes.js
│   │
│   ├── services/
│   │   ├── authService.js
│   │   ├── cloudinaryService.js
│   │   └── notificationService.js
│   │
│   └── app.js
│
├── server.js
├── .env
├── .env.example
├── .gitignore
└── package.json
```

------------------------------------------------------------------------

# 19. MongoDB Connection

Create:

``` text
src/config/db.js
```

Example:

``` js
const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    console.log("MongoDB connected");
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    process.exit(1);
  }
};

module.exports = connectDB;
```

Then initialize it from the server:

``` js
const express = require("express");
const connectDB = require("./src/config/db");

const app = express();

app.use(express.json());

connectDB();

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "WarrantyVault API is running"
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

------------------------------------------------------------------------

# 20. Required Dependencies

Backend dependencies should include the following concepts:

``` text
express
mongoose
dotenv
bcryptjs
jsonwebtoken
multer
cloudinary
```

Development dependency:

``` text
nodemon
```

Example installation:

``` bash
npm install express mongoose dotenv bcryptjs jsonwebtoken multer cloudinary
npm install --save-dev nodemon
```

------------------------------------------------------------------------

# 21. Security Requirements

The Day 2 backend must follow these rules:

### Passwords

Never store:

``` text
password: "password123"
```

Store only a secure password hash.

### JWT

Keep the JWT secret in `.env`.

Never hard-code:

``` js
const secret = "mysecret";
```

### User isolation

A user must not be able to access another user's product simply by
changing:

``` text
/api/products/:id
```

Always verify:

``` js
product.userId === req.user.id
```

### File validation

Only allow:

``` text
JPEG
PNG
WEBP
PDF
```

and maximum:

``` text
10 MB
```

### Environment variables

Never commit:

``` text
MONGODB_URI
JWT_SECRET
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET
```

------------------------------------------------------------------------

# 22. MongoDB Indexing

Indexes should be added to frequently queried fields.

Important indexes:

``` text
User.email
Product.userId
Document.userId
Document.productId
ServiceHistory.userId
ServiceHistory.productId
Notification.userId
```

Mongoose can create indexes using:

``` js
index: true
```

Example:

``` js
userId: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "User",
  required: true,
  index: true
}
```

For email:

``` js
email: {
  type: String,
  required: true,
  unique: true,
  index: true
}
```

------------------------------------------------------------------------

# 23. Testing Strategy

Before connecting the Flutter frontend, test the backend independently.

Recommended sequence:

``` text
1. Start MongoDB connection
2. Start Express server
3. Test /api/health
4. Register user
5. Login user
6. Copy JWT
7. Create product
8. Get products
9. Get individual product
10. Update product
11. Upload document
12. Get documents
13. Add service history
14. Get service history
15. Get notifications
16. Test dashboard
17. Test unauthorized access
18. Test invalid product IDs
19. Test invalid file types
20. Test files larger than 10 MB
```

Postman, Insomnia, or another API client can be used for testing.

------------------------------------------------------------------------

# 24. Important MongoDB Ownership Pattern

For example, do not only query:

``` js
const product = await Product.findById(req.params.id);
```

Prefer an ownership-aware query:

``` js
const product = await Product.findOne({
  _id: req.params.id,
  userId: req.user.id
});
```

This is safer because the database query itself verifies ownership.

If no product is returned:

``` js
return res.status(404).json({
  success: false,
  message: "Product not found",
  errors: []
});
```

The same pattern should be applied to documents, service history, and
notifications.

------------------------------------------------------------------------

# 25. Day 2 Completion Criteria

Day 2 is considered complete when:

-   [ ] Express backend starts successfully.
-   [ ] MongoDB Atlas connection works.
-   [ ] User model is implemented.
-   [ ] Product model is implemented.
-   [ ] Document model is implemented.
-   [ ] ServiceHistory model is implemented.
-   [ ] Notification model is implemented.
-   [ ] Registration works.
-   [ ] Login works.
-   [ ] JWT authentication middleware works.
-   [ ] Product CRUD works.
-   [ ] User ownership checks work.
-   [ ] Document upload works through Cloudinary.
-   [ ] Document metadata is stored in MongoDB.
-   [ ] Service history CRUD works.
-   [ ] Notification APIs work.
-   [ ] Dashboard endpoint works.
-   [ ] Standard success/error response format is used.
-   [ ] Invalid requests return appropriate errors.
-   [ ] `.env` secrets are not committed.
-   [ ] API endpoints can be tested independently of Flutter.

------------------------------------------------------------------------

# 26. Handoff Notes

The next developer should treat MongoDB as the source of truth for
WarrantyVault application data.

Do not store uploaded documents directly inside MongoDB. Store the file
in Cloudinary and save its metadata/URL in MongoDB.

The most important relationship is:

``` text
User
  |
  +---- Products
          |
          +---- Documents
          |
          +---- Service History
```

Every authenticated resource operation must be scoped to the logged-in
user's `userId`.

The API should remain independent from Flutter. This allows the backend
to be tested completely before integrating the mobile application.

The response contract should remain:

``` json
{
  "success": true,
  "message": "...",
  "data": {}
}
```

and errors:

``` json
{
  "success": false,
  "message": "...",
  "errors": []
}
```

------------------------------------------------------------------------

# Day 2 Handoff Summary

``` text
Frontend
   ↓
Flutter
   ↓
Express REST API
   ↓
JWT Middleware
   ↓
Controllers / Services
   ↓
Mongoose
   ↓
MongoDB Atlas

Files:
Flutter
   ↓
Express + Multer
   ↓
Cloudinary
   ↓
MongoDB document metadata
```

**Primary database:** MongoDB Atlas

**File storage:** Cloudinary

**Authentication:** JWT

**Backend:** Express

**Frontend:** Flutter

**Main MongoDB collections:**

``` text
users
products
documents
servicehistories
notifications
```

This document is the Day 2 implementation handoff and should be used as
the reference when continuing backend development.
