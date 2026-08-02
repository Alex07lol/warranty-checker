# Wireframes and Screen Layouts

## Screen Inventory

| Number | Screen Name |
|---|---|
| 1 | Splash Screen |
| 2 | Welcome Screen |
| 3 | Registration Screen |
| 4 | Login Screen |
| 5 | Dashboard Screen |
| 6 | Product List Screen |
| 7 | Add Product Screen |
| 8 | Product Detail Screen |
| 9 | Upload Document Screen |
| 10 | Service History Screen |
| 11 | Add Service Record Screen |
| 12 | Notifications Screen |
| 13 | Settings Screen |

---

## Screen 1: Splash Screen

Displayed for approximately two seconds on application launch. Checks for a stored JWT in SharedPreferences and routes the user accordingly.

```
+------------------------------------------+
|                                          |
|                                          |
|                                          |
|                                          |
|                                          |
|            [ APP LOGO ]                  |
|                                          |
|           WarrantyVault                  |
|                                          |
|                                          |
|                                          |
|                                          |
|                                          |
+------------------------------------------+
```

---

## Screen 2: Welcome Screen

Entry point for unauthenticated users. Provides two primary calls to action.

```
+------------------------------------------+
|                                          |
|                                          |
|           [ APP LOGO ]                   |
|                                          |
|          WarrantyVault                   |
|                                          |
|    Store your warranties. Never lose     |
|    coverage again.                       |
|                                          |
|                                          |
|                                          |
|       [       REGISTER        ]          |
|                                          |
|       [        LOGIN          ]          |
|                                          |
+------------------------------------------+
```

---

## Screen 3: Registration Screen

Form to create a new user account. All fields are validated before submission.

```
+------------------------------------------+
|  <- Back               Create Account   |
+------------------------------------------+
|                                          |
|  Full Name                               |
|  [______________________________________]|
|                                          |
|  Email Address                           |
|  [______________________________________]|
|                                          |
|  Password                                |
|  [______________________________________]|
|                                          |
|  Confirm Password                        |
|  [______________________________________]|
|                                          |
|       [        REGISTER       ]          |
|                                          |
|  Already have an account? Login          |
|                                          |
+------------------------------------------+
```

---

## Screen 4: Login Screen

Authentication form for returning users.

```
+------------------------------------------+
|  <- Back                  Welcome Back  |
+------------------------------------------+
|                                          |
|  Email Address                           |
|  [______________________________________]|
|                                          |
|  Password                                |
|  [______________________________________]|
|                                          |
|                        Forgot Password?  |
|                                          |
|       [         LOGIN         ]          |
|                                          |
|  New here? Create an account             |
|                                          |
+------------------------------------------+
```

---

## Screen 5: Dashboard Screen

The main screen after login. Shows key metrics and entry points.

```
+------------------------------------------+
|  WarrantyVault                    [Bell] |
+------------------------------------------+
|                                          |
|  Good morning, Alex.                     |
|                                          |
|  +------------------+ +--------------+  |
|  |  Total Products  | | Expiring     |  |
|  |       24         | | Soon:   3    |  |
|  +------------------+ +--------------+  |
|                                          |
|  Expiring Soon                           |
|  +--------------------------------------+|
|  |  Samsung TV    |  Expires: 5 days   ||
|  +--------------------------------------+|
|  |  LG Fridge     |  Expires: 12 days  ||
|  +--------------------------------------+|
|                                          |
|  Recently Added                          |
|  [Card 1]  [Card 2]  [Card 3]            |
|                                          |
+------------------------------------------+
| [Dashboard] [Products] [Notifs] [Settgs] |
+------------------------------------------+
```

---

## Screen 6: Product List Screen

Full list of the user's products with search and category filtering.

```
+------------------------------------------+
|  Products                         [Bell] |
+------------------------------------------+
|  [ Search products...              ]     |
|                                          |
|  [All] [Electronics] [Appliances] [More] |
|                                          |
|  +--------------------------------------+|
|  | [IMG] MacBook Pro M2                 ||
|  |       Apple | Expires Oct 2025       ||
|  +--------------------------------------+|
|  +--------------------------------------+|
|  | [IMG] Samsung Refrigerator           ||
|  |       Samsung | Expires Jan 2028     ||
|  +--------------------------------------+|
|  +--------------------------------------+|
|  | [IMG] Sony WH-1000XM5                ||
|  |       Sony | Expires Mar 2026        ||
|  +--------------------------------------+|
|                                    [+]   |
+------------------------------------------+
| [Dashboard] [Products] [Notifs] [Settgs] |
+------------------------------------------+
```

---

## Screen 7: Add Product Screen

Form for registering a new product in the system.

```
+------------------------------------------+
|  <- Back                   Add Product  |
+------------------------------------------+
|                                          |
|  Product Name *                          |
|  [______________________________________]|
|                                          |
|  Brand                                   |
|  [______________________________________]|
|                                          |
|  Model                                   |
|  [______________________________________]|
|                                          |
|  Category                                |
|  [ Select Category              (v) ]   |
|                                          |
|  Purchase Date *                         |
|  [ MM / DD / YYYY                   ]   |
|                                          |
|  Purchase Price                          |
|  [______________________________________]|
|                                          |
|  Serial Number                           |
|  [______________________________________]|
|                                          |
|  Warranty Period (Months)                |
|  [______________________________________]|
|                                          |
|  Notes                                   |
|  [______________________________________]|
|  [______________________________________]|
|                                          |
|       [      SAVE PRODUCT      ]         |
|                                          |
+------------------------------------------+
```

---

## Screen 8: Product Detail Screen

Comprehensive view for a single product. Tabbed layout separating product info, documents, and service history.

```
+------------------------------------------+
|  <- Back   MacBook Pro M2          [...] |
+------------------------------------------+
|  [         PRODUCT IMAGE AREA          ] |
|                                          |
|  Brand: Apple                            |
|  Model: MacBook Pro M2 14-inch           |
|  Purchased: Oct 12, 2023                 |
|  Store: Apple Store, Delhi               |
|  Serial: C02XG2ZJGH7L                    |
|  Warranty Expires: Oct 12, 2025 (Active) |
|                                          |
|  [ Details ] [ Documents ] [ Service ]   |
|  ----------------------------------------|
|                                          |
|  receipt_scan.jpg           [View] [Del] |
|  warranty_card.jpg          [View] [Del] |
|  user_manual.pdf            [View] [Del] |
|                                          |
|                                    [+]   |
+------------------------------------------+
| [Dashboard] [Products] [Notifs] [Settgs] |
+------------------------------------------+
```

---

## Screen 9: Upload Document Screen

Interface for attaching a file to a product.

```
+------------------------------------------+
|  <- Back            Upload Document     |
+------------------------------------------+
|                                          |
|  Document Type *                         |
|  (o) Receipt                             |
|  ( ) Warranty Card                       |
|  ( ) Product Photo                       |
|  ( ) Manual                              |
|  ( ) Other                               |
|                                          |
|  +--------------------------------------+|
|  |                                      ||
|  |    Tap to choose from gallery        ||
|  |    or take a photo                   ||
|  |                                      ||
|  +--------------------------------------+|
|                                          |
|  Selected: receipt_scan_001.jpg          |
|  Size: 1.4 MB                            |
|                                          |
|  Notes (optional)                        |
|  [______________________________________]|
|                                          |
|       [     CONFIRM UPLOAD    ]          |
|                                          |
+------------------------------------------+
```

---

## Screen 10: Service History Screen

Timeline view of all service events for a product, accessible from the Service tab on the Product Detail Screen.

```
+------------------------------------------+
|  <- Back   MacBook Pro M2 - Service     |
+------------------------------------------+
|  [ Details ] [ Documents ] [ Service ]   |
|  ----------------------------------------|
|                                          |
|  | Dec 01, 2023                          |
|  o Screen Replacement                    |
|  | Provider: Apple Store, Delhi          |
|  | Cost: INR 0 (Under Warranty)          |
|  | Desc: Replaced cracked screen         |
|  |                                       |
|  | May 15, 2024                          |
|  o Battery Diagnostic                    |
|  | Provider: Best Buy                    |
|  | Cost: INR 1,200                       |
|  | Desc: Battery at 80% health           |
|  |                                       |
|                                    [+]   |
+------------------------------------------+
| [Dashboard] [Products] [Notifs] [Settgs] |
+------------------------------------------+
```

---

## Screen 11: Add Service Record Screen

Form for logging a maintenance or repair event.

```
+------------------------------------------+
|  <- Back          Add Service Record    |
+------------------------------------------+
|                                          |
|  Service Date *                          |
|  [ MM / DD / YYYY                   ]   |
|                                          |
|  Service Type *                          |
|  [ Select Type                  (v) ]   |
|                                          |
|  Service Provider                        |
|  [______________________________________]|
|                                          |
|  Cost                                    |
|  [______________________________________]|
|                                          |
|  Currency                                |
|  [ INR                          (v) ]   |
|                                          |
|  Description                             |
|  [______________________________________]|
|  [______________________________________]|
|                                          |
|  Next Service Date                       |
|  [ MM / DD / YYYY                   ]   |
|                                          |
|       [      SAVE RECORD       ]         |
|                                          |
+------------------------------------------+
```

---

## Screen 12: Notifications Screen

Inbox for system-generated warranty alerts and reminders.

```
+------------------------------------------+
|  Notifications               [Mark All] |
+------------------------------------------+
|                                          |
|  [!] Warranty Expiring Soon              |
|      Samsung TV expires in 5 days.       |
|      1 hour ago                          |
|                                          |
|  [!] Warranty Expiring Soon              |
|      LG Refrigerator expires in 12 days. |
|      3 hours ago                         |
|                                          |
|  [i] Warranty Expired                    |
|      HP Printer warranty expired.        |
|      Yesterday                           |
|                                          |
|  [i] Product Added                       |
|      Sony WH-1000XM5 was added.          |
|      Aug 1, 2026                         |
|                                          |
+------------------------------------------+
| [Dashboard] [Products] [Notifs] [Settgs] |
+------------------------------------------+
```

Unread notifications display with a filled icon and distinct background. Read notifications display with a muted background.

---

## Screen 13: Settings Screen

User profile management, preferences, and application controls.

```
+------------------------------------------+
|  Settings                               |
+------------------------------------------+
|                                          |
|  Profile                                 |
|  Name:   Alex                            |
|  Email:  alex@example.com                |
|  [ Edit Profile ]                        |
|                                          |
|  Notification Preferences                |
|  Expiry Alerts                  [ON  ]   |
|  Reminder: 30, 7, 1 days before          |
|                                          |
|  About                                   |
|  App Version: 1.0.0                      |
|  Privacy Policy                          |
|  Terms of Service                        |
|  Open Source Licenses                    |
|                                          |
|                                          |
|       [        LOGOUT         ]          |
|                                          |
+------------------------------------------+
| [Dashboard] [Products] [Notifs] [Settgs] |
+------------------------------------------+
```

---

## Design Principles

**Material Design 3:** All components follow Material Design 3 guidelines including shape, typography scale, color roles, and elevation.

**Color Scheme:** A primary color with distinct surface variants. The color system uses light and dark mode roles to ensure contrast and legibility across both themes.

**Typography:** A single font family is used throughout. Heading levels, body text, and labels follow a consistent type scale. Font size minimums ensure readability on small screens.

**Touch Targets:** All interactive elements maintain a minimum touch target of 48dp by 48dp regardless of the visual size of the element.

**Loading States:** Every asynchronous operation displays a loading indicator. Skeleton loading screens are used on initial data fetch to reduce perceived wait time.

**Empty States:** Every list screen displays an informative empty state with an action call (e.g., "No products yet. Add your first product.") rather than a blank screen.

**Error States:** Error states are displayed inline or as dismissible toasts depending on severity. Unrecoverable states display a full-screen error with a retry action.
