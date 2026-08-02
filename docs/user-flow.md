# User Flows

## Overview

This document details how users navigate and interact with the WarrantyVault application, covering the initial launch through routine daily use. Each flow describes the precise sequence of actions, system responses, and decision points a user encounters when completing a task.

---

## Flow 1: User Registration

1. User opens the application for the first time.
2. The Splash Screen is displayed for approximately two seconds.
3. User arrives at the Welcome Screen, which presents Register and Login options.
4. User taps the Register button.
5. The Registration Form is shown requesting: Full Name, Email Address, Password, Confirm Password.
6. User fills out the required fields and taps Submit.
7. The client validates all form fields before making a network request.
8. If client validation fails: inline error messages are displayed beneath each failing field. The form remains open.
9. If client validation passes: the application initiates a POST request to `/api/v1/auth/register`.
10. A loading indicator is displayed while the request is in flight.
11. On HTTP 201 success: the returned JWT is stored in SharedPreferences, the user is navigated directly to the Dashboard.
12. On HTTP 409 (email already exists): an inline error is displayed stating the email address is already registered.
13. On HTTP 500: a generic error message is shown with a Retry button.

```
[App Launch]
     |
     v
[Splash Screen - 2s]
     |
     v
[Welcome Screen]
     |
     +--(tap Register)--> [Registration Form]
                               |
                               +--(submit)--> {Client Validation}
                                                    |
                                    +---------------+---------------+
                                    |                               |
                               [Fails]                          [Passes]
                                    |                               |
                         [Inline Errors]            [POST /auth/register]
                                    |                               |
                         [Form remains open]         +--------------+--------------+
                                                     |              |              |
                                                  [201]          [409]          [500]
                                                     |              |              |
                                              [Store JWT]  [Email error]   [Generic error]
                                                     |                             |
                                               [Dashboard]                   [Retry option]
```

---

## Flow 2: User Login

1. User opens the application with no stored session.
2. The Splash Screen is displayed.
3. The Splash Screen checks SharedPreferences for a stored JWT. None found.
4. User is navigated to the Welcome Screen.
5. User taps the Login button.
6. The Login Form is displayed requesting: Email Address, Password.
7. User enters credentials and taps Login.
8. Client validates input format.
9. If validation fails: inline errors are shown.
10. If validation passes: a POST request is made to `/api/v1/auth/login`.
11. Loading indicator is shown.
12. On HTTP 200: the returned JWT is stored locally and the user is navigated to the Dashboard.
13. On HTTP 401: an error message states "Invalid email or password."
14. On HTTP 500: a generic error with a Retry button.

---

## Flow 3: Add a Product

1. User is on the Dashboard or Product List screen.
2. User taps the Add Product Floating Action Button.
3. The Add Product Screen is shown.
4. User fills in: Product Name (required), Brand, Model, Category, Purchase Date, Purchase Price, Currency, Store Name, Serial Number, Warranty Period in months, Notes.
5. User taps Save.
6. Client validates all required fields.
7. If validation fails: field-level errors are shown.
8. If validation passes: a POST request is made to `/api/v1/products`.
9. Loading indicator is shown.
10. On HTTP 201: a success toast is shown and the user is navigated to the newly created Product Detail Screen.
11. On error: the relevant error message is shown. The form remains populated so no data is lost.

---

## Flow 4: Upload a Receipt

1. User is on the Product Detail Screen.
2. User navigates to the Documents tab.
3. User taps the Upload Document button.
4. A bottom sheet appears with document type options. User selects Receipt.
5. The user is prompted to choose between Gallery or Camera.
6. User selects or captures the image.
7. A preview of the selected image is displayed on the Upload Document Screen.
8. User taps Confirm Upload.
9. A progress indicator is shown during the upload.
10. The request is sent as multipart/form-data to `POST /api/v1/products/:productId/documents`.
11. On HTTP 201: a success toast is shown. The receipt appears in the Documents list.
12. On error: an error toast is shown. The user may retry.

---

## Flow 5: Upload Warranty Card

Identical to Flow 4 with one difference: the user selects Warranty Card as the document type in step 4. The document type is sent as `warranty_card` in the request body.

---

## Flow 6: View Dashboard

1. User logs in or opens the app with a valid stored JWT.
2. The Splash Screen validates the stored JWT by making a GET request to `/api/v1/auth/me`.
3. On valid session: user is navigated to the Dashboard.
4. The Dashboard fetches summary data from `GET /api/v1/dashboard`.
5. The following information is rendered:
   - Total products count card.
   - Expiring soon count card (warranties expiring within 30 days).
   - A horizontal scroll list of the 5 most recently added products.
   - An unread notifications badge on the notification bell icon.
6. Tapping any product card in the recent list navigates to that product's detail screen.
7. Tapping the expiring soon card navigates to the filtered Product List showing only expiring products.

---

## Flow 7: Search Products

1. User is on the Product List Screen.
2. User taps the search icon in the top app bar.
3. The search input field becomes active and the keyboard opens.
4. User types a query.
5. The application debounces the input and sends a GET request to `/api/v1/products/search?q=<query>` after 300ms of inactivity.
6. Results are rendered below the search field as product cards.
7. Typing further refines results in real time.
8. User taps a product card to navigate to the Product Detail Screen.
9. User taps the back arrow or clears the search field to return to the full product list.

---

## Flow 8: Add Service Record

1. User is on the Product Detail Screen.
2. User taps the Service History tab.
3. User taps the Add Record button.
4. The Add Service Record Screen is shown.
5. User fills in: Service Date (required), Service Type (required), Service Provider, Cost, Currency, Description, Next Service Date.
6. Optionally, the user can attach existing documents by selecting from the product's document list.
7. User taps Save.
8. A POST request is made to `/api/v1/products/:productId/service-history`.
9. On HTTP 201: the new record appears at the top of the service history timeline.
10. On error: an error message is shown.

---

## Flow 9: Delete a Product

1. User is on the Product Detail Screen.
2. User taps the overflow menu icon (three vertical dots) in the top-right of the app bar.
3. A dropdown menu appears with a Delete option.
4. User taps Delete.
5. A confirmation dialog is shown: "Are you sure you want to delete this product? This action cannot be undone."
6. User taps Confirm Delete.
7. A DELETE request is made to `/api/v1/products/:id`, performing a soft delete on the server.
8. On HTTP 200: a confirmation toast is shown. The user is navigated back to the Product List Screen. The product no longer appears in the list.

---

## Flow 10: View Notifications

1. The notification bell icon in the top app bar shows an unread count badge.
2. User taps the notification bell.
3. The Notifications Screen opens, displaying a list of all notifications sorted by date descending.
4. Unread notifications are visually distinguished with a highlighted background or bold title.
5. User taps a notification to be navigated to the relevant product detail screen. The notification is marked as read.
6. User can swipe a notification to dismiss and delete it.
7. A Mark All as Read button is available at the top of the list.

---

## Flow 11: Logout

1. User taps the Settings tab in the bottom navigation bar.
2. The Settings Screen is displayed.
3. User taps the Logout button at the bottom of the screen.
4. A confirmation dialog is shown: "Are you sure you want to log out?"
5. User taps Confirm.
6. The stored JWT is deleted from SharedPreferences.
7. All in-memory state managed by Providers is cleared.
8. The user is navigated to the Welcome Screen. The navigation stack is cleared so the back button does not return to the authenticated screens.

---

## Error States

| Error Condition | User-Facing Response |
|---|---|
| No internet connection | A persistent banner displays at the bottom of the screen: "No internet connection." Actions requiring network are disabled with a Retry option shown. |
| Server error (5xx) | A toast or dialog displays: "Something went wrong on our end. Please try again." A retry action is offered. |
| Session expired (401 on protected route) | All local session data is cleared. A toast displays: "Your session has expired. Please log in again." The user is redirected to the Login Screen. |
| File too large (upload) | An error message appears immediately after file selection: "File exceeds the 10MB limit." The upload does not proceed. |
| Unsupported file type (upload) | An error message appears immediately: "Unsupported file type. Please select JPEG, PNG, WEBP, or PDF." |

---

## Navigation Structure

The application uses a bottom navigation bar as the primary navigation mechanism with four tabs:

1. Dashboard
2. Products
3. Notifications
4. Settings

Within each tab, a Stack Navigator manages screen history. Tapping a product pushes the Product Detail Screen onto the stack. The system back button and in-app back arrow both pop the stack. The bottom navigation bar remains visible throughout all main screens. Full-screen flows such as the Add Product form or Upload Document screen hide the bottom navigation bar and use an app bar back button instead.
