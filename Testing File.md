# 🚀 POS Platform — Real Environment Testing Guide

> [!NOTE]
> The POS Platform is now connected **100% to live MongoDB Atlas** (`ac-q8u29un-shard-00-01.3alckpe.mongodb.net`).
> All data you enter (products, sales, customers, vendors, users) is saved permanently in the database and persists across server restarts.

---

## 🔑 Default Credentials (Seeded Real Data)

| Role | Email | Password |
|---|---|---|
| **Admin Store Owner** | `admin@pos.com` | `adminpassword123` |

---

## 🧪 Step-by-Step Manual Testing Walkthrough

Follow these 7 steps to test the application like a real store owner & cashier:

### Step 1: Login to the Application
1. Open your browser and navigate to: **`http://localhost:5173/login`**
2. Enter the admin credentials:
   - **Email:** `admin@pos.com`
   - **Password:** `adminpassword123`
3. Click **Login**. You will be redirected to the **Dashboard**.

---

### Step 2: Test Real-Time Product Management
1. Click **Products** in the sidebar navigation (`http://localhost:5173/products`).
2. You will see 10 real seeded products (e.g. *iPhone 15 Pro*, *Organic Whole Milk 1L*, *Nike Air Max Sneakers*).
3. **Add a New Real Product**:
   - Click **+ Add Product** button.
   - Enter:
     - **Name**: `MacBook Pro M3 14-inch`
     - **SKU**: ` `
     - **Category**: Select `Electronics`
     - **Price**: `1599.00`
     - **Cost Price**: `1200.00`
     - **Initial Stock**: `15`
     - **Barcode**: `8909876543210`
   - Click **Save Product**.
4. **Verification**: The product appears in your list immediately, and an initial **Inventory record of 15 units** is automatically created in MongoDB.

---

### Step 3: Test Real Category Creation
1. Click **Categories** in the sidebar (`http://localhost:5173/categories`).
2. Click **+ Add Category**.
3. Name: `Gaming & Consoles` | Description: `PlayStation, Xbox, and gaming accessories`.
4. Click **Save**.
5. **Verification**: The category is saved to MongoDB. Navigating to **Products → New Product** will now show `Gaming & Consoles` in the category dropdown.

---

### Step 4: Test POS Terminal Sale & Stock Deduction
1. Click **POS Terminal** in the sidebar (`http://localhost:5173/terminal` or top bar `/pos`).
2. Click on **iPhone 15 Pro 128GB** to add it to the cart (Current Stock: 20).
3. Add **2 x Organic Whole Milk 1L** to the cart (Current Stock: 100).
4. In the checkout panel:
   - Select Payment Method: **Cash** (or Card / Mobile Money).
   - Enter amount tendered or click **Complete Sale**.
5. Click **Complete Sale**. A success notification appears, and the receipt modal is displayed!
6. **Stock Verification**:
   - Go back to **Products** list (`http://localhost:5173/products`).
   - Observe **iPhone 15 Pro** stock has automatically decreased from **20 → 19**.
   - Observe **Organic Whole Milk** stock has automatically decreased from **100 → 98**.

---

### Step 5: Test Purchasing & Stock Replenishment
1. Click **Vendors** (`http://localhost:5173/vendors`) → Click **+ Add Vendor**.
   - Name: `Tech Wholesale Co.` | Phone: `+1 800-123-4567` | Email: `orders@techwholesale.com`.
2. Click **Purchases** (`http://localhost:5173/purchases`) → Click **+ New Purchase Order**.
   - Select Vendor: `Tech Wholesale Co.`
   - Add Product: `iPhone 15 Pro 128GB` | Quantity: `10` | Unit Cost: `750.00`.
   - Click **Save PO** (Status: `Draft` / `Ordered`).
3. Click **Receive Items** on the newly created Purchase Order.
4. **Verification**:
   - Go to **Products** list.
   - **iPhone 15 Pro** stock has increased from **19 → 29**!

---

### Step 6: Test Real Sales & Inventory Reports 
1. Click **Reports** in the sidebar (`http://localhost:5173/reports`).
2. Select **Sales Report**:
   - Shows real revenue from completed sales (e.g. `$1,005.98`).
   - The revenue chart reflects the exact sales made in Step 4.
   - Payment method breakdown shows exact Cash vs Card totals.
3. Select **Inventory Report**:
   - Shows real total valuation of all stock currently in your database (`Quantity × Cost Price`).
   - Displays real low-stock warning items when stock drops below threshold.

---

### Step 7: Test Admin User & Cashier Role Creation
1. Click **Settings** in the sidebar (`http://localhost:5173/settings`).
2. Click on the **Users & Roles** tab.
3. Click **+ Add User**:
   - **Name**: `John Frontdesk`
   - **Email**: `cashier1@pos.com`
   - **Password**: `cashierpass123`
   - **Role**: `cashier`
4. Click **Save User**.
5. **Test Cashier Login**:
   - Click **Logout** at the bottom of the sidebar.
   - Log in with: Email: `cashier1@pos.com` | Password: `cashierpass123`.
   - **Verification**: `John Frontdesk` logs in smoothly, has cashier privileges, and can process sales in the POS terminal!

---

## 🔒 Summary of Real Backend Systems

| Feature | Backend Handler | Real DB Action |
|---|---|---|
| **Auth** | `authController.js` | Generates real JWT tokens & verifies user password hashes via `bcryptjs` |
| **Products** | `productController.js` | Writes product records directly to MongoDB `Product` collection |
| **Stock Sync** | `inventoryController.js` | Updates `Inventory` collection and `Product.stock` field atomically |
| **Sales** | `salesController.js` | Creates `SalesOrder` records & decrements product stock live |
| **Purchases** | `purchaseController.js` | Creates `PurchaseOrder` & increments stock when received |
| **Reports** | `reportController.js` | Runs live aggregations over MongoDB `SalesOrder` & `Inventory` documents |
