#  ApexPOS — Enterprise Multi-Tenant Point-of-Sale & Retail Management Platform

<div align="center">

[![React](https://img.shields.io/badge/Frontend-React%2018%20%7C%20Vite-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://reactjs.org/)
[![Node.js](https://img.shields.io/badge/Backend-Node.js%20%7C%20Express-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![MongoDB](https://img.shields.io/badge/Database-MongoDB%20Atlas-47A248?style=for-the-badge&logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![Architecture](https://img.shields.io/badge/Architecture-Multi--Tenant%20SaaS-7C3AED?style=for-the-badge)](https://github.com/)
[![License](https://img.shields.io/badge/License-MIT-blue.style=for-the-badge)](LICENSE)

<p align="center">
  <strong>A modern, full-stack, enterprise-grade Multi-Tenant Point of Sale (POS), Multi-Branch Inventory Management, and Real-Time Financial Analytics ERP designed for retail chains, supermarkets, malls, and modern businesses.</strong>
</p>

[Explore Features](#-key-features) • [UI Gallery](#-application-showcase) • [Tech Stack](#-technology-stack) • [Quick Start](#-quick-start--installation) • [API Docs](#-api-architecture) • [Security](#-security--data-isolation)

</div>

---

## Summary

**ApexPOS** is an end-to-end cloud-native retail management ecosystem engineered to bridge high-speed in-store point-of-sale checkout workflows with deep multi-tenant enterprise back-office management. 

Equipped with real-time stock synchronizations across multiple store branches, automated hardware barcode scanning, 80mm thermal receipt printing, omnichannel payment processing (Stripe, Pesapal, Mobile Money, and Customer Credit ledgers), and live P&L reporting, ApexPOS delivers enterprise ERP capabilities wrapped in an intuitive, responsive interface.

---

##  Application Showcase

###  1. Modern SaaS Landing Page

#### Hero & Core Value Proposition
> Fast, responsive, and conversion-optimized landing interface highlighting real-time sales metrics and instant onboarding.

![Landing Page Hero](./screenshots/01-landing-hero.png)

#### Streamlined 3-Step Business Onboarding
> Intuitive self-service setup: Create tenant account, import inventory via CSV or barcode scanner, and start processing sales instantly.

![Landing Page How It Works](./screenshots/02-landing-how-it-works.png)

#### Enterprise CTA & Ecosystem Navigation
> Flexible subscription model gateway (Starter, Business, Enterprise) with transparent feature tiering.

![Landing Page CTA and Footer](./screenshots/03-landing-cta.png)

---

###  2. Executive Management Dashboard

#### Real-Time KPI Cards & Fast Action Controls
> Immediate visibility into daily revenue, active orders, gross profit margins, low stock alerts, and outstanding credit balances, with 1-click access to the POS terminal, P&L reports, returns, and barcode printing.

![Dashboard Overview & Metric Cards](./screenshots/04-dashboard-overview.png)

#### Real-Time Financial Analytics & Top Product Rankings
> Visual revenue trends, COGS (Cost of Goods Sold) breakdown, live expense reconciliation, top-selling product velocity, and recent transaction audits.

![Dashboard Analytics & Sales Trend](./screenshots/05-dashboard-analytics.png)

---

##  Key Features

### Multi-Tenant & Multi-Branch Architecture
- **Strict Data Isolation:** Multi-tenant MongoDB schema with tenant-scoped query middleware ensuring 100% data partition between organizations.
- **Multi-Branch Operations:** Manage multiple store locations under a single company profile with branch-specific stock levels and cash registers.
- **Super Admin Portal:** Comprehensive SaaS admin center for tenant lifecycle management, subscription enforcement, and system health telemetry.

### Lightning-Fast POS Checkout Terminal
- **Hardware & Camera Barcode Scanning:** Dual-mode barcode scanner engine supporting both physical USB laser scanners and real-time webcam/mobile camera scanning via ZXing.
- **Optimized Cart Workflow:** Quick item lookup, keyboard shortcuts, instant quantity modifications, dynamic line-item discounts, and tax computation.
- **Flexible Checkout Channels:** Seamless support for Cash, Credit Card, Mobile Money (MTN MoMo / Airtel Money), Split Payments, and "Pay Later" Customer Credit.
- **Thermal Receipt Generation:** Native 80mm & 58mm ESC/POS formatted receipt generator with dynamic logo, itemized breakdown, tax rates, and verification barcodes.

### Inventory & Stock Control ERP
- **Real-Time Stock Decrement:** Atomic inventory deduction on completed transactions with automatic replenishment upon processed customer returns.
- **Automated Low-Stock Telemetry:** Proactive visual warnings and notifications for items breaching safety thresholds.
- **Purchase Orders & Vendor Ledger:** Full PO lifecycle from draft creation to Goods Received Notes (GRN) and Accounts Payable tracking.
- **Barcode Label Studio:** Integrated barcode label designer supporting Code128, EAN-13, and QR codes for instant printable sticker sheets.

### Financial Intelligence & P&L Analytics
- **Live Gross Profit Margin:** Accurate COGS tracking ensuring profit calculations reflect actual cost basis of sold goods.
- **Comprehensive Expense Tracker:** Category-wise expense management with receipt attachments and automated net profit deduction.
- **Accounts Receivable / Credit Ledger:** Dedicated debtor ledger to track walk-in and corporate customer credit with partial settlement tracking.
- **Exportable Reports:** Export daily, monthly, and annual financial statements to Excel, CSV, or printable PDF.

---

## Technology Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Frontend Framework** | React 18 + Vite | High-performance SPA with sub-millisecond HMR |
| **Routing** | React Router v6 | Client-side routing with guarded role/tenant routes |
| **State & UI** | React Context + Vanilla CSS | Custom design system with glassmorphism & dark/light palettes |
| **Data Visualization** | Recharts | Interactive financial curves, bar charts, and sales distributions |
| **Hardware / Barcodes** | ZXing Browser + JsBarcode | Real-time optical & laser scanner hardware integration |
| **Backend Runtime** | Node.js (LTS) + Express | RESTful API micro-architecture with modular controllers |
| **Database & ODM** | MongoDB Atlas + Mongoose | Scalable document store with indexed multi-tenant tenancy |
| **Authentication** | JWT + Bcrypt.js | Stateless bearer tokens with encrypted credential storage |
| **Payments** | Stripe SDK + Pesapal + MoMo API | Global card payments & African Mobile Money aggregators |
| **File Storage** | Cloudinary + Multer | Cloud-based storage for product images and receipt logos |

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Client Applications                           │
├──────────────────────────┬──────────────────────────┬───────────────────┤
│    Desktop POS Terminal  │    Mobile / Tablet UI    │ Super Admin Panel │
└────────────┬─────────────┴────────────┬─────────────┴───────────┬───────┘
             │                          │                         │
             ▼                          ▼                         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    API Gateway & Middleware Layer                       │
│  - CORS & Rate Limiting                                                 │
│  - JWT Authentication & RBAC (Role-Based Access Control)                │
│  - Tenant Isolation Interceptor (X-Tenant-ID / Context Binding)          │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
             ┌───────────────────────┼───────────────────────┐
             ▼                       ▼                       ▼
┌─────────────────────────┐ ┌──────────────────┐ ┌────────────────────────┐
│   Core POS Services     │ │ Inventory & ERP  │ │ Analytics & Accounting │
│ - Checkout Engine       │ │ - Stock Audit    │ │ - COGS & Gross Profit  │
│ - Payment Gateways      │ │ - Purchase Orders│ │ - Multi-Period P&L     │
│ - Thermal Printer ES/POS│ │ - Vendor Ledger  │ │ - Credit Tracking      │
└────────────┬────────────┘ └────────┬─────────┘ └───────────┬────────────┘
             │                       │                       │
             ▼                       ▼                       ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    Database & Persistence Layer                         │
│   MongoDB Atlas (Multi-Tenant Partitioned Collections & Indexed Keys)   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Repository Structure

```text
pos-platform/
├── backend/                        # Express.js REST API Server
│   ├── config/                     # Database & Cloudinary configurations
│   ├── controllers/                # Business logic & request handlers
│   │   ├── authController.js       # Auth, signup & tenant provisioning
│   │   ├── dashboardController.js  # KPI telemetry & analytics aggregation
│   │   ├── inventoryController.js  # Stock transactions & audit logs
│   │   ├── productController.js    # SKU catalog & barcode indexing
│   │   ├── purchaseController.js   # Vendor POs & GRN processing
│   │   ├── reportController.js     # P&L, sales & tax report generation
│   │   ├── salesController.js      # Cart checkout, returns & receipts
│   │   └── superAdminController.js # Multi-tenant management & billing
│   ├── middleware/                 # Auth, tenant context & validation
│   ├── models/                     # Mongoose schemas (Tenant-scoped)
│   ├── routes/                     # Modular API endpoints
│   ├── seeders/                    # Database initial seeders
│   ├── server.js                   # Application entry point
│   ├── package.json
│   └── .env.example
│
├── frontend/                       # React 18 Single Page Application
│   ├── public/                     # Static icons & branding assets
│   ├── src/
│   │   ├── components/             # Reusable UI components & scanner modules
│   │   │   ├── BarcodeScanner.jsx  # Optical & USB hardware scanner
│   │   │   ├── Navbar.jsx          # Dynamic role-based navigation bar
│   │   │   ├── ReceiptModal.jsx    # Thermal 80mm ESC/POS print dialog
│   │   │   └── Sidebar.jsx         # Collapsible navigation drawer
│   │   ├── contexts/               # React Auth & Store Context providers
│   │   ├── pages/                  # Route-level view controllers
│   │   │   ├── auth/               # Login, Register & Tenant onboarding
│   │   │   ├── dashboard/          # Executive dashboard & metric cards
│   │   │   ├── inventory/          # Stock adjustments & low-stock alerts
│   │   │   ├── landing/            # SaaS marketing landing page
│   │   │   ├── pos/                # POS cashier checkout terminal
│   │   │   ├── products/           # Product CRUD & barcode management
│   │   │   ├── reports/            # P&L statements & sales ledger
│   │   │   └── super-admin/        # Global platform monitoring
│   │   ├── services/               # Axios API client & interceptors
│   │   ├── styles/                 # Global CSS design system & tokens
│   │   ├── App.jsx                 # Routing hierarchy & route guards
│   │   └── main.jsx                # React root bootstrap
│   ├── package.json
│   └── .env.example
│
├── screenshots/                    # High-resolution UI showcase images
└── README.md                       # Comprehensive documentation
```

---

## Quick Start & Installation

### 1. Prerequisites
Ensure you have the following installed on your machine:
- **Node.js**: `v18.0.0` or higher
- **npm**: `v9.0.0` or higher
- **MongoDB**: Local instance (`mongodb://localhost:27017`) or [MongoDB Atlas URI](https://www.mongodb.com/atlas)

---

### 2. Clone the Repository
```bash
git clone https://github.com/YOUR_USERNAME/ApexPOS.git
cd ApexPOS/pos-platform
```

---

### 3. Backend Setup

```bash
# Navigate to backend directory
cd backend

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env
```

Open `.env` in your editor and configure your credentials:
```env
# Server
PORT=5000
NODE_ENV=development

# Database
MONGO_DB_URL=mongodb+srv://<username>:<password>@cluster.mongodb.net/pos_platform?retryWrites=true&w=majority

# Authentication
JWT_SECRET=your_super_secret_jwt_key_here
JWT_EXPIRE=7d

# Cloud Storage (Optional for product images)
CLOUDINARY_CLOUD_NAME=your_cloudinary_name
CLOUDINARY_API_KEY=your_cloudinary_key
CLOUDINARY_API_SECRET=your_cloudinary_secret

# Frontend URL for CORS
FRONTEND_URL=http://localhost:5173
```

Start the backend development server:
```bash
npm run dev
# Server will start on http://localhost:5000
```

---

### 4. Frontend Setup

```bash
# Open a new terminal and navigate to frontend
cd ../frontend

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env
```

Verify your `frontend/.env`:
```env
VITE_API_URL=http://localhost:5000/api
```

Start the Vite development server:
```bash
npm run dev
# Frontend will be live on http://localhost:5173
```
---

##  API Architecture

All endpoints are prefixed with `/api` and require a valid Bearer token (except public auth & landing endpoints).

###  Authentication & Tenants (`/api/auth`)
| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Register new business tenant & admin | Public |
| `POST` | `/api/auth/login` | Authenticate user & return JWT token | Public |
| `GET` | `/api/auth/me` | Retrieve active authenticated session | Authenticated |

###  Point of Sale & Transactions (`/api/sales`)
| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/sales` | Process checkout & deduct inventory | Cashier / Admin |
| `GET` | `/api/sales` | List transactions with filters | Cashier / Admin |
| `GET` | `/api/sales/:id` | Get receipt details by Order # | Cashier / Admin |
| `POST` | `/api/sales/:id/return` | Process return & restock inventory | Admin / Manager |

###  Products & Barcodes (`/api/products`)
| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/products` | Query products by category or barcode | Authenticated |
| `POST` | `/api/products` | Create product with SKU & cost price | Admin / Manager |
| `PUT` | `/api/products/:id` | Update product metadata & pricing | Admin / Manager |
| `DELETE`| `/api/products/:id` | Soft-delete product from catalog | Admin |

###  Analytics & Reports (`/api/reports`)
| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/reports/dashboard` | Aggregated revenue, gross profit & metrics | Admin / Manager |
| `GET` | `/api/reports/pnl` | Multi-period Profit & Loss statement | Admin |
| `GET` | `/api/reports/top-products`| Sales volume & product performance | Admin / Manager |

---
##  Security & Data Isolation

- **Tenant Isolation:** Every operational database collection (`Product`, `Sale`, `Customer`, `Purchase`, `Expense`) enforces an indexed `tenantId` field. Backend controllers strictly enforce tenant binding derived from validated JWT tokens.
- **Cryptographic Security:** Passwords hashed with `bcryptjs` using a salt work factor of 10.
- **Input Sanitization:** All payload parameters are validated and sanitized via express middleware to prevent NoSQL injection and XSS vectors.
- **Safe Environment Guarding:** Sensitive credentials, database URIs, and webhook secrets are isolated strictly within `.env` files that are untracked by Git.

---

##  Contributing

Contributions are what make the open-source community an incredible place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'feat: Add AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request


