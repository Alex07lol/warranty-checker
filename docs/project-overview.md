# WarrantyVault - Project Overview

## Introduction

WarrantyVault is a mobile-first digital ownership and warranty management platform built for Android. The application provides consumers with a single, secure location to store every document and piece of information related to products they own.

When a consumer purchases a product, they receive a receipt, a warranty card, a product manual, and sometimes additional documentation. Within weeks or months, these documents are lost, damaged, or forgotten. When the product eventually fails during the warranty period, the consumer discovers they cannot substantiate their claim. WarrantyVault eliminates this problem entirely by making document storage frictionless and retrieval instant.

The platform allows users to photograph receipts on the spot, upload warranty cards, store PDF manuals, record serial numbers, and track service history — all associated with a specific product record. The system automatically calculates warranty expiry dates and sends notifications before coverage lapses, ensuring users never unknowingly lose protection they have paid for.

## Motivation

The motivation behind WarrantyVault is grounded in a universal consumer problem. Every person who owns consumer electronics, home appliances, vehicles, or any product with a warranty faces the same challenge: managing the physical documentation that proves ownership and eligibility for warranty service.

Physical receipts fade within months under normal conditions. Warranty cards are filed and forgotten. Product manuals end up in drawers and are discarded during moves. When something breaks, the consumer contacts the manufacturer or retailer and is asked for proof of purchase. Without it, the warranty claim is denied.

This is not a niche problem. It affects millions of consumers annually across every category of consumer product. The financial impact is significant — consumers lose warranty coverage they paid for, and manufacturers decline claims they would otherwise honor if documentation existed.

Existing workarounds — physical filing systems, generic cloud storage, notes applications — all fail because they are not designed for this use case. They require manual organization, offer no expiry tracking, and provide no structured way to associate documents with specific products.

WarrantyVault is purpose-built for this problem.

## Vision

WarrantyVault will become the universal standard for digital product ownership. Every product a person owns will have a complete digital record: proof of purchase, warranty documentation, service history, and all relevant specifications. The platform will surface actionable information at the right time — notifying users before warranties expire, reminding them of scheduled maintenance, and providing instant access to documentation during service appointments.

In the long term, WarrantyVault will integrate directly with retailers, manufacturers, and insurance providers to eliminate manual document collection entirely. A purchase will automatically generate a product record and attach the digital receipt.

## Mission Statement

To eliminate the financial loss consumers suffer from lost warranty documentation by providing the most organized, accessible, and intelligent product ownership platform available.

## Goals

The following goals define the scope of the buildathon version:

1. Allow users to create secure accounts with email and password authentication.
2. Allow users to add products with complete purchase information and warranty details.
3. Allow users to upload and store receipts, warranty cards, product photos, and PDF manuals per product.
4. Allow users to record and view full service history per product.
5. Automatically calculate warranty expiry dates from purchase date and warranty period.
6. Send in-app notifications when warranties are expiring within 30 days.
7. Provide a dashboard view with key metrics and quick access to expiring warranties.
8. Allow users to search for products by name, brand, or model.
9. Allow users to delete products with data preservation via soft delete.
10. Provide a secure, authenticated REST API that supports all mobile client operations.

## Non-Goals (Out of Scope for Buildathon)

The following features are explicitly excluded from the buildathon version:

- Web portal or desktop application
- Multi-user household accounts
- Barcode or QR code scanning for product registration
- AI-based receipt parsing or OCR
- Direct integration with retailers or manufacturers
- Warranty claim assistance workflows
- Export to PDF feature
- Push notifications (only in-app notification center is included)
- Email notifications
- Social features or product sharing
- iOS support

## Target Users

**Primary User:** Individual consumers aged 18-45 who regularly purchase electronics, appliances, or other warranted products and want a better system than physical filing.

**Secondary User:** Households managing multiple products across multiple family members. This use case will be addressed in a future multi-user release.

**Tertiary User:** Small business owners who need to track warranty status across business equipment.

## Core Features

### Product Management

Users can add any physical product to WarrantyVault with the following information: product name, brand, model number, category, purchase date, purchase price, currency, store or retailer, serial number, warranty period in months, and free-form notes. The system automatically calculates the warranty expiry date from the purchase date and warranty period. Products can be edited, soft-deleted, and searched.

### Receipt Storage

Users can photograph or upload a scanned receipt image (JPEG, PNG, or WEBP) and associate it with a specific product. The image is stored on Cloudinary and referenced in the product's document library. Receipts can be viewed at any time from the product detail screen.

### Warranty Card Storage

Users can photograph their physical warranty card and store it digitally. Like receipts, the image is uploaded to Cloudinary and linked to the product record. Warranty cards are categorized separately from receipts for easy filtering.

### Product Photos

Users can attach product photos to document the condition of a product at the time of purchase or after a service event. These are stored and displayed in the product's document library.

### Product Manuals (PDF)

Users can upload PDF product manuals and store them within the product record. PDFs are uploaded to Cloudinary and retrievable from the product detail screen at any time.

### Serial Number Storage

Serial numbers are stored as a structured field on the product record rather than as a document. This allows for direct display and copy-to-clipboard functionality without opening a document viewer.

### Purchase Information

Complete purchase information — date, price, currency, and store — is stored as structured data on the product record. This information is displayed prominently on the product detail screen for quick reference during service appointments.

### Service History Tracking

Users can log every service event for a product: repair, maintenance, inspection, replacement, or other. Each service record captures the date, type, provider, cost, description, and optional next service date. Supporting documents can be attached to service records. The complete history is displayed as a chronological timeline.

### Warranty Expiry Notifications

The system generates in-app notifications when a product's warranty is approaching expiry. Notifications are triggered at the intervals specified in the user's notification preferences (defaulting to 30, 7, and 1 day before expiry). The notification center displays all alerts with read/unread state management.

### Search

Users can search their product library by product name, brand, or model number. The search leverages MongoDB's text index for efficient, real-time results.

## Future Scope

| Feature | Description |
|---|---|
| Web portal | Desktop-accessible version of the platform |
| Multi-user households | Shared product libraries for family accounts |
| AI receipt parsing | Automatic product information extraction from receipt images |
| Barcode scanning | Camera-based product registration via barcode or QR code |
| Insurance integrations | Direct submission of warranty documentation to insurance providers |
| Warranty claim assistance | Guided workflow for filing warranty claims |
| Export to PDF | Generate a complete product ownership report |
| Push notifications | Native Android push notifications for expiry alerts |
| Retailer integrations | Automatic receipt import from partnered retailers |
| iOS support | Expand Flutter target to iOS |

## Success Metrics

The buildathon version is considered successful when:

1. A user can register, log in, and log out without errors.
2. A user can add a product and upload at least one document of each supported type.
3. The system correctly calculates and displays warranty expiry dates.
4. The notification center displays correctly generated expiry alerts.
5. The search function returns accurate results.
6. The dashboard shows correct aggregated statistics.
7. The Flutter app runs on an Android device or emulator without crashes.
8. All API endpoints respond correctly to both valid and invalid requests.

## Project Timeline

| Day | Focus | Deliverables |
|---|---|---|
| Day 1 — August 2, 2026 | Planning and documentation | Complete repository structure, all documentation files, API design, database design |
| Day 2 — August 3, 2026 | Full implementation | Working Flutter app connected to live Node.js API with MongoDB Atlas |
