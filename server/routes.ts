import {
  categories,
  customers,
  employees,
  insertEmployeeSchema,
  insertOrderItemSchema,
  insertOrderSchema,
  insertProductSchema,
  insertStoreSettingsSchema,
  insertSupplierSchema,
  insertTableSchema,
  insertTransactionItemSchema,
  invoices,
  orderItems as orderItemsTable,
  orders,
  printerConfigs,
  products,
  tables,
  transactionItems as transactionItemsTable,
  transactions as transactionsTable
} from "@shared/schema";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  lte,
  ne,
  or,
  sql
} from "drizzle-orm";
import type { Express } from "express";
import { createServer, type Server } from "http";
import WebSocket from "ws";
import { z } from "zod";
import { db, initializeSampleData } from "./db";
import { storage } from "./storage";
import {
  getTenantDatabase,
  tenantMiddleware,
  TenantRequest,
} from "./tenant-middleware";
import { registerTenantRoutes } from "./tenant-routes";

// Helper function to get payment method display name
function getPaymentMethodName(method: string | number): string {
  switch (method) {
    case 1:
    case "cash":
      return "Tiền mặt";
    case 2:
    case "creditCard":
    case "debitCard":
      return "Chuyển khoản";
    case 3:
      return "TM/CK";
    case 4:
    case "qrCode":
    case "momo":
    case "zalopay":
    case "vnpay":
    case "grabpay":
      return "QR Code";
    case "einvoice":
      return "Hóa đơn điện tử";
    default:
      return "Tiền mặt";
  }
}

// Helper function to get e-invoice status display name
function getEInvoiceStatusName(status: number): string {
  const statusNames = {
    0: "Chưa phát hành",
    1: "Đã phát hành",
    2: "Tạo nháp",
    3: "Đã duyệt",
    4: "Đã bị thay thế (hủy)",
    5: "Thay thế tạm",
    6: "Thay thế",
    7: "Đã bị điều chỉnh",
    8: "Điều chỉnh tạm",
    9: "Điều chỉnh",
    10: "Đã hủy",
  };
  return statusNames[status as keyof typeof statusNames] || "Chưa phát hành";
}

// Helper function to get invoice status display name
function getInvoiceStatusName(status: number): string {
  const statusNames = {
    1: "Hoàn thành",
    2: "Đang phục vụ",
    3: "Đã hủy",
  };
  return statusNames[status as keyof typeof statusNames] || "Hoàn thành";
}

// Function to calculate discount distribution among order items
function calculateDiscountDistribution(items: any[], totalDiscount: number) {
  if (!items || items.length === 0 || totalDiscount <= 0) {
    return items.map((item) => ({ ...item, discount: 0 }));
  }

  // Calculate total amount (subtotal before discount)
  const totalAmount = items.reduce((sum, item) => {
    const unitPrice = Number(item.unitPrice || 0);
    const quantity = Number(item.quantity || 0);
    return sum + unitPrice * quantity;
  }, 0);

  if (totalAmount <= 0) {
    return items.map((item) => ({ ...item, discount: 0 }));
  }

  let allocatedDiscount = 0;
  const result = items.map((item, index) => {
    const unitPrice = Number(item.unitPrice || 0);
    const quantity = Number(item.quantity || 0);
    const itemTotal = unitPrice * quantity;

    let itemDiscount = 0;

    if (index === items.length - 1) {
      // Last item gets remaining discount to ensure total matches exactly
      itemDiscount = Math.max(0, totalDiscount - allocatedDiscount);
    } else {
      // Calculate proportional discount: Total discount * item amount / total amount
      const proportionalDiscount = (totalDiscount * itemTotal) / totalAmount;
      itemDiscount = Math.round(proportionalDiscount); // Round to nearest dong
      allocatedDiscount += itemDiscount;
    }

    return {
      ...item,
      discount: itemDiscount.toFixed(2),
    };
  });

  console.log(
    `💰 Discount Distribution: Total=${totalDiscount}, Allocated=${allocatedDiscount + Number(result[result.length - 1].discount)}`,
  );
  return result;
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Register tenant management routes
  registerTenantRoutes(app);

  // Apply tenant middleware to all API routes
  app.use("/api", tenantMiddleware);

  // Initialize sample data
  await initializeSampleData();

  // Ensure inventory_transactions table exists
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS inventory_transactions (
        id SERIAL PRIMARY KEY,
        product_id INTEGER REFERENCES products(id) NOT NULL,
        type VARCHAR(20) NOT NULL,
        quantity INTEGER NOT NULL,
        previous_stock INTEGER NOT NULL,
        new_stock INTEGER NOT NULL,
        notes TEXT,
        created_at VARCHAR(50) NOT NULL
      )
    `);
  } catch (error) {
    console.log(
      "Inventory transactions table already exists or creation failed:",
      error,
    );
  }

  // Categories
  app.get(
    "/api/categories",
    tenantMiddleware,
    async (req: TenantRequest, res) => {
      try {
        console.log("🔍 GET /api/categories - Starting request processing");
        let tenantDb;
        try {
          tenantDb = await getTenantDatabase(req);
          console.log("✅ Tenant database connection obtained for categories");
        } catch (dbError) {
          console.error(
            "❌ Failed to get tenant database for categories:",
            dbError,
          );
          tenantDb = null;
        }

        const categories = await storage.getCategories(tenantDb);
        console.log(`✅ Successfully fetched ${categories.length} categories`);
        res.json(categories);
      } catch (error) {
        console.error("❌ Error fetching categories:", error);
        res.status(500).json({
          error: "Failed to fetch categories",
        });
      }
    },
  );

  app.post("/api/categories", async (req: TenantRequest, res) => {
    try {
      const { name, icon } = req.body;
      const tenantDb = await getTenantDatabase(req);

      if (!name || !name.trim()) {
        return res.status(400).json({
          error: "Category name is required",
        });
      }

      const categoryData = {
        name: name.trim(),
        icon: icon || "fas fa-utensils",
      };

      const category = await storage.createCategory(categoryData, tenantDb);
      res.json(category);
    } catch (error) {
      console.error("Error creating category:", error);
      res.status(500).json({
        error: "Failed to create category",
      });
    }
  });

  app.put("/api/categories/:id", async (req: TenantRequest, res) => {
    try {
      const categoryId = parseInt(req.params.id);
      const { name, icon } = req.body;
      const tenantDb = await getTenantDatabase(req);

      if (!name || !name.trim()) {
        return res.status(400).json({
          error: "Category name is required",
        });
      }

      const categoryData = {
        name: name.trim(),
        icon: icon || "fas fa-utensils",
      };

      const category = await storage.updateCategory(
        categoryId,
        categoryData,
        tenantDb,
      );
      res.json(category);
    } catch (error) {
      console.error("Error updating category:", error);
      res.status(500).json({
        error: "Failed to update category",
      });
    }
  });

  app.delete("/api/categories/:id", async (req: TenantRequest, res) => {
    try {
      const categoryId = parseInt(req.params.id);
      const tenantDb = await getTenantDatabase(req);

      // Check if category has products
      const products = await storage.getProductsByCategory(
        categoryId,
        tenantDb,
      );
      if (products.length > 0) {
        return res.status(400).json({
          error: `Không thể xóa danh mục vì còn ${products.length} sản phẩm. Vui lòng xóa hoặc chuyển các sản phẩm sang danh mục khác trước.`,
        });
      }

      await storage.deleteCategory(categoryId, tenantDb);
      res.json({
        success: true,
      });
    } catch (error) {
      console.error("Error deleting category:", error);

      // Handle foreign key constraint errors
      if (
        error instanceof Error &&
        error.message.includes("foreign key constraint")
      ) {
        return res.status(400).json({
          error:
            "Không thể xóa danh mục vì vẫn còn sản phẩm thuộc danh mục này. Vui lòng xóa hoặc chuyển các sản phẩm sang danh mục khác trước.",
        });
      }

      res.status(500).json({
        error: "Có lỗi xảy ra khi xóa danh mục",
      });
    }
  });

  // Products
  app.get(
    "/api/products",
    tenantMiddleware,
    async (req: TenantRequest, res) => {
      try {
        console.log("🔍 GET /api/products - Starting request processing");
        let tenantDb;
        try {
          tenantDb = await getTenantDatabase(req);
          console.log("✅ Tenant database connection obtained for products");
        } catch (dbError) {
          console.error(
            "❌ Failed to get tenant database for products:",
            dbError,
          );
          tenantDb = null;
        }

        const products = await storage.getProducts(tenantDb);
        console.log(`✅ Successfully fetched ${products.length} products`);
        res.json(products);
      } catch (error) {
        console.error("❌ Error fetching products:", error);
        res.status(500).json({
          error: "Failed to fetch products",
        });
      }
    },
  );

  // Endpoint for POS to get only active products
  app.get("/api/products/active", async (req: TenantRequest, res) => {
    try {
      const tenantDb = await getTenantDatabase(req);
      const products = await storage.getActiveProducts(tenantDb);
      res.json(products);
    } catch (error) {
      res.status(500).json({
        message: "Failed to fetch active products",
      });
    }
  });

  // Get single product by ID
  app.get("/api/products/:id", async (req: TenantRequest, res) => {
    try {
      const productId = parseInt(req.params.id);
      if (isNaN(productId)) {
        return res.status(400).json({
          error: "Invalid product ID",
        });
      }

      const tenantDb = await getTenantDatabase(req);

      const [product] = await db
        .select({
          id: products.id,
          name: products.name,
          sku: products.sku,
          price: products.price,
          stock: products.stock,
          categoryId: products.categoryId,
          categoryName: categories.name,
          imageUrl: products.imageUrl,
          isActive: products.isActive,
          productType: products.productType,
          trackInventory: products.trackInventory,
          taxRate: products.taxRate,
          priceIncludesTax: products.priceIncludesTax,
          afterTaxPrice: products.afterTaxPrice,
        })
        .from(products)
        .leftJoin(categories, eq(products.categoryId, categories.id))
        .where(and(eq(products.id, productId), eq(products.isActive, true)))
        .limit(1);

      if (!product) {
        return res.status(404).json({
          error: "Product not found",
        });
      }

      console.log(`=== SINGLE PRODUCT API DEBUG ===`);
      console.log(`Product ID: ${product.id}`);
      console.log(`Name: ${product.name}`);
      console.log(`Price: ${product.price}`);
      console.log(`Tax Rate: ${product.taxRate}`);
      console.log(`After Tax Price: ${product.afterTaxPrice}`);

      res.json(product);
    } catch (error) {
      console.error("Error fetching single product:", error);
      res.status(500).json({
        error: "Failed to fetch product",
      });
    }
  });

  app.post("/api/products", async (req: TenantRequest, res) => {
    try {
      console.log("Product creation request body:", req.body);
      const tenantDb = await getTenantDatabase(req);

      // Ensure required fields are present
      if (
        !req.body.name ||
        !req.body.sku ||
        !req.body.price ||
        !req.body.categoryId ||
        req.body.taxRate === undefined
      ) {
        return res.status(400).json({
          message:
            "Missing required fields: name, sku, price, categoryId, and taxRate are required",
        });
      }

      // Validate and transform the data
      const validatedData: any = insertProductSchema.parse({
        name: req.body.name,
        sku: req.body.sku,
        price: req.body.price.toString(),
        stock: Number(req.body.stock) || 0,
        categoryId: Number(req.body.categoryId),
        productType: Number(req.body.productType) || 1,
        trackInventory: req.body.trackInventory !== false,
        imageUrl: req.body.imageUrl || null,
        taxRate: req.body.taxRate.toString(),
        afterTaxPrice:
          req.body.afterTaxPrice && req.body.afterTaxPrice.trim() !== ""
            ? req.body.afterTaxPrice.toString()
            : null,
      });

      console.log("Validated product data:", validatedData);

      // Check if SKU already exists (including inactive products)
      const [existingProduct] = await db
        .select()
        .from(products)
        .where(eq(products.sku, validatedData.sku));

      if (existingProduct) {
        console.log("SKU already exists:", validatedData.sku);
        return res.status(409).json({
          message: `SKU "${validatedData.sku}" đã tồn tại trong hệ thống`,
          code: "DUPLICATE_SKU",
        });
      }

      const product = await storage.createProduct(validatedData, tenantDb);
      console.log("Product created successfully:", product);
      res.status(201).json(product);
    } catch (error) {
      console.error("Product creation error:", error);
      if (error instanceof z.ZodError) {
        console.error("Validation errors:", error.errors);
        return res.status(400).json({
          message: "Invalid product data",
          errors: error.errors,
          details: error.format(),
        });
      }
      res.status(500).json({
        message: "Failed to create product",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.put("/api/products/:id", async (req: TenantRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      console.log("Product update request:", id, req.body);

      // Transform data to ensure proper types
      const transformedData = {
        ...req.body,
        price: req.body.price ? req.body.price.toString() : undefined,
        taxRate: req.body.taxRate ? req.body.taxRate.toString() : undefined,
        afterTaxPrice:
          req.body.afterTaxPrice && req.body.afterTaxPrice.trim() !== ""
            ? req.body.afterTaxPrice.toString()
            : null,
        priceIncludesTax: req.body.priceIncludesTax || false,
        trackInventory: req.body.trackInventory !== false,
      };

      // Remove undefined fields
      Object.keys(transformedData).forEach((key) => {
        if (transformedData[key] === undefined) {
          delete transformedData[key];
        }
      });

      console.log("Transformed update data:", transformedData);

      const validatedData: any = insertProductSchema
        .partial()
        .parse(transformedData);
      const tenantDb = await getTenantDatabase(req);
      const product = await storage.updateProduct(id, validatedData, tenantDb);

      if (!product) {
        return res.status(404).json({
          message: "Product not found",
        });
      }

      console.log("Product updated successfully:", product);
      res.json(product);
    } catch (error) {
      console.error("Product update error:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: "Invalid product data",
          errors: error.errors,
        });
      }
      res.status(500).json({
        message: "Failed to update product",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.delete("/api/products/:id", async (req: TenantRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const tenantDb = await getTenantDatabase(req);
      const deleted = await storage.deleteProduct(id, tenantDb);

      if (!deleted) {
        return res.status(404).json({
          message: "Product not found",
        });
      }

      res.json({
        message: "Product deleted successfully",
      });
    } catch (error) {
      console.error("Delete product error:", error);

      if (error instanceof Error) {
        if (error.message.includes("Cannot delete product")) {
          return res.status(400).json({
            message: error.message,
            code: "PRODUCT_IN_USE",
          });
        }
      }

      res.status(500).json({
        message: "Failed to delete product",
      });
    }
  });

  // New endpoint to cleanup inactive products
  app.delete(
    "/api/products/cleanup/inactive",
    async (req: TenantRequest, res) => {
      try {
        const tenantDb = await getTenantDatabase(req);
        const deletedCount = await storage.deleteInactiveProducts(tenantDb);
        res.json({
          message: `Successfully deleted ${deletedCount} inactive products`,
          deletedCount,
        });
      } catch (error) {
        res.status(500).json({
          message: "Failed to cleanup inactive products",
        });
      }
    },
  );

  app.get("/api/products/barcode/:sku", async (req: TenantRequest, res) => {
    try {
      const sku = req.params.sku;
      const tenantDb = await getTenantDatabase(req);
      const product = await storage.getProductBySku(sku, tenantDb);

      if (!product) {
        return res.status(404).json({
          message: "Product not found",
        });
      }

      res.json(product);
    } catch (error) {
      res.status(500).json({
        message: "Failed to fetch product by SKU",
      });
    }
  });

  // Transactions - Now creates orders instead for unified data storage
  app.post("/api/transactions", async (req: TenantRequest, res) => {
    try {
      const { transaction, items } = req.body;
      const tenantDb = await getTenantDatabase(req);

      console.log(
        "Received POS transaction data (will create order):",
        JSON.stringify(
          {
            transaction,
            items,
          },
          null,
          2,
        ),
      );

      // Transaction validation schema
      const transactionSchema = z.object({
        transactionId: z.string(),
        subtotal: z.string(),
        tax: z.string(),
        total: z.string(),
        paymentMethod: z.string(),
        cashierName: z.string(),
        notes: z.string().optional(),
        invoiceNumber: z.string().nullable().optional(),
        invoiceId: z.number().nullable().optional(),
        orderId: z.number().optional(),
      });

      const validatedTransaction = transactionSchema.parse(transaction);
      const validatedItems: any = z.array(insertTransactionItemSchema).parse(items);

      // Fetch products for validation and tax calculation
      const products = await storage.getAllProducts(true, tenantDb);

      // Validate stock and calculate totals
      let subtotal = 0;
      let tax = 0;
      const stockValidationErrors = [];
      const orderItems = [];

      for (const item of validatedItems) {
        const product: any = products.find((p) => p.id === item.productId);
        if (!product) {
          return res.status(400).json({
            message: `Product with ID ${item.productId} not found`,
          });
        }

        // Check stock availability
        if (product.trackInventory && product.stock < item.quantity) {
          const errorMsg = `Insufficient stock for ${product.name}. Available: ${product.stock}, Requested: ${item.quantity}`;
          console.log(`❌ ${errorMsg}`);
          stockValidationErrors.push(errorMsg);
          continue;
        }

        const itemSubtotal = parseFloat(item.price) * item.quantity;
        let itemTax = 0;

        // Calculate tax
        if (
          product.afterTaxPrice &&
          product.afterTaxPrice !== null &&
          product?.afterTaxPrice.toString() !== ""
        ) {
          const afterTaxPrice = parseFloat(product.afterTaxPrice);
          const price = parseFloat(product.price);
          itemTax = (afterTaxPrice - price) * item.quantity;
        }

        subtotal += itemSubtotal;
        tax += itemTax;

        // Prepare order item
        orderItems.push({
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: item.price,
          total: (parseFloat(item.price) * item.quantity).toString(),
          notes: null,
        });
      }

      if (stockValidationErrors.length > 0) {
        console.warn(
          "⚠️ Stock validation warnings (allowing POS transaction to proceed):",
          stockValidationErrors,
        );
      }

      const total = subtotal + tax;

      // Create order data for POS transaction
      const orderData = {
        orderNumber: validatedTransaction.transactionId, // Use transaction ID as order number
        tableId: null, // POS orders don't have tables
        employeeId: null,
        status: "paid", // POS transactions are immediately paid
        customerName: "Khách hàng",
        customerCount: 1,
        subtotal: subtotal.toFixed(2),
        tax: tax.toFixed(2),
        total: total.toFixed(2),
        paymentMethod: validatedTransaction.paymentMethod,
        paymentStatus: "paid",
        salesChannel: "pos", // Mark as POS order
        einvoiceStatus: 0, // Default e-invoice status
        invoiceId: validatedTransaction.invoiceId || null,
        invoiceNumber: validatedTransaction.invoiceNumber || null,
        notes:
          validatedTransaction.notes ||
          `POS Transaction by ${validatedTransaction.cashierName}`,
        paidAt: new Date(),
      };

      console.log(`💰 Creating POS order with data:`, {
        orderNumber: orderData.orderNumber,
        total: orderData.total,
        paymentMethod: orderData.paymentMethod,
        salesChannel: orderData.salesChannel,
        itemsCount: orderItems.length,
      });

      // Create order using existing order creation logic
      const order = await storage.createOrder(orderData, orderItems, tenantDb);

      // Return in transaction format for compatibility
      const receipt = {
        id: order.id,
        transactionId: order.orderNumber,
        subtotal: order.subtotal,
        tax: order.tax,
        total: order.total,
        paymentMethod: order.paymentMethod,
        cashierName: validatedTransaction.cashierName,
        notes: order.notes,
        invoiceId: order.invoiceId,
        invoiceNumber: order.invoiceNumber,
        createdAt: order.orderedAt,
        items: orderItems.map((item, index) => ({
          id: index + 1,
          transactionId: order.id,
          productId: item.productId,
          productName: item.productName,
          price: item.unitPrice,
          quantity: item.quantity,
          total: item.total,
        })),
      };

      console.log(`✅ POS order created successfully:`, {
        id: order.id,
        orderNumber: order.orderNumber,
        total: order.total,
        salesChannel: order.salesChannel,
      });

      res.status(201).json(receipt);
    } catch (error) {
      console.error("POS transaction creation error:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: "Invalid transaction data",
          errors: error.errors,
          details: error.format(),
        });
      }
      res.status(500).json({
        message: "Failed to create POS transaction",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.get("/api/transactions", async (req: TenantRequest, res) => {
    try {
      const tenantDb = await getTenantDatabase(req);
      const transactions = await storage.getTransactions(tenantDb);
      res.json(transactions);
    } catch (error) {
      res.status(500).json({
        message: "Failed to fetch transactions",
      });
    }
  });

  // Get transactions by date range
  app.get(
    "/api/transactions/:startDate/:endDate",
    async (req: TenantRequest, res) => {
      try {
        const { startDate, endDate } = req.params;

        const start = new Date(startDate);
        start.setUTCHours(0, 0, 0, 0);

        const end = new Date(endDate);
        end.setUTCHours(23, 59, 59, 999);

        const transactions = await db
          .select()
          .from(transactionsTable)
          .where(
            and(
              gte(transactionsTable.createdAt, start),
              lte(transactionsTable.createdAt, end),
            ),
          )
          .orderBy(desc(transactionsTable.createdAt));

        // Always return an array, even if empty
        res.json(transactions || []);
      } catch (error) {
        console.error("Error fetching transactions:", error);
        // Return empty array instead of error for reports
        res.json([]);
      }
    },
  );

  // API lấy danh sách đơn hàng với filter và pagination
  app.get("/api/orders/list", async (req: TenantRequest, res) => {
    try {
      const {
        startDate,
        endDate,
        customerName,
        orderNumber,
        customerCode,
        status,
        salesChannel,
        einvoiceStatus,
        invoiceStatus,
        paymentMethod,
        page = "1",
        limit,
        sortBy = "orderedAt",
        sortOrder = "desc",
      } = req.query;

      const pageNum = parseInt(page as string);
      const limitNum = limit ? parseInt(limit as string) : null;
      const offset = limitNum ? (pageNum - 1) * limitNum : 0;

      console.log("🔍 GET /api/orders/list - Filter params:", {
        startDate,
        endDate,
        customerName,
        orderNumber,
        customerCode,
        status,
        salesChannel,
        einvoiceStatus,
        invoiceStatus,
        paymentMethod,
        page: pageNum,
        limit: limitNum,
      });

      const tenantDb = await getTenantDatabase(req);
      const database = tenantDb || db;

      // Build where conditions
      const whereConditions = [];

      // Date range filter - support yyyyMMdd format
      if (startDate && endDate) {
        let start: Date;
        let end: Date;

        // Check if date is in yyyyMMdd format (8 digits)
        if (
          typeof startDate === "string" &&
          startDate.length === 8 &&
          /^\d{8}$/.test(startDate)
        ) {
          // Parse yyyyMMdd format
          const year = parseInt(startDate.substring(0, 4));
          const month = parseInt(startDate.substring(4, 6)) - 1; // Month is 0-indexed
          const day = parseInt(startDate.substring(6, 8));
          start = new Date(year, month, day, 0, 0, 0, 0);
        } else {
          // Parse standard date format
          start = new Date(startDate as string);
          start.setHours(0, 0, 0, 0);
        }

        if (
          typeof endDate === "string" &&
          endDate.length === 8 &&
          /^\d{8}$/.test(endDate)
        ) {
          // Parse yyyyMMdd format
          const year = parseInt(endDate.substring(0, 4));
          const month = parseInt(endDate.substring(4, 6)) - 1; // Month is 0-indexed
          const day = parseInt(endDate.substring(6, 8));
          end = new Date(year, month, day, 23, 59, 59, 999);
        } else {
          // Parse standard date format
          end = new Date(endDate as string);
          end.setHours(23, 59, 59, 999);
        }

        whereConditions.push(
          gte(orders.orderedAt, start),
          lte(orders.orderedAt, end),
        );
      }

      // Customer name filter
      if (customerName) {
        whereConditions.push(ilike(orders.customerName, `%${customerName}%`));
      }

      // Order number filter
      if (orderNumber) {
        whereConditions.push(ilike(orders.orderNumber, `%${orderNumber}%`));
      }

      // Status filter
      if (status && status !== "all") {
        whereConditions.push(eq(orders.status, status as string));
      }

      // Sales channel filter
      if (salesChannel && salesChannel !== "all") {
        whereConditions.push(eq(orders.salesChannel, salesChannel as string));
      }

      // E-invoice status filter
      if (einvoiceStatus !== undefined && einvoiceStatus !== "all") {
        whereConditions.push(
          eq(orders.einvoiceStatus, parseInt(einvoiceStatus as string)),
        );
      }

      // Invoice status filter
      if (invoiceStatus !== undefined && invoiceStatus !== "all") {
        whereConditions.push(
          // @ts-ignore
          eq(orders.invoiceStatus, parseInt(invoiceStatus as string)),
        );
      }

      // Payment method filter - include null values (unpaid orders)
      if (paymentMethod && paymentMethod !== "all") {
        if (paymentMethod === "null" || paymentMethod === "unpaid") {
          // Filter for unpaid orders (paymentMethod is null)
          whereConditions.push(sql`${orders.paymentMethod} IS NULL`);
        } else {
          // Filter for specific payment method
          whereConditions.push(
            eq(orders.paymentMethod, paymentMethod as string),
          );
        }
      }

      // Get total count for pagination
      const [totalCountResult] = await database
        .select({
          count: count(),
        })
        .from(orders)
        .where(
          whereConditions.length > 0 ? and(...whereConditions) : undefined,
        );

      const totalCount = totalCountResult?.count || 0;
      const totalPages = limitNum ? Math.ceil(totalCount / limitNum) : 1;

      // Get paginated orders - simplified query without JOIN
      const orderBy =
        sortOrder === "asc" ? asc(orders.orderedAt) : desc(orders.orderedAt);

      let ordersQuery = database
        .select()
        .from(orders)
        .where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
        .orderBy(orderBy);

      // Apply pagination only if limit is specified
      if (limitNum) {
        ordersQuery = ordersQuery.limit(limitNum).offset(offset);
      }

      const ordersResult = await ordersQuery;

      console.log(
        `✅ Orders list API - Found ${ordersResult.length} orders${limitNum ? ` (page ${pageNum}/${totalPages})` : " (all orders)"}`,
      );

      // Get employee data separately for all orders
      const employeeIds = [
        // @ts-ignore
        ...new Set(
          ordersResult?.map((order) => order.employeeId).filter(Boolean),
        ),
      ];
      let employeeMap = new Map();

      if (employeeIds.length > 0) {
        try {
          const employeeData = await database
            .select({
              id: employees.id,
              employeeId: employees.employeeId,
              name: employees.name,
            })
            .from(employees)
            .where(sql`${employees.id} = ANY(${employeeIds})`);

          employeeMap = new Map(employeeData.map((emp) => [emp.id, emp]));
        } catch (empError) {
          console.warn(
            "⚠️ Error fetching employee data, continuing without:",
            empError,
          );
        }
      }

      // Process orders to ensure consistent field structure
      const processedOrders = ordersResult.map((order, index) => {
        const employee = order.employeeId
          ? employeeMap.get(order.employeeId)
          : null;

        return {
          ...order,
          customerCode:
            order.customerTaxCode ||
            `KH000${String(index + 1).padStart(3, "0")}`,
          customerName: order.customerName || "Khách hàng lẻ",
          discount: order.discount || "0.00",
          // Employee info with fallbacks
          employeeCode: employee?.employeeId || "NV0001",
          employeeName: employee?.name || "Nhân viên",
          // Payment method details
          paymentMethodName: getPaymentMethodName(order.paymentMethod),
          // Invoice status details
          einvoiceStatusName: getEInvoiceStatusName(order.einvoiceStatus || 0),
          invoiceStatusName: getInvoiceStatusName(order.invoiceStatus || 1),
        };
      });

      // Fetch order items for each order
      const ordersWithItems = await Promise.all(
        processedOrders.map(async (order) => {
          try {
            const items = await database
              .select({
                // Order item fields
                id: orderItemsTable.id,
                orderId: orderItemsTable.orderId,
                productId: orderItemsTable.productId,
                quantity: orderItemsTable.quantity,
                unitPrice: orderItemsTable.unitPrice,
                total: orderItemsTable.total,
                discount: orderItemsTable.discount,
                notes: orderItemsTable.notes,
                // Product fields with safe handling
                productName: sql<string>`COALESCE(${products.name}, 'Unknown Product')`,
                productSku: sql<string>`COALESCE(${products.sku}, '')`,
              })
              .from(orderItemsTable)
              .leftJoin(products, eq(orderItemsTable.productId, products.id))
              .where(eq(orderItemsTable.orderId, order.id));

            const processedItems = items.map((item) => ({
              id: item.id,
              orderId: item.orderId,
              productId: item.productId,
              quantity: item.quantity,
              unit: "cái", // Default unit
              unitPrice: item.unitPrice,
              total: item.total,
              discount: item.discount || "0.00",
              notes: item.notes,
              productName: item.productName || "Unknown Product",
              productSku: item.productSku || "",
            }));

            return {
              ...order,
              items: processedItems,
            };
          } catch (itemError) {
            console.error(
              `❌ Error fetching items for order ${order.id}:`,
              itemError,
            );
            return {
              ...order,
              items: [],
            };
          }
        }),
      );

      console.log(
        `✅ Orders list API with items - Found ${ordersWithItems.length} orders with complete details`,
      );

      res.json({
        orders: ordersWithItems,
        pagination: {
          currentPage: pageNum,
          totalPages,
          totalCount,
          limit: limitNum,
          hasNext: limitNum ? pageNum < totalPages : false,
          hasPrev: pageNum > 1,
        },
      });
    } catch (error) {
      console.error("❌ Error in orders list API:", error);
      res.status(500).json({
        error: "Failed to fetch orders list",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Get orders by date range
  app.get(
    "/api/orders/date-range/:startDate/:endDate",
    async (req: TenantRequest, res) => {
      try {
        const { startDate, endDate } = req.params;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 1000; // Increase limit to get all data

        const tenantDb = await getTenantDatabase(req);

        // Parse dates with proper timezone handling
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0); // Start of day in local timezone

        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999); // End of day in local timezone

        console.log("Date range filter:", {
          startDate,
          endDate,
          startParsed: start.toISOString(),
          endParsed: end.toISOString(),
        });

        // Get ALL orders and filter by date range properly
        const allOrdersInDb = await db
          .select()
          .from(orders)
          .orderBy(desc(orders.orderedAt), desc(orders.id));

        // Filter orders by date range in application layer for better control
        const filteredOrders = allOrdersInDb.filter((order) => {
          if (!order.orderedAt) return false;

          const orderDate = new Date(order.orderedAt);

          // Normalize dates for comparison (remove time component)
          const orderDateOnly = new Date(orderDate);
          orderDateOnly.setHours(0, 0, 0, 0);

          const startDateOnly = new Date(start);
          startDateOnly.setHours(0, 0, 0, 0);

          const endDateOnly = new Date(end);
          endDateOnly.setHours(0, 0, 0, 0);

          return orderDateOnly >= startDateOnly && orderDateOnly <= endDateOnly;
        });

        console.log("Orders by date range - Filter results:", {
          totalOrdersInDb: allOrdersInDb.length,
          filteredCount: filteredOrders.length,
          dateRange: `${startDate} to ${endDate}`,
          sampleFilteredOrder: filteredOrders[0]
            ? {
                id: filteredOrders[0].id,
                orderNumber: filteredOrders[0].orderNumber,
                orderedAt: filteredOrders[0].orderedAt,
                status: filteredOrders[0].status,
              }
            : null,
        });

        // Return all filtered orders (no pagination for reports)
        res.json(filteredOrders);
      } catch (error) {
        console.error("Error fetching orders by date range:", error);
        res.status(500).json({
          error: "Failed to fetch orders",
        });
      }
    },
  );

  // Get invoices by date range
  app.get(
    "/api/invoices/date-range/:startDate/:endDate",
    async (req: TenantRequest, res) => {
      try {
        const { startDate, endDate } = req.params;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;

        const tenantDb = await getTenantDatabase(req);

        // Filter by date range using direct database query
        const start = new Date(startDate);
        const end = new Date(endDate);
        end.setUTCHours(23, 59, 59, 999);

        const allInvoices = await db
          .select()
          .from(invoices)
          .where(
            and(
              gte(invoices.invoiceDate, start),
              lte(invoices.invoiceDate, end),
            ),
          )
          .orderBy(
            desc(invoices.createdAt), // Primary sort by creation time (newest first)
            desc(invoices.id), // Secondary sort by ID (newest first)
          );

        // Paginate results
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        const paginatedInvoices = allInvoices.slice(startIndex, endIndex);

        console.log(
          "Invoices by date range - Total found:",
          allInvoices.length,
        );
        console.log("Invoices by date range - Paginated result:", {
          page,
          limit,
          total: allInvoices.length,
          returned: paginatedInvoices.length,
          newestInvoice: paginatedInvoices[0]
            ? {
                id: paginatedInvoices[0].id,
                tradeNumber: paginatedInvoices[0].tradeNumber,
                createdAt: paginatedInvoices[0].createdAt,
              }
            : null,
        });

        res.json(paginatedInvoices);
      } catch (error) {
        console.error("Error fetching invoices by date range:", error);
        res.status(500).json({
          error: "Failed to fetch invoices",
        });
      }
    },
  );

  app.get(
    "/api/transactions/:transactionId",
    async (req: TenantRequest, res) => {
      try {
        const transactionId = req.params.transactionId;
        const tenantDb = await getTenantDatabase(req);
        const receipt = await storage.getTransactionByTransactionId(
          transactionId,
          // @ts-ignore
          tenantDb,
        );

        if (!receipt) {
          return res.status(404).json({
            message: "Transaction not found",
          });
        }

        res.json(receipt);
      } catch (error) {
        res.status(500).json({
          message: "Failed to fetch transaction",
        });
      }
    },
  );

  // Get next employee ID
  app.get("/api/employees/next-id", async (req: TenantRequest, res) => {
    try {
      const tenantDb = await getTenantDatabase(req);
      const nextId = await storage.getNextEmployeeId(tenantDb);
      res.json({
        nextId,
      });
    } catch (error) {
      res.status(500).json({
        message: "Failed to generate employee ID",
      });
    }
  });

  // POS QR Payment API Routes - Proxy for external CreateQRPos API
  app.post("/api/pos/create-qr-proxy", async (req, res) => {
    try {
      const { bankCode, clientID, ...qrRequest } = req.body;

      console.log("🎯 Proxying CreateQRPos request:", {
        qrRequest,
        bankCode,
        clientID,
      });
      console.log(
        "🌐 Target URL:",
        `http://1.55.212.135:9335/api/CreateQRPos?bankCode=${bankCode}&clientID=${clientID}`,
      );

      // Forward request to external API (using HTTP as requested)
      const response = await fetch(
        `http://1.55.212.135:9335/api/CreateQRPos?bankCode=${bankCode}&clientID=${clientID}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "User-Agent": "EDPOS-System/1.0",
          },
          body: JSON.stringify(qrRequest),
        },
      );

      console.log("📡 External API response status:", response.status);
      console.log(
        "📡 External API response headers:",
        Object.fromEntries(response.headers.entries()),
      );

      const responseText = await response.text();
      console.log(
        "📡 External API raw response:",
        responseText.substring(0, 500),
      ); // Log first 500 chars

      // Check if response is HTML (error page)
      if (
        responseText.includes("<!DOCTYPE") ||
        responseText.includes("<html>")
      ) {
        console.error("❌ External API returned HTML instead of JSON");
        console.error(
          "❌ This usually means the API endpoint is incorrect or the server returned an error page",
        );
        return res.status(502).json({
          error: "External API returned HTML error page instead of JSON",
          details: "API endpoint may be incorrect or unavailable",
          apiUrl: `http://1.55.212.135:9335/api/CreateQRPos`,
        });
      }

      if (!response.ok) {
        console.error("❌ External API error:", responseText);
        return res.status(response.status).json({
          error: responseText,
          statusCode: response.status,
          statusText: response.statusText,
        });
      }

      let result;
      try {
        result = JSON.parse(responseText);
      } catch (parseError) {
        console.error("❌ Failed to parse JSON from external API:", parseError);
        return res.status(502).json({
          error: "Invalid JSON response from external API",
          rawResponse: responseText.substring(0, 200),
        });
      }

      console.log("✅ External API success:", result);

      // Return the result
      res.json(result);
    } catch (error) {
      console.error("❌ Proxy API error:", error);

      // Provide more detailed error information
      if (error.code === "ECONNREFUSED") {
        return res.status(503).json({
          error: "Cannot connect to external API server",
          details: "Connection refused - API server may be down",
          apiUrl: "http://1.55.212.135:9335/api/CreateQRPos",
        });
      }

      if (error.code === "ENOTFOUND") {
        return res.status(503).json({
          error: "External API server not found",
          details: "DNS lookup failed - check API server address",
          apiUrl: "http://1.55.212.135:9335/api/CreateQRPos",
        });
      }

      res.status(500).json({
        error: "Internal server error while calling external API",
        details: error.message,
        errorType: error.constructor.name,
      });
    }
  });

  // Fallback route for CreateQRPos API
  app.post("/api/pos/create-qr", async (req, res) => {
    try {
      const { bankCode, clientID } = req.query;
      const qrRequest = req.body;

      console.log("🎯 Fallback CreateQRPos request:", {
        qrRequest,
        bankCode,
        clientID,
      });

      // Forward to external API
      const response = await fetch(
        `http://1.55.212.135:9335/api/CreateQRPos?bankCode=${bankCode}&clientID=${clientID}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "User-Agent": "EDPOS-System/1.0",
          },
          body: JSON.stringify(qrRequest),
          // @ts-ignore
          timeout: 30000,
        },
      );

      const responseText = await response.text();
      console.log(
        "📡 External API raw response:",
        responseText.substring(0, 500),
      );

      if (!response.ok) {
        console.error(
          "❌ External API error:",
          response.status,
          responseText.substring(0, 200),
        );
        return res.status(response.status).json({
          error: responseText,
          statusCode: response.status,
          statusText: response.statusText,
        });
      }

      // Check if response looks like HTML (external API might be returning error page)
      if (
        responseText.trim().startsWith("<!DOCTYPE") ||
        responseText.trim().startsWith("<html")
      ) {
        console.error("❌ External API returned HTML instead of JSON");
        return res.status(502).json({
          error: "External API returned HTML page instead of JSON response",
          rawResponse: responseText.substring(0, 200),
          suggestion: "External API might be down or returning error page",
        });
      }

      let result;
      try {
        result = JSON.parse(responseText);
        console.log("✅ External API JSON parsed successfully:", result);
      } catch (parseError) {
        console.error(
          "❌ Failed to parse external API response as JSON:",
          parseError,
        );
        return res.status(502).json({
          error: "Invalid JSON response from external API",
          rawResponse: responseText.substring(0, 200),
          parseError: parseError.message,
        });
      }

      res.json(result);
    } catch (error) {
      console.error("❌ Fallback CreateQRPos API error:", error);
      res.status(500).json({
        error: "Internal server error while calling external API",
        details: error.message,
      });
    }
  });

  // Employees
  app.get(
    "/api/employees",
    tenantMiddleware,
    async (req: TenantRequest, res) => {
      try {
        console.log("🔍 GET /api/employees - Starting request processing");
        let tenantDb;
        try {
          tenantDb = await getTenantDatabase(req);
          console.log("✅ Tenant database connection obtained for employees");
        } catch (dbError) {
          console.error(
            "❌ Failed to get tenant database for employees:",
            dbError,
          );
          tenantDb = null;
        }

        const employees = await storage.getEmployees(tenantDb);
        console.log(`✅ Successfully fetched ${employees.length} employees`);
        res.json(employees);
      } catch (error) {
        console.error("❌ Error fetching employees:", error);
        res.status(500).json({
          message: "Failed to fetch employees",
        });
      }
    },
  );

  app.get("/api/employees/:id", async (req: TenantRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const tenantDb = await getTenantDatabase(req);
      const employee = await storage.getEmployee(id, tenantDb);

      if (!employee) {
        return res.status(404).json({
          message: "Employee not found",
        });
      }

      res.json(employee);
    } catch (error) {
      res.status(500).json({
        message: "Failed to fetch employee",
      });
    }
  });

  app.post("/api/employees", async (req: TenantRequest, res) => {
    try {
      const validatedData: any = insertEmployeeSchema.parse(req.body);
      const tenantDb = await getTenantDatabase(req);

      // Check if email already exists (only if email is provided and not empty)
      if (validatedData.email && validatedData.email.trim() !== "") {
        const existingEmployee = await storage.getEmployeeByEmail(
          validatedData.email,
          // @ts-ignore
          tenantDb,
        );
        if (existingEmployee) {
          return res.status(400).json({
            message: "Email đã tồn tại trong hệ thống",
            code: "DUPLICATE_EMAIL",
            field: "email",
          });
        }
      }

      const employee = await storage.createEmployee(validatedData, tenantDb);
      res.status(201).json(employee);
    } catch (error) {
      console.log("error: ", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: "Invalid employee data",
          errors: error,
        });
      }
      res.status(500).json({
        message: "Failed to create employee",
      });
    }
  });

  app.put("/api/employees/:id", async (req: TenantRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const validatedData: any = insertEmployeeSchema.partial().parse(req.body);
      const tenantDb = await getTenantDatabase(req);

      // Check if email already exists (only if email is provided and not empty, excluding current employee)
      if (validatedData.email && validatedData.email.trim() !== "") {
        const existingEmployee = await storage.getEmployeeByEmail(
          validatedData.email,
          // @ts-ignore
          tenantDb,
        );
        if (existingEmployee && existingEmployee.id !== id) {
          return res.status(409).json({
            message: "Email đã tồn tại trong hệ thống",
            code: "DUPLICATE_EMAIL",
            field: "email",
          });
        }
      }

      const employee = await storage.updateEmployee(
        id,
        validatedData,
        tenantDb,
      );

      if (!employee) {
        return res.status(404).json({
          message: "Employee not found",
        });
      }

      res.json(employee);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: "Invalid employee data",
          errors: error.errors,
        });
      }
      res.status(500).json({
        message: "Failed to update employee",
      });
    }
  });

  app.delete("/api/employees/:id", async (req: TenantRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const tenantDb = await getTenantDatabase(req);
      const deleted = await storage.deleteEmployee(id, tenantDb);

      if (!deleted) {
        return res.status(404).json({
          message: "Employee not found",
        });
      }

      res.json({
        message: "Employee deleted successfully",
      });
    } catch (error) {
      res.status(500).json({
        message: "Failed to delete employee",
      });
    }
  });

  // Attendance routes
  app.get("/api/attendance", async (req: TenantRequest, res) => {
    try {
      const { date, startDate, endDate, employeeId } = req.query;
      const tenantDb = await getTenantDatabase(req);

      console.log(`📅 Attendance API called with params:`, {
        date,
        startDate,
        endDate,
        employeeId,
      });

      if (!tenantDb) {
        return res.status(500).json({
          message: "Database connection not available",
        });
      }

      let records;

      // If startDate and endDate are provided, use date range
      if (startDate && endDate) {
        console.log(
          `📅 Fetching attendance records by date range: ${startDate} to ${endDate}`,
        );
        records = await storage.getAttendanceRecordsByRange(
          startDate as string,
          endDate as string,
          tenantDb,
        );
      } else if (date) {
        // Single date filter
        console.log(`📅 Fetching attendance records for single date: ${date}`);
        const employeeIdNum = employeeId
          ? parseInt(employeeId as string)
          : undefined;
        records = await storage.getAttendanceRecords(
          employeeIdNum,
          date as string,
          tenantDb,
        );
      } else {
        // All records
        console.log(`📅 Fetching all attendance records`);
        const employeeIdNum = employeeId
          ? parseInt(employeeId as string)
          : undefined;
        records = await storage.getAttendanceRecords(
          employeeIdNum,
          undefined,
          tenantDb,
        );
      }

      console.log(`✅ Returning ${records.length} attendance records`);
      res.json(records);
    } catch (error) {
      console.error("Error fetching attendance records:", error);
      res.status(500).json({
        message: "Failed to fetch attendance records",
      });
    }
  });

  app.get(
    "/api/attendance/today/:employeeId",
    async (req: TenantRequest, res) => {
      try {
        const employeeId = parseInt(req.params.employeeId);
        const tenantDb = await getTenantDatabase(req);
        const record = await storage.getTodayAttendance(employeeId, tenantDb);
        res.json(record);
      } catch (error) {
        res.status(500).json({
          message: "Failed to fetch today's attendance",
        });
      }
    },
  );

  app.post("/api/attendance/clock-in", async (req: TenantRequest, res) => {
    try {
      const { employeeId, notes } = req.body;

      if (!employeeId) {
        return res.status(400).json({
          message: "Employee ID is required",
        });
      }

      const tenantDb = await getTenantDatabase(req);
      const record = await storage.clockIn(
        parseInt(employeeId),
        notes,
        // @ts-ignore
        tenantDb,
      );
      res.status(201).json(record);
    } catch (error) {
      console.error("Clock-in API error:", error);

      let statusCode = 500;
      let message = "Failed to clock in";

      if (error instanceof Error) {
        if (error.message.includes("not found")) {
          statusCode = 404;
          message = error.message;
        } else if (error.message.includes("already clocked in")) {
          statusCode = 400;
          message = error.message;
        } else if (error.message.includes("database")) {
          message = "Database error occurred";
        }
      }

      res.status(statusCode).json({
        message,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.post("/api/attendance/clock-out/:id", async (req: TenantRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const tenantDb = await getTenantDatabase(req);
      // @ts-ignore
      const record = await storage.clockOut(id, tenantDb);

      if (!record) {
        return res.status(404).json({
          message: "Attendance record not found",
        });
      }

      res.json(record);
    } catch (error) {
      res.status(500).json({
        message: "Failed to clock out",
      });
    }
  });

  app.post(
    "/api/attendance/break-start/:id",
    async (req: TenantRequest, res) => {
      try {
        const id = parseInt(req.params.id);
        const tenantDb = await getTenantDatabase(req);
        // @ts-ignore
        const record = await storage.startBreak(id, tenantDb);

        if (!record) {
          return res.status(404).json({
            message: "Attendance record not found",
          });
        }

        res.json(record);
      } catch (error) {
        res.status(500).json({
          message: "Failed to start break",
        });
      }
    },
  );

  app.post("/api/attendance/break-end/:id", async (req: TenantRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const tenantDb = await getTenantDatabase(req);
      // @ts-ignore
      const record = await storage.endBreak(id, tenantDb);

      if (!record) {
        return res.status(404).json({
          message: "Attendance record not found",
        });
      }

      res.json(record);
    } catch (error) {
      res.status(500).json({
        message: "Failed to end break",
      });
    }
  });

  app.put("/api/attendance/:id/status", async (req: TenantRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const { status } = req.body;
      const tenantDb = await getTenantDatabase(req);
      // @ts-ignore
      const record = await storage.updateAttendanceStatus(id, status, tenantDb);

      if (!record) {
        return res.status(404).json({
          message: "Attendance record not found",
        });
      }

      res.json(record);
    } catch (error) {
      res.status(500).json({
        message: "Failed to update attendance status",
      });
    }
  });

  // Tables
  app.get("/api/tables", tenantMiddleware, async (req: TenantRequest, res) => {
    try {
      console.log("🔍 GET /api/tables - Starting request processing");
      let tenantDb;
      try {
        tenantDb = await getTenantDatabase(req);
        console.log("✅ Tenant database connection obtained for tables");
      } catch (dbError) {
        console.error("❌ Failed to get tenant database for tables:", dbError);
        tenantDb = null;
      }

      const tables = await storage.getTables(tenantDb);
      console.log(`✅ Successfully fetched ${tables.length} tables`);
      res.json(tables);
    } catch (error) {
      console.error("❌ Error fetching tables:", error);
      res.status(500).json({
        message: "Failed to fetch tables",
      });
    }
  });

  app.get("/api/tables/:id", async (req: TenantRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const tenantDb = await getTenantDatabase(req);
      const table = await storage.getTable(id, tenantDb);

      if (!table) {
        return res.status(404).json({
          message: "Table not found",
        });
      }

      res.json(table);
    } catch (error) {
      res.status(500).json({
        message: "Failed to fetch table",
      });
    }
  });

  app.post("/api/tables", async (req: TenantRequest, res) => {
    try {
      const tableData = insertTableSchema.parse(req.body);
      const tenantDb = await getTenantDatabase(req);
      // @ts-ignore
      const table = await storage.createTable(tableData, tenantDb);
      res.status(201).json(table);
    } catch (error) {
      res.status(400).json({
        message: "Failed to create table",
      });
    }
  });

  app.put("/api/tables/:id", async (req: TenantRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const tableData = insertTableSchema.partial().parse(req.body);
      const tenantDb = await getTenantDatabase(req);
      const table = await storage.updateTable(id, tableData, tenantDb);

      if (!table) {
        return res.status(404).json({
          message: "Table not found",
        });
      }

      res.json(table);
    } catch (error) {
      res.status(500).json({
        message: "Failed to update table",
      });
    }
  });

  app.put("/api/tables/:id/status", async (req: TenantRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const { status } = req.body;
      const tenantDb = await getTenantDatabase(req);
      const table = await storage.updateTableStatus(id, status, tenantDb);

      if (!table) {
        return res.status(404).json({
          message: "Table not found",
        });
      }

      res.json(table);
    } catch (error) {
      res.status(500).json({
        message: "Failed to update table status",
      });
    }
  });

  app.delete("/api/tables/:id", async (req: TenantRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const tenantDb = await getTenantDatabase(req);
      const deleted = await storage.deleteTable(id, tenantDb);

      if (!deleted) {
        return res.status(404).json({
          message: "Table not found",
        });
      }

      res.json({
        message: "Table deleted successfully",
      });
    } catch (error) {
      res.status(500).json({
        message: "Failed to delete table",
      });
    }
  });

  // Orders
  app.get("/api/orders", tenantMiddleware, async (req: TenantRequest, res) => {
    try {
      console.log("🔍 GET /api/orders - Starting request processing");
      const { salesChannel } = req.query;

      let tenantDb;
      try {
        tenantDb = await getTenantDatabase(req);
        console.log("✅ Tenant database connection obtained");
      } catch (dbError) {
        console.error("❌ Failed to get tenant database:", dbError);
        console.log("🔄 Falling back to default database connection");
        tenantDb = null;
      }

      const orders = await storage.getOrders(
        undefined,
        undefined,
        tenantDb,
        salesChannel as string,
      );
      console.log(
        `✅ Successfully fetched ${orders.length} orders${salesChannel ? ` for channel: ${salesChannel}` : ""}`,
      );
      res.json(orders);
    } catch (error) {
      console.error("❌ Error fetching orders:", error);
      res.status(500).json({
        error: "Failed to fetch orders",
      });
    }
  });

  app.get("/api/orders/:id", async (req: TenantRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const tenantDb = await getTenantDatabase(req);
      const order = await storage.getOrder(id, tenantDb);

      if (!order) {
        return res.status(404).json({
          message: "Order not found",
        });
      }

      const items = await storage.getOrderItems(id, tenantDb);
      res.json({ ...order, items });
    } catch (error) {
      res.status(500).json({
        message: "Failed to fetch order",
      });
    }
  });

  app.post("/api/orders", async (req: TenantRequest, res) => {
    try {
      const { order, items } = req.body;
      const tenantDb = await getTenantDatabase(req);
      console.log(
        "Received order data:",
        JSON.stringify(
          {
            order,
            items,
          },
          null,
          2,
        ),
      );

      // If no order object is provided, create a default one for POS orders
      let orderData;
      if (!order) {
        console.log("No order object provided, creating default POS order");

        // Calculate totals from items
        let subtotal = 0;
        let tax = 0;

        if (items && Array.isArray(items)) {
          for (const item of items) {
            const itemSubtotal =
              parseFloat(item.unitPrice || "0") * (item.quantity || 0);
            subtotal += itemSubtotal;

            // Get product to calculate tax
            try {
              const [product] = await db
                .select()
                .from(products)
                .where(eq(products.id, item.productId))
                .limit(1);

              if (
                product?.afterTaxPrice &&
                product.afterTaxPrice !== null &&
                product.afterTaxPrice !== ""
              ) {
                const afterTaxPrice = parseFloat(product.afterTaxPrice); // Giá sau thuế
                const basePrice = parseFloat(product.price);
                const taxPerUnit = afterTaxPrice - basePrice;
                tax += taxPerUnit * (item.quantity || 0);
              }
            } catch (productError) {
              console.warn(
                "Could not fetch product for tax calculation:",
                item.productId,
              );
            }
          }
        }

        const total = subtotal + tax;

        orderData = {
          orderNumber: `ORD-${Date.now()}`,
          tableId: null,
          employeeId: null,
          status: "pending",
          customerName: "Khách hàng",
          customerCount: 1,
          subtotal: subtotal.toFixed(2),
          tax: tax.toFixed(2),
          discount: "0.00",
          total: total.toFixed(2),
          paymentMethod: null,
          paymentStatus: "pending",
          salesChannel: "pos",
          notes: "POS Order",
          orderedAt: new Date(),
        };

        console.log("Created default order:", orderData);
      } else {
        orderData = insertOrderSchema.parse(order);
        // Set salesChannel based on tableId if not explicitly provided
        if (!orderData.salesChannel) {
          orderData.salesChannel = orderData.tableId ? "table" : "pos";
        }
      }

      // Parse and prepare items with discount distribution
      let itemsData = items.map((item) => insertOrderItemSchema.parse(item));

      // Calculate discount distribution if order has discount
      const orderDiscount = Number(orderData.discount || 0);
      if (orderDiscount > 0) {
        itemsData = calculateDiscountDistribution(itemsData, orderDiscount);
        console.log(
          `💰 Order Creation: Distributed discount ${orderDiscount} among ${itemsData.length} items`,
        );
      }

      console.log(
        "Parsed order data with discount distribution:",
        JSON.stringify(
          {
            orderData,
            itemsData,
          },
          null,
          2,
        ),
      );

      const newOrder = await storage.createOrder(
        orderData,
        itemsData,
        tenantDb,
      );

      // Verify items were created
      const createdItems = await storage.getOrderItems(newOrder.id, tenantDb);
      console.log(
        `Created ${createdItems.length} items for order ${newOrder.id}:`,
        createdItems,
      );

      res.status(201).json(newOrder);
    } catch (error) {
      console.error("Order creation error:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: "Invalid order data",
          errors: error.errors,
          details: error.format(),
        });
      }
      res.status(500).json({
        message: "Failed to create order",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.put("/api/orders/:id", async (req: TenantRequest, res) => {
    try {
      const { id: rawId } = req.params;
      const orderData = req.body; // Use raw body to preserve all fields
      const tenantDb = await getTenantDatabase(req);

      console.log(`=== PUT ORDER API CALLED ===`);
      console.log(`Raw Order ID: ${rawId}`);
      console.log(`Update data:`, JSON.stringify(orderData, null, 2));

      // Handle temporary IDs - allow flow to continue
      const isTemporaryId = rawId.startsWith("temp-");
      let finalResult; // Declare finalResult here

      if (isTemporaryId) {
        console.log(
          `🟡 Temporary order ID detected: ${rawId} - returning success for flow continuation`,
        );

        // Return a mock success response to allow E-invoice flow to continue
        const mockOrder = {
          id: rawId,
          orderNumber: `TEMP-${Date.now()}`,
          tableId: null,
          customerName: orderData.customerName || "Khách hàng",
          status: orderData.status || "paid",
          paymentMethod: orderData.paymentMethod || "cash",
          einvoiceStatus: orderData.einvoiceStatus || 0,
          paidAt: orderData.paidAt || new Date(),
          updatedAt: new Date(),
          updated: true,
          updateTimestamp: new Date().toISOString(),
        };

        console.log(
          `✅ Mock order update response for temporary ID:`,
          mockOrder,
        );
        return res.json(mockOrder);
      }

      const id = parseInt(rawId);
      if (isNaN(id)) {
        console.error(`❌ Invalid order ID: ${rawId}`);
        return res.status(400).json({
          message: "Invalid order ID",
        });
      }

      // Check if order exists first
      const [existingOrder] = await db
        .select()
        .from(orders)
        .where(eq(orders.id, id));

      if (!existingOrder) {
        console.error(`❌ Order not found: ${id}`);
        return res.status(404).json({
          message: "Order not found",
        });
      }

      console.log(`📋 Current order state:`, {
        id: existingOrder.id,
        orderNumber: existingOrder.orderNumber,
        tableId: existingOrder.tableId,
        currentStatus: existingOrder.status,
        paymentMethod: existingOrder.paymentMethod,
        currentSubtotal: existingOrder.subtotal,
        currentTax: existingOrder.tax,
        currentTotal: existingOrder.total,
        currentDiscount: existingOrder.discount,
      });

      // Use EXACT values from frontend - ZERO calculation, ZERO validation
      console.log(
        `💰 Using PURE frontend values for order ${id} - NO calculation, NO validation, NO modification`,
      );

      // Log what frontend sent but DO NOT modify anything
      console.log(`💰 Frontend values (saving exactly as received):`, {
        subtotal: orderData.subtotal,
        tax: orderData.tax,
        discount: orderData.discount,
        total: orderData.total,
        source: "pure_frontend_exact_save",
      });

      // Fetch existing items to compare quantities and calculate discount distribution
      const existingOrderItems = await db
        .select()
        .from(orderItemsTable)
        .where(eq(orderItemsTable.orderId, id));

      // Step 1: Add new items if any exist
      if (orderData.items && orderData.items.length > 0) {
        console.log(
          `📝 Adding ${orderData.items.length} new items to existing order ${existingOrder.id}`,
        );
        // Add items directly through storage instead of undefined apiRequest
        try {
          const validatedItems = orderData.items.map((item) => ({
            orderId: existingOrder.id,
            productId: parseInt(item.productId),
            quantity: parseInt(item.quantity),
            unitPrice: item.unitPrice.toString(),
            total: item.total
              ? item.total.toString()
              : (
                  parseFloat(item.unitPrice) * parseInt(item.quantity)
                ).toString(),
            discount: "0.00",
            notes: item.notes || null,
          }));

          await db.insert(orderItemsTable).values(validatedItems);

          console.log("✅ Items added successfully via direct storage");
        } catch (addError) {
          console.error("❌ Error adding items:", addError);
        }
      } else {
        console.log(
          `📝 No new items to add to order ${existingOrder.id}, proceeding with order update only`,
        );
      }

      // Get discount value from order data
      const discount = Number(orderData.discount || 0);

      // Step 1.6: Update discount for existing order items
      if (
        discount > 0 &&
        orderData?.existingItems &&
        orderData?.existingItems?.length > 0
      ) {
        console.log(
          `💰 Updating discount for ${orderData?.existingItems?.length} existing order items`,
        );

        // Update each order item with its calculated discount
        for (const item of orderData?.existingItems) {
          try {
            await db
              .update(orderItemsTable)
              .set({
                // @ts-ignore
                discount: parseFloat(item.discount || "0").toFixed(2),
              })
              .where(eq(orderItemsTable.id, item.id));

            console.log(
              `✅ Updated order item ${item.id} with discount: ${item.discount}`,
            );
          } catch (itemError) {
            console.error(
              `❌ Error updating order item ${item.id} discount:`,
              itemError,
            );
          }
        }
      }

      // Step 2: Fix timestamp handling before updating order
      if (orderData.paidAt && typeof orderData.paidAt === "string") {
        orderData.paidAt = new Date(orderData.paidAt);
      }
      if (orderData.orderedAt && typeof orderData.orderedAt === "string") {
        orderData.orderedAt = new Date(orderData.orderedAt);
      }

      // Step 2: Update the order itself
      const order = await storage.updateOrder(id, orderData, tenantDb);

      if (!order) {
        console.error(`❌ Failed to update order ${id}`);
        return res.status(500).json({
          message: "Failed to update order",
        });
      }

      console.log(`✅ Order update API completed successfully:`, {
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        paymentMethod: order.paymentMethod,
        paidAt: order.paidAt,
        einvoiceStatus: order.einvoiceStatus,
        updatedSubtotal: order.subtotal,
        updatedTax: order.tax,
        updatedDiscount: order.discount,
        updatedTotal: order.total,
      });

      res.json({
        ...order,
        updated: true,
        updateTimestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("❌ PUT Order API error:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: "Invalid order data",
          errors: error.errors,
        });
      }
      res.status(500).json({
        message: "Failed to update order",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.put("/api/orders/:id/status", async (req: TenantRequest, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      console.log(`🚀 ========================================`);
      console.log(`🚀 API ENDPOINT CALLED: PUT /api/orders/${id}/status`);
      console.log(`🚀 ========================================`);
      console.log(
        `📋 Order status update API called - Order ID: ${id}, New Status: ${status}`,
      );

      // Get tenant database first
      const tenantDb = await getTenantDatabase(req);

      // Handle both numeric IDs and temporary string IDs
      let orderId: number | string = id;
      const isTemporaryId = id.startsWith("temp-");

      if (!isTemporaryId) {
        const parsedId = parseInt(id);
        if (isNaN(parsedId)) {
          console.error(`❌ Invalid order ID: ${id}`);
          return res.status(400).json({
            message: "Invalid order ID",
          });
        }
        orderId = parsedId;
        console.log(`✅ ID converted to number: ${orderId}`);
      } else {
        console.log(`🟡 Keeping temporary ID as string: ${orderId}`);
        // For temporary IDs, just return success without database update
        return res.json({
          id: orderId,
          status: status,
          updated: true,
          previousStatus: "served",
          updateTimestamp: new Date().toISOString(),
          success: true,
          temporary: true,
        });
      }

      if (!status) {
        console.error(`❌ Missing status in request body, received:`, req.body);
        return res.status(400).json({
          message: "Status is required",
        });
      }

      // Get the current order to log its current state
      const [foundOrder] = await db
        .select()
        .from(orders)
        .where(eq(orders.id, orderId as number));

      if (!foundOrder) {
        console.error(`❌ Order not found for ID: ${id}`);
        return res.status(404).json({
          message: "Order not found",
        });
      }

      console.log(`📊 API: Current order state before update:`, {
        orderId: foundOrder.id,
        orderNumber: foundOrder.orderNumber,
        tableId: foundOrder.tableId,
        currentStatus: foundOrder.status,
        requestedStatus: status,
        timestamp: new Date().toISOString(),
      });

      // Direct database update for better reliability
      console.log(
        `🔄 Performing direct database update for order ${orderId} to status ${status}`,
      );

      const updateData: any = {
        status: status,
        updatedAt: new Date(),
      };

      // Add paidAt timestamp if status is 'paid'
      if (status === "paid") {
        updateData.paidAt = new Date();
      }

      const [updatedOrder] = await db
        .update(orders)
        .set(updateData)
        .where(eq(orders.id, orderId as number))
        .returning();

      if (!updatedOrder) {
        console.error(
          `❌ Failed to update order ${orderId} to status ${status}`,
        );
        return res.status(500).json({
          message: "Failed to update order status",
          orderId: id,
          requestedStatus: status,
        });
      }

      console.log(`✅ API: Order status updated successfully:`, {
        orderId: updatedOrder.id,
        orderNumber: updatedOrder.orderNumber,
        tableId: updatedOrder.tableId,
        previousStatus: foundOrder.status,
        newStatus: updatedOrder.status,
        paidAt: updatedOrder.paidAt,
        timestamp: new Date().toISOString(),
      });

      // If status was updated to 'paid', check if table should be released
      if (status === "paid" && updatedOrder.tableId) {
        try {
          // Check if there are any other unpaid orders on this table
          const unpaidOrders = await db
            .select()
            .from(orders)
            .where(
              and(
                eq(orders.tableId, updatedOrder.tableId),
                ne(orders.status, "paid"),
                ne(orders.status, "cancelled"),
              ),
            );

          console.log(
            `📋 Checking table ${updatedOrder.tableId} for other unpaid orders:`,
            {
              tableId: updatedOrder.tableId,
              unpaidOrdersCount: unpaidOrders.length,
              unpaidOrders: unpaidOrders.map((o) => ({
                id: o.id,
                orderNumber: o.orderNumber,
                status: o.status,
              })),
            },
          );

          // If no unpaid orders remain, release the table
          if (unpaidOrders.length === 0) {
            await db
              .update(tables)
              .set({
                // @ts-ignore
                status: "available",
                updatedAt: new Date(),
              })
              .where(eq(tables.id, updatedOrder.tableId));

            console.log(
              `✅ Table ${updatedOrder.tableId} released to available status`,
            );
          }
        } catch (tableUpdateError) {
          console.error(`❌ Error updating table status:`, tableUpdateError);
          // Don't fail the order update if table update fails
        }
      }

      // Send comprehensive response data
      res.json({
        ...updatedOrder,
        updated: true,
        previousStatus: foundOrder.status,
        updateTimestamp: new Date().toISOString(),
        success: true,
      });
    } catch (error) {
      console.error(`❌ Error updating order status via API:`, error);
      res.status(500).json({
        message: "Failed to update order status",
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      });
    }
  });

  app.post("/api/orders/:id/payment", async (req: TenantRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const { paymentMethod, amountReceived, change } = req.body;
      const tenantDb = await getTenantDatabase(req);

      console.log(
        `💳 Payment completion API called - Order ID: ${id}, Payment Method: ${paymentMethod}`,
      );

      // Update order with payment details and status
      const updateData = {
        status: "paid",
        paymentMethod,
        paidAt: new Date().toISOString(),
      };

      // Add cash payment specific data if provided
      if (amountReceived !== undefined) {
        // @ts-ignore
        updateData.amountReceived = amountReceived;
      }
      if (change !== undefined) {
        // @ts-ignore
        updateData.change = change;
      }

      console.log(`=>$ Updating order with payment data:`, updateData);
      // @ts-ignore
      const order = await storage.updateOrder(id, updateData, tenantDb);

      if (!order) {
        console.error(`❌ Order not found for payment completion: ${id}`);
        return res.status(404).json({
          message: "Order not found",
        });
      }

      console.log(`✅ Payment completed successfully for order:`, order);

      res.json({ ...order, paymentMethod, amountReceived, change });
    } catch (error) {
      console.error("❌ Payment completion error:", error);
      res.status(500).json({
        message: "Failed to complete payment",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Get ALL order items
  app.get("/api/order-items", async (req: TenantRequest, res) => {
    try {
      console.log("=== GET ALL ORDER ITEMS API CALLED ===");

      let tenantDb;
      try {
        tenantDb = await getTenantDatabase(req);
        console.log(
          "✅ Tenant database connection obtained for all order items",
        );
      } catch (dbError) {
        console.error(
          "❌ Failed to get tenant database for all order items:",
          dbError,
        );
        tenantDb = null;
      }

      const database = tenantDb || db;
      console.log("Fetching all order items from database...");

      const items = await database
        .select({
          id: orderItemsTable.id,
          orderId: orderItemsTable.orderId,
          productId: orderItemsTable.productId,
          quantity: orderItemsTable.quantity,
          unitPrice: orderItemsTable.unitPrice,
          total: orderItemsTable.total,
          notes: orderItemsTable.notes,
          productName: products.name,
          productSku: products.sku,
        })
        .from(orderItemsTable)
        .leftJoin(products, eq(orderItemsTable.productId, products.id))
        .orderBy(desc(orderItemsTable.id));

      console.log(`✅ Found ${items.length} total order items`);

      // Ensure items is always an array, even if empty
      const safeItems = Array.isArray(items) ? items : [];
      res.json(safeItems);
    } catch (error) {
      console.error("=== GET ALL ORDER ITEMS ERROR ===");
      console.error("Error type:", error?.constructor?.name || "Unknown");
      console.error("Error message:", error?.message || "Unknown error");
      console.error("Error stack:", error?.stack || "No stack trace");

      res.status(500).json({
        message: "Failed to fetch all order items",
        details: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Enhanced POS print-receipt endpoint with printer configuration support
  app.post("/api/pos/print-receipt", async (req: TenantRequest, res) => {
    try {
      const {
        content,
        type,
        orderId,
        transactionId,
        printerConfigs,
        preferredConfig,
        deviceInfo,
      } = req.body;

      console.log(`🖨️ Enhanced POS print request:`, {
        type,
        orderId,
        transactionId,
        devicePlatform: deviceInfo?.platform,
        deviceBrowser: deviceInfo?.browser,
        configuredPrinters: printerConfigs?.length || 0,
        preferredPrinter: preferredConfig?.name,
      });

      if (!content) {
        return res.status(400).json({
          success: false,
          error: "Thiếu nội dung in",
        });
      }

      let printResults = [];
      let hasSuccessfulPrint = false;

      // Try to print to configured printers if available
      if (printerConfigs && printerConfigs.length > 0) {
        const net = require("net");

        for (const config of printerConfigs) {
          if (!config.isActive) continue;

          try {
            console.log(
              `🖨️ Attempting to print to ${config.name} (${config.connectionType})`,
            );

            if (config.connectionType === "network" && config.ipAddress) {
              // Network printer
              const printPromise = new Promise((resolve, reject) => {
                const client = new net.Socket();
                client.setTimeout(5000);

                client.connect(config.port || 9100, config.ipAddress, () => {
                  console.log(
                    `🔗 Connected to printer ${config.name} at ${config.ipAddress}:${config.port}`,
                  );

                  // Convert HTML content to ESC/POS commands (simplified)
                  const escPosData = convertHtmlToEscPos(content, config);

                  client.write(escPosData, (error) => {
                    if (error) {
                      console.error(
                        `❌ Print data send error for ${config.name}:`,
                        error,
                      );
                      reject(
                        new Error(`Lỗi gửi dữ liệu in đến ${config.name}`),
                      );
                    } else {
                      console.log(
                        `✅ Print data sent successfully to ${config.name}`,
                      );
                      client.end();
                      resolve({
                        printer: config.name,
                        success: true,
                        message: `In thành công trên ${config.name}`,
                      });
                    }
                  });
                });

                client.on("timeout", () => {
                  console.error(`⏰ Printer ${config.name} connection timeout`);
                  client.destroy();
                  reject(new Error(`${config.name} không phản hồi`));
                });

                client.on("error", (error) => {
                  console.error(
                    `❌ Printer ${config.name} connection error:`,
                    error,
                  );
                  reject(
                    new Error(
                      `Không thể kết nối tới ${config.name}: ${error.message}`,
                    ),
                  );
                });
              });

              try {
                const result = await printPromise;
                printResults.push(result);
                hasSuccessfulPrint = true;

                // If this is the preferred printer and it succeeded, we can return early
                if (config.id === preferredConfig?.id) {
                  break;
                }
              } catch (printError) {
                console.log(
                  `⚠️ Failed to print to ${config.name}:`,
                  printError.message,
                );
                printResults.push({
                  printer: config.name,
                  success: false,
                  error: printError.message,
                });
              }
            } else if (config.connectionType === "usb") {
              // USB printer - would need additional USB printing library
              console.log(
                `📝 USB printer ${config.name} detected - would require USB printing library`,
              );
              printResults.push({
                printer: config.name,
                success: false,
                error: "USB printing not yet implemented",
              });
            } else if (config.connectionType === "bluetooth") {
              // Bluetooth printer - would need additional Bluetooth printing library
              console.log(
                `📱 Bluetooth printer ${config.name} detected - would require Bluetooth printing library`,
              );
              printResults.push({
                printer: config.name,
                success: false,
                error: "Bluetooth printing not yet implemented",
              });
            }
          } catch (configError) {
            console.error(
              `❌ Error processing printer config ${config.name}:`,
              configError,
            );
            printResults.push({
              printer: config.name,
              success: false,
              error: configError.message,
            });
          }
        }
      }

      // Log print job completion
      if (hasSuccessfulPrint) {
        console.log(
          `📝 Print job completed for ${type} ${orderId || transactionId}`,
        );

        res.json({
          success: true,
          message: "In thành công",
          results: printResults,
          deviceInfo,
          timestamp: new Date().toISOString(),
        });
      } else {
        console.log(
          `⚠️ No successful prints for ${type} ${orderId || transactionId}`,
        );

        // Return error but with specific guidance based on device
        const fallbackMessage = deviceInfo?.isMobile
          ? "Không có máy in POS khả dụng. Vui lòng sử dụng chức năng tải file để in."
          : "Không có máy in POS khả dụng. Vui lòng kiểm tra cấu hình máy in.";

        res.status(503).json({
          success: false,
          error: fallbackMessage,
          results: printResults,
          deviceInfo,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error("🖨️ Enhanced POS print error:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Lỗi in không xác định",
      });
    }
  });

  // Helper function to convert HTML content to ESC/POS commands
  function convertHtmlToEscPos(
    htmlContent: string,
    printerConfig: any,
  ): Buffer {
    // This is a simplified conversion - in production you'd want a proper HTML to ESC/POS library
    const text = htmlContent
      .replace(/<[^>]*>/g, "") // Strip HTML tags
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"');

    // ESC/POS commands
    const ESC = "\x1B";
    const INIT = ESC + "@"; // Initialize printer
    const ALIGN_CENTER = ESC + "a" + "\x01";
    const ALIGN_LEFT = ESC + "a" + "\x00";
    const BOLD_ON = ESC + "E" + "\x01";
    const BOLD_OFF = ESC + "E" + "\x00";
    const CUT_PAPER = "\x1D" + "V" + "A" + "\x00"; // Cut paper
    const FEED_LINES = "\n\n\n";

    // Build ESC/POS command sequence
    let escPosData = INIT;
    escPosData += ALIGN_CENTER;
    escPosData += BOLD_ON;
    escPosData += "HOA DON THANH TOAN\n";
    escPosData += BOLD_OFF;
    escPosData += ALIGN_LEFT;
    escPosData += "================================\n";
    escPosData += text;
    escPosData += "\n================================\n";
    escPosData += ALIGN_CENTER;
    escPosData += "Cam on quy khach!\n";
    escPosData += FEED_LINES;
    escPosData += CUT_PAPER;

    return Buffer.from(escPosData, "utf8");
  }

  // API in qua máy in mạng (legacy endpoint, kept for compatibility)
  app.post("/api/print/network", async (req: TenantRequest, res) => {
    try {
      const { printerIP, printerPort = 9100, data, orderId } = req.body;

      if (!printerIP || !data) {
        return res.status(400).json({
          success: false,
          error: "Thiếu thông tin máy in hoặc dữ liệu in",
        });
      }

      console.log(
        `🖨️ Attempting to print to network printer ${printerIP}:${printerPort}`,
      );

      // Sử dụng node.js net module để kết nối tới máy in
      const net = require("net");

      const printPromise = new Promise((resolve, reject) => {
        const client = new net.Socket();

        client.setTimeout(5000); // 5 giây timeout

        client.connect(printerPort, printerIP, () => {
          console.log(`🔗 Connected to printer ${printerIP}:${printerPort}`);

          // Gửi dữ liệu ESC/POS
          client.write(data, (error) => {
            if (error) {
              console.error("❌ Print data send error:", error);
              reject(new Error("Lỗi gửi dữ liệu in"));
            } else {
              console.log("✅ Print data sent successfully");
              client.end();
              resolve(true);
            }
          });
        });

        client.on("timeout", () => {
          console.error("⏰ Printer connection timeout");
          client.destroy();
          reject(new Error("Máy in không phản hồi trong thời gian quy định"));
        });

        client.on("error", (error) => {
          console.error("❌ Printer connection error:", error);
          reject(new Error(`Không thể kết nối tới máy in: ${error.message}`));
        });

        client.on("close", () => {
          console.log("🔌 Printer connection closed");
        });
      });

      await printPromise;

      // Log hoạt động in
      console.log(
        `📝 Print job completed for order ${orderId} on printer ${printerIP}`,
      );

      res.json({
        success: true,
        message: "In thành công",
        printer: `${printerIP}:${printerPort}`,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("🖨️ Network print error:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Lỗi in không xác định",
      });
    }
  });

  // Printer Configurations API
  app.get("/api/printer-configs", async (req: TenantRequest, res) => {
    try {
      const tenantDb = await getTenantDatabase(req);
      const configs = await db
        .select()
        .from(printerConfigs)
        .orderBy(printerConfigs.name);
      console.log(`✅ Fetched ${configs.length} printer configurations`);
      res.json(configs);
    } catch (error) {
      console.error("❌ Error fetching printer configurations:", error);
      res.status(500).json({
        error: "Failed to fetch printer configurations",
      });
    }
  });

  app.post("/api/printer-configs", async (req: TenantRequest, res) => {
    try {
      const tenantDb = await getTenantDatabase(req);
      const configData = req.body;

      // Validate that only one printer can be active for each type
      if (
        configData.isActive &&
        (configData.isEmployee || configData.isKitchen)
      ) {
        const existingConfigs = await db.select().from(printerConfigs);

        const conflictingConfig = existingConfigs.find(
          (config) =>
            config.isActive &&
            ((configData.isEmployee && config.isEmployee) ||
              (configData.isKitchen && config.isKitchen)),
        );

        if (conflictingConfig) {
          const printerType = configData.isEmployee ? "nhân viên" : "bếp";
          return res.status(400).json({
            error: `Đã có máy in ${printerType} đang hoạt động: ${conflictingConfig.name}. Vui lòng tắt máy in đó trước.`,
          });
        }
      }

      const [newConfig] = await db
        .insert(printerConfigs)
        .values(configData)
        .returning();
      console.log(`✅ Created printer configuration: ${newConfig.name}`);
      res.status(201).json(newConfig);
    } catch (error) {
      console.error("❌ Error creating printer configuration:", error);
      res.status(500).json({
        error: "Failed to create printer configuration",
      });
    }
  });

  app.put("/api/printer-configs/:id", async (req: TenantRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const tenantDb = await getTenantDatabase(req);
      const updateData = req.body;

      // Validate that only one printer can be active for each type
      if (
        updateData.isActive &&
        (updateData.isEmployee || updateData.isKitchen)
      ) {
        const existingConfigs = await db.select().from(printerConfigs);

        const conflictingConfig = existingConfigs.find(
          (config) =>
            config.id !== id &&
            config.isActive &&
            ((updateData.isEmployee && config.isEmployee) ||
              (updateData.isKitchen && config.isKitchen)),
        );

        if (conflictingConfig) {
          // Auto-disable the conflicting printer
          await db
            .update(printerConfigs)
            // @ts-ignore
            .set({ isActive: false })
            .where(eq(printerConfigs.id, conflictingConfig.id));

          console.log(
            `🔄 Auto-disabled conflicting printer: ${conflictingConfig.name}`,
          );
        }
      }

      const [updatedConfig] = await db
        .update(printerConfigs)
        .set({ ...updateData, updatedAt: new Date() })
        .where(eq(printerConfigs.id, id))
        .returning();

      if (!updatedConfig) {
        return res.status(404).json({
          error: "Printer configuration not found",
        });
      }

      console.log(`✅ Updated printer configuration: ${updatedConfig.name}`);
      res.json(updatedConfig);
    } catch (error) {
      console.error("❌ Error updating printer configuration:", error);
      res.status(500).json({
        error: "Failed to update printer configuration",
      });
    }
  });

  app.delete("/api/printer-configs/:id", async (req: TenantRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const tenantDb = await getTenantDatabase(req);

      const [deletedConfig] = await db
        .delete(printerConfigs)
        .where(eq(printerConfigs.id, id))
        .returning();

      if (!deletedConfig) {
        return res.status(404).json({
          error: "Printer configuration not found",
        });
      }

      console.log(`✅ Deleted printer configuration: ${deletedConfig.name}`);
      res.json({
        message: "Printer configuration deleted successfully",
      });
    } catch (error) {
      console.error("❌ Error deleting printer configuration:", error);
      res.status(500).json({
        error: "Failed to delete printer configuration",
      });
    }
  });

  app.post("/api/printer-configs/:id/test", async (req: TenantRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const tenantDb = await getTenantDatabase(req);

      const [config] = await db
        .select()
        .from(printerConfigs)
        .where(eq(printerConfigs.id, id))
        .limit(1);

      if (!config) {
        return res.status(404).json({
          success: false,
          message: "Printer configuration not found",
        });
      }

      if (config.connectionType === "network" && config.ipAddress) {
        const net = require("net");

        const testPromise = new Promise((resolve, reject) => {
          const client = new net.Socket();
          client.setTimeout(5000);

          client.connect(config.port || 9100, config.ipAddress, () => {
            // Send test print command
            const testData = Buffer.from(
              "\x1B@Test Print from EDPOS\n\n\n\x1DV\x41\x00",
              "utf8",
            );

            client.write(testData, (error) => {
              if (error) {
                reject(new Error("Failed to send test data"));
              } else {
                client.end();
                resolve({
                  success: true,
                  message: `Kết nối thành công đến ${config.name}`,
                });
              }
            });
          });

          client.on("timeout", () => {
            client.destroy();
            reject(new Error("Connection timeout"));
          });

          client.on("error", (error) => {
            reject(error);
          });
        });

        try {
          const result = await testPromise;
          console.log(`✅ Test print successful for ${config.name}`);
          res.json(result);
        } catch (error) {
          console.log(`❌ Test print failed for ${config.name}:`, error);
          res.json({
            success: false,
            message: `Kết nối thất bại: ${error.message}`,
          });
        }
      } else {
        res.json({
          success: false,
          message: "Chỉ hỗ trợ test máy in mạng",
        });
      }
    } catch (error) {
      console.error("❌ Error testing printer:", error);
      res.status(500).json({
        success: false,
        message: "Failed to test printer connection",
      });
    }
  });

  // API kiểm tra trạng thái máy in (legacy endpoint)
  app.get("/api/print/status/:ip/:port?", async (req: TenantRequest, res) => {
    try {
      const { ip, port = 9100 } = req.params;
      const net = require("net");

      const checkPromise = new Promise((resolve, reject) => {
        const client = new net.Socket();
        client.setTimeout(3000);

        client.connect(parseInt(port as string), ip, () => {
          client.end();
          resolve({
            status: "connected",
            ip: ip,
            port: port,
            timestamp: new Date().toISOString(),
          });
        });

        client.on("timeout", () => {
          client.destroy();
          reject(new Error("timeout"));
        });

        client.on("error", (error) => {
          reject(error);
        });
      });

      const result = await checkPromise;
      res.json({ success: true, printer: result });
    } catch (error) {
      res.json({
        success: false,
        status: "disconnected",
        error: error instanceof Error ? error.message : "Connection failed",
      });
    }
  });

  // Get order items for a specific order
  app.get("/api/order-items/:orderId", async (req: TenantRequest, res) => {
    try {
      console.log("=== GET ORDER ITEMS API CALLED ===");
      const orderId = parseInt(req.params.orderId);
      console.log("Order ID requested:", orderId);

      if (isNaN(orderId)) {
        console.error("Invalid order ID provided:", req.params.orderId);
        return res.status(400).json({
          message: "Invalid order ID",
        });
      }

      let tenantDb;
      try {
        tenantDb = await getTenantDatabase(req);
        console.log("✅ Tenant database connection obtained for order items");
      } catch (dbError) {
        console.error(
          "❌ Failed to get tenant database for order items:",
          dbError,
        );
        tenantDb = null;
      }

      console.log("Fetching order items from storage...");
      const items = await storage.getOrderItems(orderId, tenantDb);
      console.log(`Found ${items.length} order items:`, items);

      // Ensure items is always an array, even if empty
      const safeItems = Array.isArray(items) ? items : [];
      res.json(safeItems);
    } catch (error) {
      console.error("=== GET ORDER ITEMS ERROR ===");
      console.error("Error type:", error?.constructor?.name || "Unknown");
      console.error("Error message:", error?.message || "Unknown error");
      console.error("Error stack:", error?.stack || "No stack trace");
      console.error("Order ID:", req.params.orderId);

      res.status(500).json({
        message: "Failed to fetch order items",
        details: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Update a specific order item
  app.put("/api/order-items/:itemId", async (req: TenantRequest, res) => {
    try {
      console.log("=== UPDATE ORDER ITEM API CALLED ===");
      const itemId = parseInt(req.params.itemId);
      const updateData = req.body;
      const tenantDb = await getTenantDatabase(req);

      console.log("Item ID to update:", itemId);
      console.log("Update data:", updateData);

      if (isNaN(itemId)) {
        return res.status(400).json({
          error: "Invalid item ID",
        });
      }

      const database = tenantDb || db;

      // Check if order item exists
      const [existingItem] = await database
        .select()
        .from(orderItemsTable)
        .where(eq(orderItemsTable.id, itemId))
        .limit(1);

      if (!existingItem) {
        return res.status(404).json({
          error: "Order item not found",
        });
      }

      // Prepare update data
      const updateFields: any = {};

      if (updateData.quantity !== undefined) {
        updateFields.quantity = parseInt(updateData.quantity);
      }

      if (updateData.unitPrice !== undefined) {
        updateFields.unitPrice = updateData.unitPrice.toString();
      }

      if (updateData.total !== undefined) {
        updateFields.total = updateData.total.toString();
      }

      if (updateData.discount !== undefined) {
        updateFields.discount = parseFloat(updateData.discount || "0").toFixed(
          2,
        );
      }

      if (updateData.notes !== undefined) {
        updateFields.notes = updateData.notes;
      }

      // Update the order item
      const [updatedItem] = await database
        .update(orderItemsTable)
        .set(updateFields)
        .where(eq(orderItemsTable.id, itemId))
        .returning();

      console.log("Order item updated successfully:", updatedItem);

      res.json({
        success: true,
        orderItem: updatedItem,
        message: "Order item updated successfully",
      });
    } catch (error) {
      console.error("=== UPDATE ORDER ITEM ERROR ===");
      console.error("Error type:", error?.constructor?.name || "Unknown");
      console.error("Error message:", error?.message || "Unknown error");
      console.error("Error stack:", error?.stack || "No stack trace");
      console.error("Item ID:", req.params.itemId);
      console.error("Update data:", req.body);

      res.status(500).json({
        error: "Failed to update order item",
        details: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Delete a specific order item
  app.delete("/api/order-items/:itemId", async (req: TenantRequest, res) => {
    try {
      console.log("=== DELETE ORDER ITEM API CALLED ===");
      const itemId = parseInt(req.params.itemId);
      const tenantDb = await getTenantDatabase(req); // Assuming tenantDb is needed here as well
      console.log("Item ID requested:", itemId);

      if (isNaN(itemId)) {
        return res.status(400).json({
          error: "Invalid item ID",
        });
      }

      console.log("Deleting order item from storage...");
      // @ts-ignore
      const success = await storage.removeOrderItem(itemId, tenantDb); // Pass tenantDb to storage function

      if (success) {
        console.log("Order item deleted successfully");
        res.json({
          success: true,
          message: "Order item deleted successfully",
        });
      } else {
        console.log("Order item not found");
        res.status(404).json({
          error: "Order item not found",
        });
      }
    } catch (error) {
      console.error("=== DELETE ORDER ITEM ERROR ===");
      console.error("Error type:", error.constructor.name);
      console.error("Error message:", error.message);
      console.error("Error stack:", error.stack);
      console.error("Item ID:", req.params.itemId);
      res.status(500).json({
        error: "Failed to delete order item",
        details: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Get POS orders specifically
  app.get(
    "/api/orders/pos",
    tenantMiddleware,
    async (req: TenantRequest, res) => {
      try {
        console.log("🔍 GET /api/orders/pos - Fetching POS orders");
        const tenantDb = await getTenantDatabase(req);

        const posOrders = await storage.getOrders(
          undefined,
          undefined,
          tenantDb,
          "pos",
        );
        console.log(`✅ Successfully fetched ${posOrders.length} POS orders`);
        res.json(posOrders);
      } catch (error) {
        console.error("❌ Error fetching POS orders:", error);
        res.status(500).json({
          error: "Failed to fetch POS orders",
        });
      }
    },
  );

  // Get table orders specifically
  app.get(
    "/api/orders/table",
    tenantMiddleware,
    async (req: TenantRequest, res) => {
      try {
        console.log("🔍 GET /api/orders/table - Fetching table orders");
        const tenantDb = await getTenantDatabase(req);

        const tableOrders = await storage.getOrders(
          undefined,
          undefined,
          tenantDb,
          "table",
        );
        console.log(
          `✅ Successfully fetched ${tableOrders.length} table orders`,
        );
        res.json(tableOrders);
      } catch (error) {
        console.error("❌ Error fetching table orders:", error);
        res.status(500).json({
          error: "Failed to fetch table orders",
        });
      }
    },
  );

  // Add order items to existing order
  app.post("/api/orders/:orderId/items", async (req: TenantRequest, res) => {
    try {
      const orderId = parseInt(req.params.orderId);
      const { items } = req.body;

      console.log(`📝 Adding ${items?.length || 0} items to order ${orderId}`);

      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
          error: "Items array is required",
        });
      }

      if (isNaN(orderId)) {
        return res.status(400).json({
          error: "Invalid order ID",
        });
      }

      // Get tenant database connection
      let tenantDb;
      try {
        tenantDb = await getTenantDatabase(req);
        console.log(
          "✅ Tenant database connection obtained for adding order items",
        );
      } catch (dbError) {
        console.error(
          "❌ Failed to get tenant database for adding order items:",
          dbError,
        );
        return res.status(500).json({
          error: "Database connection failed",
        });
      }

      // Use tenant database for all operations
      const database = tenantDb || db;

      // Validate that order exists
      const [existingOrder] = await database
        .select()
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);

      if (!existingOrder) {
        return res.status(404).json({
          error: "Order not found",
        });
      }

      // Validate items data
      const validatedItems = items.map((item, index) => {
        if (!item.productId || !item.quantity || !item.unitPrice) {
          throw new Error(
            `Item at index ${index} is missing required fields: productId, quantity, or unitPrice`,
          );
        }

        return {
          orderId,
          productId: parseInt(item.productId),
          quantity: parseInt(item.quantity),
          unitPrice: item.unitPrice.toString(),
          total: item.total
            ? item.total.toString()
            : (parseFloat(item.unitPrice) * parseInt(item.quantity)).toString(),
          discount: "0.00", // Default discount, will be recalculated below
          notes: item.notes || null,
        };
      });

      console.log(`📝 Validated items for insertion:`, validatedItems);

      // Insert new items using tenant database
      const insertedItems = await database
        .insert(orderItemsTable)
        .values(validatedItems)
        .returning();

      console.log(
        `✅ Successfully added ${insertedItems.length} items to order ${orderId}`,
      );

      // Recalculate discount distribution for all items in the order
      const orderDiscount = Number(existingOrder.discount || 0);
      if (orderDiscount > 0) {
        console.log(
          `🔄 Recalculating discount distribution for order ${orderId} with total discount ${orderDiscount}`,
        );

        // Get all order items after insertion
        const updatedOrderItems = await database
          .select()
          .from(orderItemsTable)
          .where(eq(orderItemsTable.orderId, orderId));

        // Calculate new discount distribution
        const itemsWithNewDiscount = calculateDiscountDistribution(
          updatedOrderItems,
          orderDiscount,
        );

        // Update each item's discount
        for (const item of itemsWithNewDiscount) {
          await database
            .update(orderItemsTable)
            .set({ discount: item.discount })
            .where(eq(orderItemsTable.id, item.id));
        }

        console.log(
          `✅ Updated discount distribution for ${itemsWithNewDiscount.length} items`,
        );
      }

      // Fetch ALL order items to recalculate totals using order-dialog logic
      const allOrderItems = await database
        .select()
        .from(orderItemsTable)
        .where(eq(orderItemsTable.orderId, orderId));

      console.log(
        `📦 Found ${allOrderItems.length} total items for order ${orderId}`,
      );

      // Get products for tax calculation (same as order-dialog)
      const allProducts = await database.select().from(products);
      const productMap = new Map(allProducts.map((p) => [p.id, p]));

      // EXACT same logic as order-dialog calculateTotal()
      let calculatedSubtotal = 0; // Tiền tạm tính (trước thuế)

      allOrderItems.forEach((item) => {
        const unitPrice = Number(item.unitPrice || 0); // Giá trước thuế
        const quantity = Number(item.quantity || 0);

        // Calculate subtotal (base price * quantity) - EXACT same as order-dialog
        const itemSubtotal = unitPrice * quantity;
        calculatedSubtotal += itemSubtotal;
      });

      // EXACT same logic as order-dialog calculateTax()
      let calculatedTax = 0; // Tổng thuế

      allOrderItems.forEach((item) => {
        const unitPrice = Number(item.unitPrice || 0);
        const quantity = Number(item.quantity || 0);
        const product = productMap.get(item.productId);

        let itemTax = 0;
        // Thuế = (after_tax_price - price) * quantity - EXACT same as order-dialog
        if (
          // @ts-ignore
          product?.afterTaxPrice &&
          // @ts-ignore
          product.afterTaxPrice !== null &&
          // @ts-ignore
          product.afterTaxPrice !== ""
        ) {
          // @ts-ignore
          const afterTaxPrice = parseFloat(product.afterTaxPrice); // Giá sau thuế
          const preTaxPrice = unitPrice; // Giá trước thuế
          const taxPerUnit = Math.max(0, afterTaxPrice - preTaxPrice); // Thuế trên đơn vị
          itemTax = taxPerUnit * quantity;
        }
        // Không có thuế nếu không có afterTaxPrice
        calculatedTax += itemTax;
      });

      // EXACT same logic as order-dialog calculateGrandTotal()
      const calculatedTotal = calculatedSubtotal + calculatedTax;

      console.log(`💰 Calculated new totals using order-dialog logic:`, {
        subtotal: calculatedSubtotal,
        tax: calculatedTax,
        total: calculatedTotal,
        itemsCount: allOrderItems.length,
        calculationMethod: "order-dialog-exact",
      });

      // Update order totals with calculated values using tenant database
      const [updatedOrder] = await database
        .update(orders)
        .set({
          subtotal: calculatedSubtotal.toString(),
          tax: calculatedTax.toString(),
          total: calculatedTotal.toString(),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(orders.id, orderId))
        .returning();

      console.log(
        `✅ Order ${orderId} totals updated successfully using order-dialog calculation`,
      );

      res.json({
        success: true,
        insertedItems,
        updatedOrder,
        message: `Added ${insertedItems.length} items and updated order totals using order-dialog logic`,
      });
    } catch (error) {
      console.error(
        `❌ Error adding items to order ${req.params.orderId}:`,
        error,
      );

      let errorMessage = "Failed to add items to order";
      if (error instanceof Error) {
        errorMessage = error.message;
      }

      res.status(500).json({
        error: errorMessage,
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Inventory Management
  app.post("/api/inventory/update-stock", async (req: TenantRequest, res) => {
    try {
      const { productId, quantity, type, notes, trackInventory } = req.body;
      const tenantDb = await getTenantDatabase(req);

      // Get current product
      const [product] = await db
        .select()
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);
      if (!product) {
        return res.status(404).json({
          error: "Product not found",
        });
      }

      let newStock = product.stock;
      switch (type) {
        case "add":
          newStock += quantity;
          break;
        case "subtract":
          newStock = Math.max(0, product.stock - quantity);
          break;
        case "set":
          newStock = quantity;
          break;
      }

      // Update product stock and trackInventory
      const updateData: any = {
        stock: newStock,
      };
      if (trackInventory !== undefined) {
        updateData.trackInventory = trackInventory;
      }

      await db
        .update(products)
        .set(updateData)
        .where(eq(products.id, productId));

      // Create inventory transaction record using raw SQL to match exact schema
      await db.execute(sql`
        INSERT INTO inventory_transactions (product_id, type, quantity, previous_stock, new_stock, notes, created_at)
        VALUES (${productId}, ${type}, ${quantity}, ${product.stock}, ${newStock}, ${notes || null}, ${new Date().toISOString()})
      `);

      res.json({
        success: true,
        newStock,
      });
    } catch (error) {
      console.error("Stock update error:", error);
      res.status(500).json({
        error: "Failed to update stock",
      });
    }
  });

  // Store Settings
  app.get("/api/store-settings", async (req: TenantRequest, res) => {
    try {
      const settings = await storage.getStoreSettings();
      res.json(settings);
    } catch (error) {
      console.error("Error fetching store settings:", error);
      res.status(500).json({
        error: "Failed to fetch store settings",
      });
    }
  });

  // Current cart state for customer display
  app.get("/api/current-cart", async (req, res) => {
    try {
      console.log("📱 Customer Display: Current cart API called");

      // Get store settings for customer display
      const storeSettings = await storage.getStoreSettings();

      const currentCartState = {
        cart: [],
        subtotal: 0,
        tax: 0,
        total: 0,
        storeInfo: storeSettings,
        qrPayment: null,
      };

      console.log("📱 Customer Display: Current cart API returning state:", {
        cartItems: currentCartState.cart.length,
        subtotal: currentCartState.subtotal,
        tax: currentCartState.tax,
        total: currentCartState.total,
        hasStoreInfo: !!currentCartState.storeInfo,
        storeName: currentCartState.storeInfo?.storeName,
      });

      res.json(currentCartState);
    } catch (error) {
      console.error("❌ Error fetching current cart:", error);
      res.status(500).json({
        error: "Failed to fetch current cart",
      });
    }
  });

  app.put("/api/store-settings", async (req: TenantRequest, res) => {
    try {
      const validatedData = insertStoreSettingsSchema.partial().parse(req.body);
      const tenantDb = await getTenantDatabase(req);
      const settings = await storage.updateStoreSettings(
        validatedData,
        tenantDb,
      );
      res.json(settings);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: "Invalid store settings data",
          errors: error.errors,
        });
      }
      res.status(500).json({
        message: "Failed to update store settings",
      });
    }
  });

  // Suppliers
  app.get(
    "/api/suppliers",
    tenantMiddleware,
    async (req: TenantRequest, res) => {
      try {
        console.log("🔍 GET /api/suppliers - Starting request processing");
        let tenantDb;
        try {
          tenantDb = await getTenantDatabase(req);
          console.log("✅ Tenant database connection obtained for suppliers");
        } catch (dbError) {
          console.error(
            "❌ Failed to get tenant database for suppliers:",
            dbError,
          );
          tenantDb = null;
        }

        const { status, search } = req.query;
        let suppliers;

        if (search) {
          // @ts-ignore
          suppliers = await storage.searchSuppliers(search as string, tenantDb);
        } else if (status && status !== "all") {
          suppliers = await storage.getSuppliersByStatus(
            status as string,
            // @ts-ignore
            tenantDb,
          );
        } else {
          // @ts-ignore
          suppliers = await storage.getSuppliers(tenantDb);
        }
        console.log(`✅ Successfully fetched ${suppliers.length} suppliers`);
        res.json(suppliers);
      } catch (error) {
        console.error("❌ Error fetching suppliers:", error);
        res.status(500).json({
          message: "Failed to fetch suppliers",
        });
      }
    },
  );

  app.get("/api/suppliers/:id", async (req: TenantRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const tenantDb = await getTenantDatabase(req);
      // @ts-ignore
      const supplier = await storage.getSupplier(id, tenantDb);

      if (!supplier) {
        return res.status(404).json({
          message: "Supplier not found",
        });
      }

      res.json(supplier);
    } catch (error) {
      res.status(500).json({
        message: "Failed to fetch supplier",
      });
    }
  });

  app.post("/api/suppliers", async (req: TenantRequest, res) => {
    try {
      const validatedData = insertSupplierSchema.parse(req.body);
      const tenantDb = await getTenantDatabase(req);
      // @ts-ignore
      const supplier = await storage.createSupplier(validatedData, tenantDb);
      res.status(201).json(supplier);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: "Invalid supplier data",
          errors: error.errors,
        });
      }
      res.status(500).json({
        message: "Failed to create supplier",
      });
    }
  });

  app.put("/api/suppliers/:id", async (req: TenantRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const validatedData = insertSupplierSchema.partial().parse(req.body);
      const tenantDb = await getTenantDatabase(req);
      const supplier = await storage.updateSupplier(
        id,
        validatedData,
        // @ts-ignore
        tenantDb,
      );

      if (!supplier) {
        return res.status(404).json({
          message: "Supplier not found",
        });
      }

      res.json(supplier);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: "Invalid supplier data",
          errors: error.errors,
        });
      }
      res.status(500).json({
        message: "Failed to update supplier",
      });
    }
  });

  app.delete("/api/suppliers/:id", async (req: TenantRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const tenantDb = await getTenantDatabase(req);
      // @ts-ignore
      const deleted = await storage.deleteSupplier(id, tenantDb);

      if (!deleted) {
        return res.status(404).json({
          message: "Supplier not found",
        });
      }

      res.json({
        message: "Supplier deleted successfully",
      });
    } catch (error) {
      res.status(500).json({
        message: "Failed to delete supplier",
      });
    }
  });

  // Get next customer ID
  app.get("/api/customers/next-id", async (req: TenantRequest, res) => {
    try {
      const tenantDb = await getTenantDatabase(req);
      const nextId = await storage.getNextCustomerId(tenantDb);
      res.json({
        nextId,
      });
    } catch (error) {
      res.status(500).json({
        message: "Failed to generate customer ID",
      });
    }
  });

  // Customer management routes - Added Here
  app.get(
    "/api/customers",
    tenantMiddleware,
    async (req: TenantRequest, res) => {
      try {
        console.log("🔍 GET /api/customers - Starting request processing");
        let tenantDb;
        try {
          tenantDb = await getTenantDatabase(req);
          console.log("✅ Tenant database connection obtained for customers");
        } catch (dbError) {
          console.error(
            "❌ Failed to get tenant database for customers:",
            dbError,
          );
          tenantDb = null;
        }

        const customers = await storage.getCustomers(tenantDb);
        console.log(`✅ Successfully fetched ${customers.length} customers`);
        res.json(customers);
      } catch (error) {
        console.error("❌ Error fetching customers:", error);
        res.status(500).json({
          message: "Failed to fetch customers",
        });
      }
    },
  );

  app.get("/api/customers/:id", async (req: TenantRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const tenantDb = await getTenantDatabase(req);
      // @ts-ignore
      const customer = await storage.getCustomer(id, tenantDb);
      if (!customer) {
        return res.status(404).json({
          message: "Customer not found",
        });
      }
      res.json(customer);
    } catch (error) {
      res.status(500).json({
        message: "Failed to fetch customer",
      });
    }
  });

  // Create customer
  app.post("/api/customers", async (req: TenantRequest, res) => {
    try {
      const tenantDb = await getTenantDatabase(req);

      // Validate required fields
      if (!req.body.name) {
        return res.status(400).json({
          message: "Customer name is required",
        });
      }

      // Prepare customer data with proper defaults
      const customerData = {
        ...req.body,
        customerId: req.body.customerId || undefined,
        phone: req.body.phone || null,
        email: req.body.email || null,
        address: req.body.address || null,
        dateOfBirth: req.body.dateOfBirth || null,
        membershipLevel: req.body.membershipLevel || "Silver",
        notes: req.body.notes || null,
        status: req.body.status || "active",
        totalSpent: "0",
        pointsBalance: 0,
      };

      const [customer] = await db
        .insert(customers)
        .values(customerData)
        .returning();
      res.json(customer);
    } catch (error: any) {
      console.error("Error creating customer:", error);

      // Handle specific database errors
      if (error.code === "SQLITE_CONSTRAINT") {
        return res.status(400).json({
          message: "Customer with this ID already exists",
        });
      }

      res.status(500).json({
        message: "Failed to create customer",
        error: error.message,
      });
    }
  });

  app.put("/api/customers/:id", async (req: TenantRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const customerData = req.body;
      const tenantDb = await getTenantDatabase(req);
      // @ts-ignore
      const customer = await storage.updateCustomer(id, customerData, tenantDb);
      if (!customer) {
        return res.status(404).json({
          message: "Customer not found",
        });
      }
      res.json(customer);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: "Invalid customer data",
          errors: error.errors,
        });
      }
      res.status(500).json({
        message: "Failed to update customer",
      });
    }
  });

  app.delete("/api/customers/:id", async (req: TenantRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const tenantDb = await getTenantDatabase(req);
      // @ts-ignore
      const deleted = await storage.deleteCustomer(id, tenantDb);
      if (!deleted) {
        return res.status(404).json({
          message: "Customer not found",
        });
      }
      res.json({
        message: "Customer deleted successfully",
      });
    } catch (error) {
      res.status(500).json({
        message: "Failed to delete customer",
      });
    }
  });

  app.post("/api/customers/:id/visit", async (req: TenantRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const { amount, points } = req.body;
      const tenantDb = await getTenantDatabase(req);
      // @ts-ignore
      const customer = await storage.getCustomer(id, tenantDb);
      if (!customer) {
        return res.status(404).json({
          message: "Customer not found",
        });
      }

      const updatedCustomer = await storage.updateCustomerVisit(
        id,
        amount,
        points,
        // @ts-ignore
        tenantDb,
      );
      res.json(updatedCustomer);
    } catch (error) {
      res.status(500).json({
        message: "Failed to update customer visit",
      });
    }
  });

  // Point Management API
  app.get("/api/customers/:id/points", async (req: TenantRequest, res) => {
    try {
      const customerId = parseInt(req.params.id);
      const tenantDb = await getTenantDatabase(req);
      // @ts-ignore
      const pointsData = await storage.getCustomerPoints(customerId, tenantDb);

      if (!pointsData) {
        return res.status(404).json({
          message: "Customer not found",
        });
      }

      res.json(pointsData);
    } catch (error) {
      res.status(500).json({
        message: "Failed to fetch customer points",
      });
    }
  });

  app.post("/api/customers/:id/points", async (req: TenantRequest, res) => {
    try {
      const customerId = parseInt(req.params.id);
      const pointUpdateSchema = z.object({
        points: z.number().int().min(1),
        description: z.string().min(1),
        type: z.enum(["earned", "redeemed", "adjusted"]),
        employeeId: z.number().optional(),
        orderId: z.number().optional(),
      });

      const { points, description, type, employeeId, orderId } =
        pointUpdateSchema.parse(req.body);
      const tenantDb = await getTenantDatabase(req);

      const pointTransaction = await storage.updateCustomerPoints(
        customerId,
        points,
        description,
        type,
        employeeId,
        orderId,
        // @ts-ignore
        tenantDb,
      );

      res.status(201).json(pointTransaction);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: "Invalid point update data",
          errors: error.errors,
        });
      }
      if (error instanceof Error && error.message === "Customer not found") {
        return res.status(404).json({
          message: "Customer not found",
        });
      }
      if (
        error instanceof Error &&
        error.message === "Insufficient points balance"
      ) {
        return res.status(400).json({
          message: "Insufficient points balance",
        });
      }
      res.status(500).json({
        message: "Failed to update customer points",
      });
    }
  });

  app.get(
    "/api/customers/:id/point-history",
    async (req: TenantRequest, res) => {
      try {
        const customerId = parseInt(req.params.id);
        const limit = parseInt(req.query.limit as string) || 50;
        const tenantDb = await getTenantDatabase(req);

        const pointHistory = await storage.getPointHistory(
          customerId,
          limit,
          // @ts-ignore
          tenantDb,
        );
        res.json(pointHistory);
      } catch (error) {
        res.status(500).json({
          message: "Failed to fetch point history",
        });
      }
    },
  );

  // New endpoints for points management modal
  app.post("/api/customers/adjust-points", async (req: TenantRequest, res) => {
    try {
      const pointUpdateSchema = z.object({
        customerId: z.number().int().min(1),
        points: z.number().int(),
        type: z.enum(["earned", "redeemed", "adjusted"]),
        description: z.string().min(1),
      });

      const { customerId, points, type, description } = pointUpdateSchema.parse(
        req.body,
      );
      const tenantDb = await getTenantDatabase(req);

      const pointTransaction = await storage.updateCustomerPoints(
        customerId,
        points,
        description,
        type,
        undefined, // employeeId is optional and not provided here
        undefined, // orderId is optional and not provided here
        // @ts-ignore
        tenantDb,
      );

      res.status(201).json(pointTransaction);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: "Invalid point adjustment data",
          errors: error.errors,
        });
      }
      if (error instanceof Error && error.message === "Customer not found") {
        return res.status(404).json({
          message: "Customer not found",
        });
      }
      if (
        error instanceof Error &&
        error.message === "Insufficient points balance"
      ) {
        return res.status(400).json({
          message: "Insufficient points balance",
        });
      }
      res.status(500).json({
        message: "Failed to adjust customer points",
      });
    }
  });

  app.post("/api/customers/redeem-points", async (req: TenantRequest, res) => {
    try {
      const redeemSchema = z.object({
        customerId: z.number().int().min(1),
        points: z.number().int().min(1),
      });

      const { customerId, points } = redeemSchema.parse(req.body);
      const tenantDb = await getTenantDatabase(req);

      const pointTransaction = await storage.updateCustomerPoints(
        customerId,
        -points,
        "포인트 결제 사용",
        "redeemed",
        undefined, // employeeId is optional
        undefined, // orderId is optional
        // @ts-ignore
        tenantDb,
      );

      res.status(201).json(pointTransaction);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: "Invalid point redemption data",
          errors: error.errors,
        });
      }
      if (error instanceof Error && error.message === "Customer not found") {
        return res.status(404).json({
          message: "Customer not found",
        });
      }
      if (
        error instanceof Error &&
        error.message === "Insufficient points balance"
      ) {
        return res.status(400).json({
          message: "Insufficient points balance",
        });
      }
      res.status(500).json({
        message: "Failed to redeem customer points",
      });
    }
  });

  app.get("/api/point-transactions", async (req: TenantRequest, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const tenantDb = await getTenantDatabase(req);
      // For now, get all point transactions across all customers
      // In a real app, you might want to add pagination and filtering
      const allTransactions = await storage.getAllPointTransactions(
        limit,
        // @ts-ignore
        tenantDb,
      );
      res.json(allTransactions);
    } catch (error) {
      res.status(500).json({
        message: "Failed to fetch point transactions",
      });
    }
  });

  // Membership thresholds management
  app.get("/api/membership-thresholds", async (req: TenantRequest, res) => {
    try {
      const tenantDb = await getTenantDatabase(req);
      // @ts-ignore
      const thresholds = await storage.getMembershipThresholds(tenantDb);
      res.json(thresholds);
    } catch (error) {
      res.status(500).json({
        message: "Failed to fetch membership thresholds",
      });
    }
  });

  app.put("/api/membership-thresholds", async (req: TenantRequest, res) => {
    try {
      const thresholdSchema = z.object({
        GOLD: z.number().min(0),
        VIP: z.number().min(0),
      });

      const validatedData = thresholdSchema.parse(req.body);
      const tenantDb = await getTenantDatabase(req);
      const thresholds = await storage.updateMembershipThresholds(
        validatedData,
        // @ts-ignore
        tenantDb,
      );

      res.json(thresholds);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: "Invalid threshold data",
          errors: error.errors,
        });
      }
      res.status(500).json({
        message: "Failed to update membership thresholds",
      });
    }
  });

  // Supplier Reports APIs
  app.get("/api/supplier-debts", async (req: TenantRequest, res) => {
    try {
      const { startDate, endDate, supplierId } = req.query;
      const tenantDb = await getTenantDatabase(req);

      // Mock data for supplier debts - replace with actual database queries
      const supplierDebts = [
        {
          id: 1,
          supplierCode: "SUP001",
          supplierName: "Nhà cung cấp A",
          initialDebt: 500000,
          newDebt: 300000,
          payment: 200000,
          finalDebt: 600000,
          phone: "010-1234-5678",
        },
        {
          id: 2,
          supplierCode: "SUP002",
          supplierName: "Nhà cung cấp B",
          initialDebt: 800000,
          newDebt: 400000,
          payment: 300000,
          finalDebt: 900000,
          phone: "010-2345-6789",
        },
      ];

      // Filter by supplier if specified
      let filteredDebts = supplierDebts;
      if (supplierId) {
        filteredDebts = supplierDebts.filter(
          (debt) => debt.id === parseInt(supplierId as string),
        );
      }

      res.json(filteredDebts);
    } catch (error) {
      res.status(500).json({
        message: "Failed to fetch supplier debts",
      });
    }
  });

  app.get("/api/supplier-purchases", async (req: TenantRequest, res) => {
    try {
      const { startDate, endDate, supplierId } = req.query;
      const tenantDb = await getTenantDatabase(req);

      // Mock data for supplier purchases - replace with actual database queries
      const supplierPurchases = [
        {
          id: 1,
          supplierCode: "SUP001",
          supplierName: "Nhà cung cấp A",
          purchaseValue: 1500000,
          paymentValue: 1200000,
          netValue: 300000,
          phone: "010-1234-5678",
        },
        {
          id: 2,
          supplierCode: "SUP002",
          supplierName: "Nhà cung cấp B",
          purchaseValue: 2000000,
          paymentValue: 1700000,
          netValue: 300000,
          phone: "010-2345-6789",
        },
      ];

      // Filter by supplier if specified
      let filteredPurchases = supplierPurchases;
      if (supplierId) {
        filteredPurchases = supplierPurchases.filter(
          (purchase) => purchase.id === parseInt(supplierId as string),
        );
      }

      res.json(filteredPurchases);
    } catch (error) {
      res.status(500).json({
        message: "Failed to fetch supplier purchases",
      });
    }
  });

  // Invoice templates management
  app.get(
    "/api/invoice-templates",
    tenantMiddleware,
    async (req: TenantRequest, res) => {
      try {
        console.log(
          "🔍 GET /api/invoice-templates - Starting request processing",
        );
        let tenantDb;
        try {
          tenantDb = await getTenantDatabase(req);
          console.log(
            "✅ Tenant database connection obtained for invoice templates",
          );
        } catch (dbError) {
          console.error(
            "❌ Failed to get tenant database for invoice templates:",
            dbError,
          );
          tenantDb = null;
        }

        const templates = await storage.getInvoiceTemplates(tenantDb);
        console.log(
          `✅ Successfully fetched ${templates.length} invoice templates`,
        );
        res.json(templates);
      } catch (error) {
        console.error("❌ Error fetching invoice templates:", error);
        res.status(500).json({
          error: "Failed to fetch invoice templates",
        });
      }
    },
  );

  app.get("/api/invoice-templates/active", async (req: TenantRequest, res) => {
    try {
      const tenantDb = await getTenantDatabase(req);
      const activeTemplates = await storage.getActiveInvoiceTemplates();
      res.json(activeTemplates);
    } catch (error) {
      console.error("Error fetching active invoice templates:", error);
      res.status(500).json({
        error: "Failed to fetch active invoice templates",
      });
    }
  });

  app.post("/api/invoice-templates", async (req: TenantRequest, res) => {
    try {
      const templateData = req.body;
      const tenantDb = await getTenantDatabase(req);
      const template = await storage.createInvoiceTemplate(
        templateData,
        tenantDb,
      );
      res.status(201).json(template);
    } catch (error) {
      console.error("Invoice template creation error:", error);
      res.status(500).json({
        message: "Failed to create invoice template",
      });
    }
  });

  app.put("/api/invoice-templates/:id", async (req: TenantRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const templateData = req.body;
      const tenantDb = await getTenantDatabase(req);
      const template = await storage.updateInvoiceTemplate(
        id,
        templateData,
        tenantDb,
      );

      if (!template) {
        return res.status(404).json({
          message: "Invoice template not found",
        });
      }

      res.json(template);
    } catch (error) {
      console.error("Invoice template update error:", error);
      res.status(500).json({
        message: "Failed to update invoice template",
      });
    }
  });

  app.delete("/api/invoice-templates/:id", async (req: TenantRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const tenantDb = await getTenantDatabase(req);
      const deleted = await storage.deleteInvoiceTemplate(id, tenantDb);

      if (!deleted) {
        return res.status(404).json({
          message: "Invoice template not found",
        });
      }

      res.json({
        message: "Invoice template deleted successfully",
      });
    } catch (error) {
      console.error("Invoice template deletion error:", error);
      res.status(500).json({
        message: "Failed to delete invoice template",
      });
    }
  });

  // Invoices management
  app.get(
    "/api/invoices",
    tenantMiddleware,
    async (req: TenantRequest, res) => {
      try {
        console.log("🔍 GET /api/invoices - Starting request processing");
        let tenantDb;
        try {
          tenantDb = await getTenantDatabase(req);
          console.log("✅ Tenant database connection obtained for invoices");
        } catch (dbError) {
          console.error(
            "❌ Failed to get tenant database for invoices:",
            dbError,
          );
          tenantDb = null;
        }

        const invoices = await storage.getInvoices(tenantDb);
        console.log(`✅ Successfully fetched ${invoices.length} invoices`);
        res.json(invoices);
      } catch (error) {
        console.error("❌ Error fetching invoices:", error);
        res.status(500).json({
          message: "Failed to fetch invoices",
        });
      }
    },
  );

  app.post("/api/invoices", async (req: TenantRequest, res) => {
    try {
      console.log("🔍 POST /api/invoices - Creating new invoice");
      const tenantDb = await getTenantDatabase(req);
      const invoiceData = req.body;

      console.log(
        "📄 Invoice data received:",
        JSON.stringify(invoiceData, null, 2),
      );

      // Validate required fields
      if (!invoiceData.customerName) {
        return res.status(400).json({
          error: "Customer name is required",
        });
      }

      if (!invoiceData.total || parseFloat(invoiceData.total) <= 0) {
        return res.status(400).json({
          error: "Valid total amount is required",
        });
      }

      if (
        !invoiceData.items ||
        !Array.isArray(invoiceData.items) ||
        invoiceData.items.length === 0
      ) {
        return res.status(400).json({
          error: "Invoice items are required",
        });
      }

      // Create invoice in database
      const invoice = await storage.createInvoice(invoiceData, tenantDb);

      console.log("✅ Invoice created successfully:", invoice);
      res.status(201).json({
        success: true,
        invoice: invoice,
        message: "Invoice created successfully",
      });
    } catch (error) {
      console.error("❌ Error creating invoice:", error);

      let errorMessage = "Failed to create invoice";
      if (error instanceof Error) {
        errorMessage = `Failed to create invoice: ${error.message}`;
      }

      res.status(500).json({
        error: errorMessage,
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.get("/api/invoices/:id", async (req: TenantRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const tenantDb = await getTenantDatabase(req);

      if (isNaN(id)) {
        return res.status(400).json({
          error: "Invalid invoice ID",
        });
      }

      const invoice = await storage.getInvoice(id, tenantDb);

      if (!invoice) {
        return res.status(404).json({
          error: "Invoice not found",
        });
      }

      res.json(invoice);
    } catch (error) {
      console.error("❌ Error fetching invoice:", error);
      res.status(500).json({
        message: "Failed to fetch invoice",
      });
    }
  });

  app.put("/api/invoices/:id", async (req: TenantRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const tenantDb = await getTenantDatabase(req);
      const updateData = req.body;

      if (isNaN(id)) {
        return res.status(400).json({
          error: "Invalid invoice ID",
        });
      }

      const invoice = await storage.updateInvoice(id, updateData, tenantDb);

      if (!invoice) {
        return res.status(404).json({
          error: "Invoice not found",
        });
      }

      res.json(invoice);
    } catch (error) {
      console.error("❌ Error updating invoice:", error);
      res.status(500).json({
        message: "Failed to update invoice",
      });
    }
  });

  app.delete("/api/invoices/:id", async (req: TenantRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const tenantDb = await getTenantDatabase(req);

      if (isNaN(id)) {
        return res.status(400).json({
          error: "Invalid invoice ID",
        });
      }

      const deleted = await storage.deleteInvoice(id, tenantDb);

      if (!deleted) {
        return res.status(404).json({
          error: "Invoice not found",
        });
      }

      res.json({
        message: "Invoice deleted successfully",
      });
    } catch (error) {
      console.error("❌ Error deleting invoice:", error);
      res.status(500).json({
        message: "Failed to delete invoice",
      });
    }
  });

  // E-invoice connections management
  app.get(
    "/api/einvoice-connections",
    tenantMiddleware,
    async (req: TenantRequest, res) => {
      try {
        console.log(
          "🔍 GET /api/einvoice-connections - Starting request processing",
        );
        let tenantDb;
        try {
          tenantDb = await getTenantDatabase(req);
          console.log(
            "✅ Tenant database connection obtained for e-invoice connections",
          );
        } catch (dbError) {
          console.error(
            "❌ Failed to get tenant database for e-invoice connections:",
            dbError,
          );
          tenantDb = null;
        }
        // @ts-ignore
        const connections = await storage.getEInvoiceConnections(tenantDb);
        console.log(
          `✅ Successfully fetched ${connections.length} e-invoice connections`,
        );
        res.json(connections);
      } catch (error) {
        console.error("❌ Error fetching e-invoice connections:", error);
        res.status(500).json({
          message: "Failed to fetch e-invoice connections",
        });
      }
    },
  );

  app.post("/api/einvoice-connections", async (req: TenantRequest, res) => {
    try {
      const connectionData = req.body;
      const tenantDb = await getTenantDatabase(req);
      const connection = await storage.createEInvoiceConnection(
        connectionData,
        // @ts-ignore
        tenantDb,
      );
      res.status(201).json(connection);
    } catch (error) {
      console.error("E-invoice connection creation error:", error);
      res.status(500).json({
        message: "Failed to create e-invoice connection",
      });
    }
  });

  app.put("/api/einvoice-connections/:id", async (req: TenantRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const connectionData = req.body;
      const tenantDb = await getTenantDatabase(req);
      const connection = await storage.updateEInvoiceConnection(
        id,
        connectionData,
        // @ts-ignore
        tenantDb,
      );

      if (!connection) {
        return res.status(404).json({
          message: "E-invoice connection not found",
        });
      }

      res.json(connection);
    } catch (error) {
      console.error("E-invoice connection update error:", error);
      res.status(500).json({
        message: "Failed to update e-invoice connection",
      });
    }
  });

  app.delete(
    "/api/einvoice-connections/:id",
    async (req: TenantRequest, res) => {
      try {
        const id = parseInt(req.params.id);
        const tenantDb = await getTenantDatabase(req);
        // @ts-ignore
        const deleted = await storage.deleteEInvoiceConnection(id, tenantDb);

        if (!deleted) {
          return res.status(404).json({
            message: "E-invoice connection not found",
          });
        }

        res.json({
          message: "E-invoice connection deleted successfully",
        });
      } catch (error) {
        console.error("E-invoice connection deletion error:", error);
        res.status(500).json({
          message: "Failed to delete e-invoice connection",
        });
      }
    },
  );

  // Menu Analysis API
  app.get("/api/menu-analysis", async (req, res) => {
    try {
      const { startDate, endDate, categoryId, productType, productSearch } =
        req.query;
      const tenantDb = await getTenantDatabase(req);

      console.log("Menu Analysis API called with params:", {
        startDate,
        endDate,
        search: req.query.search,
        categoryId,
        productType: req.query.productType,
      });

      console.log("Executing transaction and order queries...");

      // Build date conditions
      const dateConditions = [];
      if (startDate && endDate) {
        const startDateTime = new Date(startDate as string);
        const endDateTime = new Date(endDate as string);
        endDateTime.setHours(23, 59, 59, 999);
        dateConditions.push(
          gte(transactionsTable.createdAt, startDateTime),
          lte(transactionsTable.createdAt, endDateTime),
        );
      } else if (startDate) {
        const startDateTime = new Date(startDate as string);
        dateConditions.push(gte(transactionsTable.createdAt, startDateTime));
      } else if (endDate) {
        const endDateTime = new Date(endDate as string);
        dateConditions.push(lte(transactionsTable.createdAt, endDateTime));
      }

      // Build category conditions
      const categoryConditions = [];
      if (categoryId && categoryId !== "all") {
        categoryConditions.push(
          eq(products.categoryId, parseInt(categoryId as string)),
        );
      }

      // Query transaction items with proper Drizzle ORM
      let transactionResults = [];
      try {
        transactionResults = await db
          .select({
            productId: transactionItemsTable.productId,
            productName: products.name,
            categoryId: products.categoryId,
            categoryName: categories.name,
            totalQuantity: sql<number>`SUM(${transactionItemsTable.quantity})`,
            // @ts-ignore
            totalRevenue: sql<number>`SUM(CAST(${transactionItemsTable.unitPrice} AS NUMERIC) * ${transactionItemsTable.quantity})`,
          })
          .from(transactionItemsTable)
          .innerJoin(
            transactionsTable,
            eq(transactionItemsTable.transactionId, transactionsTable.id),
          )
          .innerJoin(products, eq(transactionItemsTable.productId, products.id))
          .leftJoin(categories, eq(products.categoryId, categories.id))
          .where(and(...dateConditions, ...categoryConditions))
          .groupBy(
            transactionItemsTable.productId,
            products.name,
            products.categoryId,
            categories.name,
          );
      } catch (error) {
        console.error("Error querying transaction items:", error);
        transactionResults = [];
      }

      // Query order items with proper Drizzle ORM
      const orderDateConditions = [];
      if (startDate && endDate) {
        const startDateTime = new Date(startDate as string);
        const endDateTime = new Date(endDate as string);
        endDateTime.setHours(23, 59, 59, 999);
        orderDateConditions.push(
          gte(orders.orderedAt, startDateTime),
          lte(orders.orderedAt, endDateTime),
        );
      } else if (startDate) {
        const startDateTime = new Date(startDate as string);
        orderDateConditions.push(gte(orders.orderedAt, startDateTime));
      } else if (endDate) {
        const endDateTime = new Date(endDate as string);
        orderDateConditions.push(lte(orders.orderedAt, endDateTime));
      }

      let orderResults = [];
      try {
        orderResults = await db
          .select({
            productId: orderItemsTable.productId,
            productName: products.name,
            categoryId: products.categoryId,
            categoryName: categories.name,
            totalQuantity: sql<number>`SUM(${orderItemsTable.quantity})`,
            totalRevenue: sql<number>`SUM(CAST(${orderItemsTable.unitPrice} AS NUMERIC) * ${orderItemsTable.quantity} - ${orderItemsTable.discount})`,
          })
          .from(orderItemsTable)
          .innerJoin(orders, eq(orderItemsTable.orderId, orders.id))
          .innerJoin(products, eq(orderItemsTable.productId, products.id))
          .leftJoin(categories, eq(products.categoryId, categories.id))
          .where(
            and(
              or(eq(orders.status, "paid"), eq(orders.status, "completed")),
              ...orderDateConditions,
              ...categoryConditions,
            ),
          )
          .groupBy(
            orderItemsTable.productId,
            products.name,
            products.categoryId,
            categories.name,
          );
      } catch (error) {
        console.error("Error querying order items:", error);
        orderResults = [];
      }

      console.log("Transaction stats:", transactionResults.length, "items");
      console.log("Order stats:", orderResults.length, "items");

      // Combine and aggregate results
      const productMap = new Map();
      const categoryMap = new Map();

      // Process transaction results
      transactionResults.forEach((item) => {
        const key = item.productId;
        if (productMap.has(key)) {
          const existing = productMap.get(key);
          existing.totalQuantity += Number(item.totalQuantity || 0);
          existing.totalRevenue += Number(item.totalRevenue || 0);
        } else {
          productMap.set(key, {
            productId: item.productId,
            productName: item.productName,
            categoryId: item.categoryId,
            categoryName: item.categoryName,
            totalQuantity: Number(item.totalQuantity || 0),
            totalRevenue: Number(item.totalRevenue || 0),
          });
        }
      });

      // Process order results
      orderResults.forEach((item) => {
        const key = item.productId;
        if (productMap.has(key)) {
          const existing = productMap.get(key);
          existing.totalQuantity += Number(item.totalQuantity || 0);
          existing.totalRevenue += Number(item.totalRevenue || 0);
        } else {
          productMap.set(key, {
            productId: item.productId,
            productName: item.productName,
            categoryId: item.categoryId,
            categoryName: item.categoryName,
            totalQuantity: Number(item.totalQuantity || 0),
            totalRevenue: Number(item.totalRevenue || 0),
          });
        }
      });

      // Calculate category stats
      productMap.forEach((product) => {
        const categoryKey = product.categoryId;
        if (categoryMap.has(categoryKey)) {
          const existing = categoryMap.get(categoryKey);
          existing.totalQuantity += product.totalQuantity;
          existing.totalRevenue += product.totalRevenue;
          existing.productCount += 1;
        } else {
          categoryMap.set(categoryKey, {
            categoryId: product.categoryId,
            categoryName: product.categoryName,
            totalQuantity: product.totalQuantity,
            totalRevenue: product.totalRevenue,
            productCount: 1,
          });
        }
      });

      const productStats = Array.from(productMap.values());
      const categoryStats = Array.from(categoryMap.values());

      // Calculate totals
      const totalRevenue = productStats.reduce(
        (sum, product) => sum + product.totalRevenue,
        0,
      );
      const totalQuantity = productStats.reduce(
        (sum, product) => sum + product.totalQuantity,
        0,
      );

      // Top selling products (by quantity)
      const topSellingProducts = productStats
        .sort((a, b) => b.totalQuantity - a.totalQuantity)
        .slice(0, 10);

      // Top revenue products
      const topRevenueProducts = productStats
        .sort((a, b) => b.totalRevenue - a.totalRevenue)
        .slice(0, 10);

      const result = {
        totalRevenue,
        totalQuantity,
        categoryStats,
        productStats,
        topSellingProducts,
        topRevenueProducts,
      };

      console.log("Menu Analysis Results:", {
        totalRevenue,
        totalQuantity,
        categoryCount: categoryStats.length,
      });

      res.json(result);
    } catch (error) {
      console.error("Menu analysis error:", error);
      res.status(500).json({
        error: "Failed to fetch menu analysis",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Printer configuration management APIs
  app.get(
    "/api/printer-configs",
    tenantMiddleware,
    async (req: TenantRequest, res) => {
      try {
        console.log(
          "🔍 GET /api/printer-configs - Starting request processing",
        );
        let tenantDb;
        try {
          tenantDb = await getTenantDatabase(req);
          console.log(
            "✅ Tenant database connection obtained for printer configs",
          );
        } catch (dbError) {
          console.error(
            "❌ Failed to get tenant database for printer configs:",
            dbError,
          );
          tenantDb = null;
        }

        const configs = await storage.getPrinterConfigs(tenantDb);
        console.log(
          `✅ Successfully fetched ${configs.length} printer configs`,
        );
        res.json(configs);
      } catch (error) {
        console.error("❌ Error fetching printer configs:", error);
        res.status(500).json({
          error: "Failed to fetch printer configs",
        });
      }
    },
  );

  app.post("/api/printer-configs", async (req: TenantRequest, res) => {
    try {
      const tenantDb = await getTenantDatabase(req);
      const configData = req.body;

      console.log("Creating printer config with data:", configData);

      const config = await storage.createPrinterConfig(configData, tenantDb);
      res.status(201).json(config);
    } catch (error) {
      console.error("Error creating printer config:", error);
      res.status(500).json({
        error: "Failed to create printer config",
      });
    }
  });

  app.put("/api/printer-configs/:id", async (req: TenantRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const tenantDb = await getTenantDatabase(req);
      const configData = req.body;

      console.log(`Updating printer config ${id} with data:`, configData);

      const config = await storage.updatePrinterConfig(
        id,
        configData,
        tenantDb,
      );

      if (!config) {
        return res.status(404).json({
          error: "Printer config not found",
        });
      }

      res.json(config);
    } catch (error) {
      console.error("Error updating printer config:", error);
      res.status(500).json({
        error: "Failed to update printer config",
      });
    }
  });

  app.delete("/api/printer-configs/:id", async (req: TenantRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const tenantDb = await getTenantDatabase(req);

      console.log(`Deleting printer config ${id}`);

      const deleted = await storage.deletePrinterConfig(id, tenantDb);

      if (!deleted) {
        return res.status(404).json({
          error: "Printer config not found",
        });
      }

      res.json({
        message: "Printer config deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting printer config:", error);
      res.status(500).json({
        error: "Failed to delete printer config",
      });
    }
  });

  app.post("/api/printer-configs/:id/test", async (req: TenantRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const tenantDb = await getTenantDatabase(req);

      // Get printer config
      const configs = await storage.getPrinterConfigs(tenantDb);
      const config = configs.find((c) => c.id === id);

      if (!config) {
        return res.status(404).json({
          success: false,
          message: "Printer config not found",
        });
      }

      // Test connection based on connection type
      let testResult = { success: false, message: "Unknown connection type" };

      if (config.connectionType === "network" && config.ipAddress) {
        // Test network connection
        const net = require("net");

        const testPromise = new Promise((resolve) => {
          const client = new net.Socket();
          client.setTimeout(3000);

          client.connect(config.port || 9100, config.ipAddress, () => {
            // Send test print command
            const testData = Buffer.from(
              "\x1B@Test Print from EDPOS\n\n\n\x1DV\x41\x00",
              "utf8",
            );

            client.write(testData, (error) => {
              if (error) {
                resolve({
                  success: false,
                  message: `Failed to send test data: ${error.message}`,
                });
              } else {
                client.end();
                resolve({
                  success: true,
                  message: `Successfully connected to ${config.name}`,
                });
              }
            });
          });

          client.on("error", (err) => {
            resolve({
              success: false,
              message: `Connection failed: ${err.message}`,
            });
          });

          client.on("timeout", () => {
            client.destroy();
            resolve({ success: false, message: "Connection timeout" });
          });
        });

        // @ts-ignore
        testResult = await testPromise;
      } else if (config.connectionType === "usb") {
        // For USB printers, we can't directly test but we can check if the config is valid
        testResult = {
          success: true,
          message: "USB printer detection not implemented",
        };
      } else {
        testResult = {
          success: false,
          message: "Invalid printer configuration",
        };
      }

      res.json(testResult);
    } catch (error) {
      console.error("Error testing printer connection:", error);
      res.status(500).json({
        success: false,
        message: "Failed to test printer connection",
      });
    }
  });

  // Customer Reports APIs
  app.get("/api/customer-debts", async (req: TenantRequest, res) => {
    try {
      const { startDate, endDate, customerId } = req.query;
      const tenantDb = await getTenantDatabase(req);

      // Get customer debts from database
      const customerDebts = await db
        .select({
          id: customers.id,
          customerCode: customers.customerId,
          customerName: customers.name,
          initialDebt: sql<number>`0`, // Mock initial debt
          newDebt: sql<number>`COALESCE(${customers.totalSpent}, 0) * 0.1`, // 10% of total spent as debt
          payment: sql<number>`COALESCE(${customers.totalSpent}, 0) * 0.05`, // 5% as payment
          finalDebt: sql<number>`COALESCE(${customers.totalSpent}, 0) * 0.05`, // Final debt
          phone: customers.phone,
        })
        .from(customers)
        .where(eq(customers.status, "active"));

      // Filter by customer if specified
      let filteredDebts = customerDebts;
      if (customerId) {
        filteredDebts = customerDebts.filter(
          (debt) => debt.id === parseInt(customerId as string),
        );
      }

      res.json(filteredDebts);
    } catch (error) {
      res.status(500).json({
        message: "Failed to fetch customer debts",
      });
    }
  });

  app.get("/api/customer-sales", async (req: TenantRequest, res) => {
    try {
      const { startDate, endDate, customerId } = req.query;
      const tenantDb = await getTenantDatabase(req);

      // Get customer sales data from database
      const customerSales = await db
        .select({
          id: customers.id,
          customerCode: customers.customerId,
          customerName: customers.name,
          totalSales: customers.totalSpent,
          visitCount: customers.visitCount,
          averageOrder: sql<number>`CASE WHEN ${customers.visitCount} > 0 THEN ${customers.totalSpent} / ${customers.visitCount} ELSE 0 END`,
          phone: customers.phone,
        })
        .from(customers)
        .where(eq(customers.status, "active"));

      // Filter by customer if specified
      let filteredSales = customerSales;
      if (customerId) {
        filteredSales = customerSales.filter(
          (sale) => sale.id === parseInt(customerId as string),
        );
      }

      res.json(filteredSales);
    } catch (error) {
      res.status(500).json({
        message: "Failed to fetch customer sales",
      });
    }
  });

  // Bulk create products
  app.post("/api/products/bulk", async (req: TenantRequest, res) => {
    try {
      const { products: productList } = req.body;
      const tenantDb = await getTenantDatabase(req);

      if (!productList || !Array.isArray(productList)) {
        return res.status(400).json({
          error: "Invalid products data",
        });
      }

      const results = [];
      let successCount = 0;
      let errorCount = 0;

      for (const productData of productList) {
        try {
          console.log(`Processing product: ${JSON.stringify(productData)}`);

          // Validate required fields with detailed messages
          const missingFields = [];
          if (!productData.name) missingFields.push("name");
          if (!productData.sku) missingFields.push("sku");
          if (!productData.price) missingFields.push("price");
          if (
            productData.categoryId === undefined ||
            productData.categoryId === null
          )
            missingFields.push("categoryId");

          if (missingFields.length > 0) {
            throw new Error(
              `Missing required fields: ${missingFields.join(", ")}`,
            );
          }

          // Validate data types
          if (isNaN(parseFloat(productData.price))) {
            throw new Error(`Invalid price: ${productData.price}`);
          }

          if (isNaN(parseInt(productData.categoryId))) {
            throw new Error(`Invalid categoryId: ${productData.categoryId}`);
          }

          const [product] = await db
            .insert(products)
            // @ts-ignore
            .values({
              name: productData.name,
              sku: productData.sku,
              price: productData.price.toString(),
              stock: parseInt(productData.stock) || 0,
              categoryId: parseInt(productData.categoryId),
              imageUrl: productData.imageUrl || null,
              taxRate: productData.taxRate
                ? productData.taxRate.toString()
                : "0.00",
            })
            .returning();

          console.log(`Successfully created product: ${product.name}`);
          results.push({
            success: true,
            product,
          });
          successCount++;
        } catch (error) {
          const errorMessage = error.message || "Unknown error";
          console.error(
            `Error creating product ${productData.name || "Unknown"}:`,
            errorMessage,
          );
          console.error("Product data:", JSON.stringify(productData, null, 2));

          results.push({
            success: false,
            error: errorMessage,
            data: productData,
            productName: productData.name || "Unknown",
          });
          errorCount++;
        }
      }

      res.json({
        success: successCount,
        errors: errorCount,
        results,
        message: `${successCount} sản phẩm đã được tạo thành công${errorCount > 0 ? `, ${errorCount} sản phẩm lỗi` : ""}`,
      });
    } catch (error) {
      console.error("Bulk products creation error:", error);
      res.status(500).json({
        error: "Failed to create products",
      });
    }
  });

  // Employee routes
  app.get(
    "/api/employees",
    tenantMiddleware,
    async (req: TenantRequest, res) => {
      try {
        console.log("🔍 GET /api/employees - Starting request processing");
        let tenantDb;
        try {
          tenantDb = await getTenantDatabase(req);
          console.log("✅ Tenant database connection obtained for employees");
        } catch (dbError) {
          console.error(
            "❌ Failed to get tenant database for employees:",
            dbError,
          );
          tenantDb = null;
        }

        const employees = await storage.getEmployees(tenantDb);
        console.log(`✅ Successfully fetched ${employees.length} employees`);
        res.json(employees);
      } catch (error) {
        console.error("❌ Error fetching employees:", error);
        res.status(500).json({
          message: "Failed to fetch employees",
        });
      }
    },
  );

  // Employee sales report data
  app.get("/api/employee-sales", async (req: TenantRequest, res) => {
    try {
      const { startDate, endDate, employeeId } = req.query;
      const tenantDb = await getTenantDatabase(req);

      let query = db
        .select({
          employeeName: transactionsTable.cashierName,
          total: transactionsTable.total,
          createdAt: transactionsTable.createdAt,
        })
        .from(transactionsTable);

      if (startDate && endDate) {
        // @ts-ignore
        query = query.where(
          and(
            // @ts-ignore
            gte(transactionsTable.createdAt, startDate as string),
            // @ts-ignore
            lte(transactionsTable.createdAt, endDate as string),
          ),
        );
      }

      if (employeeId && employeeId !== "all") {
        // @ts-ignore
        query = query.where(
          eq(transactionsTable.cashierName, employeeId as string),
        );
      }

      const salesData = await query;
      res.json(salesData);
    } catch (error) {
      console.error("Error fetching employee sales:", error);
      res.status(500).json({
        message: "Failed to fetch employee sales data",
      });
    }
  });

  // Server time endpoint for consistent timestamps
  app.get("/api/server-time", async (req: TenantRequest, res) => {
    try {
      const serverTime = {
        timestamp: new Date().toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        localTime: new Date().toLocaleString("vi-VN", {
          timeZone: "Asia/Ho_Chi_Minh",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      };
      res.json(serverTime);
    } catch (error) {
      res.status(500).json({
        error: "Failed to get server time",
      });
    }
  });

  // Product Analysis API - using orders and order_items data
  app.get("/api/product-analysis", async (req: TenantRequest, res) => {
    try {
      const { startDate, endDate, categoryId, productType, productSearch } =
        req.query;
      const tenantDb = await getTenantDatabase(req);

      console.log("Product Analysis API called with params:", {
        startDate,
        endDate,
        categoryId,
        productType,
        productSearch,
      });

      // Build date conditions
      const dateConditions = [];
      if (startDate && endDate) {
        const startDateTime = new Date(startDate as string);
        const endDateTime = new Date(endDate as string);
        endDateTime.setHours(23, 59, 59, 999);
        dateConditions.push(
          gte(orders.orderedAt, startDateTime),
          lte(orders.orderedAt, endDateTime),
        );
      }

      // Build category conditions for products
      const categoryConditions = [];
      if (categoryId && categoryId !== "all") {
        categoryConditions.push(
          eq(products.categoryId, parseInt(categoryId as string)),
        );
      }

      // Build product type conditions
      const typeConditions = [];
      if (productType && productType !== "all") {
        const typeMap = {
          combo: 3,
          product: 1,
          service: 2,
        };
        const typeValue = typeMap[productType as keyof typeof typeMap];
        if (typeValue) {
          typeConditions.push(eq(products.productType, typeValue));
        }
      }

      // Build search conditions
      const searchConditions = [];
      if (productSearch && productSearch !== "" && productSearch !== "all") {
        const searchTerm = `%${productSearch}%`;
        searchConditions.push(
          or(ilike(products.name, searchTerm), ilike(products.sku, searchTerm)),
        );
      }

      // Query order items with product details from completed/paid orders
      const productSalesData = await db
        .select({
          productId: orderItemsTable.productId,
          productName: products.name,
          productSku: products.sku,
          categoryId: products.categoryId,
          categoryName: categories.name,
          unitPrice: orderItemsTable.unitPrice, // This is the pre-tax price
          quantity: orderItemsTable.quantity,
          total: orderItemsTable.total, // This should also be pre-tax total
          orderId: orderItemsTable.orderId,
          orderDate: orders.orderedAt,
          discount: orderItemsTable.discount,
          orderStatus: orders.status,
        })
        .from(orderItemsTable)
        .innerJoin(orders, eq(orderItemsTable.orderId, orders.id))
        .innerJoin(products, eq(orderItemsTable.productId, products.id))
        .leftJoin(categories, eq(products.categoryId, categories.id))
        .where(
          and(
            or(eq(orders.status, "paid"), eq(orders.status, "completed")),
            ...dateConditions,
            ...categoryConditions,
            ...typeConditions,
            ...searchConditions,
          ),
        )
        .orderBy(desc(orders.orderedAt));

      console.log(`Found ${productSalesData.length} product sales records`);

      // Group and aggregate data by product
      const productMap = new Map();

      productSalesData.forEach((item) => {
        const productId = item.productId;
        const quantity = Number(item.quantity || 0);
        const revenue = Number(item.unitPrice || 0) * quantity;
        const discount = Number(item.discount || 0);

        if (productMap.has(productId)) {
          const existing = productMap.get(productId);
          existing.totalQuantity += quantity;
          existing.totalRevenue += revenue;
          existing.discount += discount;
          existing.orderCount += 1;
        } else {
          productMap.set(productId, {
            productId: item.productId,
            productName: item.productName,
            productSku: item.productSku,
            categoryId: item.categoryId,
            categoryName: item.categoryName,
            // @ts-ignore
            productType: item.productType,
            unitPrice: item.unitPrice, // This is the pre-tax price
            quantity: item.quantity,
            total: item.total, // This should also be pre-tax total
            discount: item.discount,
            totalQuantity: quantity,
            totalRevenue: revenue,
            totalDiscount: discount,
            averagePrice: Number(item.unitPrice || 0),
            orderCount: 1,
          });
        }
      });

      // Convert to array and calculate final metrics
      const productStats = Array.from(productMap.values()).map((product) => ({
        ...product,
        averageOrderValue:
          product.orderCount > 0
            ? product.totalRevenue / product.orderCount
            : 0,
      }));

      // Calculate totals
      const totalRevenue = productStats.reduce(
        (sum, p) => sum + p.totalRevenue,
        0,
      );
      const totalQuantity = productStats.reduce(
        (sum, p) => sum + p.totalQuantity,
        0,
      );
      const totalDiscount = productStats.reduce(
        (sum, p) => sum + p.totalDiscount,
        0,
      );
      const totalProducts = productStats.length;

      // Sort by revenue (descending)
      productStats.sort((a, b) => b.totalRevenue - a.totalRevenue);

      const result = {
        productStats,
        totalRevenue,
        totalQuantity,
        totalDiscount,
        totalProducts,
        summary: {
          topSellingProduct: productStats[0] || null,
          averageRevenuePerProduct:
            totalProducts > 0 ? totalRevenue / totalProducts : 0,
        },
      };

      console.log("Product Analysis Results:", {
        totalRevenue,
        totalQuantity,
        totalDiscount,
        totalProducts,
        topProduct: result.summary.topSellingProduct?.productName,
      });

      res.json(result);
    } catch (error) {
      console.error("Product analysis error:", error);
      res.status(500).json({
        error: "Failed to fetch product analysis",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // // Enhanced API endpoints for sales chart report - using same data source as dashboard
  app.get(
    "/api/dashboard-data/:startDate/:endDate",
    async (req: TenantRequest, res) => {
      try {
        const { startDate, endDate } = req.params;
        const tenantDb = await getTenantDatabase(req);

        console.log("Dashboard data API called with params:", {
          startDate,
          endDate,
        });

        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        // Get orders, tables, transactions, invoices - EXACT same as dashboard
        const [orders, tables, transactions, invoices] = await Promise.all([
          storage.getOrders(undefined, undefined, tenantDb),
          storage.getTables(tenantDb),
          storage.getTransactions(tenantDb),
          storage.getInvoices(tenantDb),
        ]);

        // Filter completed orders within date range - EXACT same logic as dashboard
        const filteredCompletedOrders = Array.isArray(orders)
          ? orders.filter((order) => {
              try {
                if (!order) return false;

                // Try multiple date fields - prioritize orderedAt, then paidAt, then createdAt
                const orderDate = new Date(
                  order.orderedAt ||
                    order.paidAt ||
                    order.createdAt ||
                    order.created_at,
                );

                if (isNaN(orderDate.getTime())) {
                  return false;
                }

                const dateMatch = orderDate >= start && orderDate <= end;

                // Include more order statuses to show real data
                const isCompleted =
                  order.status === "paid" ||
                  order.status === "completed" ||
                  order.status === "served" ||
                  order.status === "confirmed";

                return dateMatch && isCompleted;
              } catch (error) {
                console.error("Error filtering order:", order, error);
                return false;
              }
            })
          : [];

        // Calculate dashboard stats - EXACT same logic
        const periodRevenue = filteredCompletedOrders.reduce((total, order) => {
          const orderTotal = Number(order.total || 0);
          return total + orderTotal;
        }, 0);

        const periodOrderCount = filteredCompletedOrders.length;

        // Customer count: count unique customers from completed orders
        const uniqueCustomers = new Set();
        filteredCompletedOrders.forEach((order) => {
          if (order.customerId) {
            uniqueCustomers.add(order.customerId);
          } else {
            uniqueCustomers.add(`order_${order.id}`);
          }
        });
        const periodCustomerCount = uniqueCustomers.size;

        // Daily average for the period
        const daysDiff = Math.max(
          1,
          Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) +
            1,
        );
        const dailyAverageRevenue = periodRevenue / daysDiff;

        // Active orders (pending/in-progress orders)
        const activeOrders = orders.filter(
          (order) =>
            order.status === "pending" || order.status === "in_progress",
        ).length;

        const occupiedTables = tables.filter(
          (table) => table.status === "occupied",
        );

        const monthRevenue = periodRevenue;
        const averageOrderValue =
          periodOrderCount > 0 ? periodRevenue / periodOrderCount : 0;

        // Peak hours analysis
        const hourlyOrders: {
          [key: number]: number;
        } = {};
        filteredCompletedOrders.forEach((order) => {
          const orderDate = new Date(
            order.orderedAt ||
              order.createdAt ||
              order.created_at ||
              order.paidAt,
          );
          if (!isNaN(orderDate.getTime())) {
            const hour = orderDate.getHours();
            hourlyOrders[hour] = (hourlyOrders[hour] || 0) + 1;
          }
        });

        const peakHour = Object.keys(hourlyOrders).reduce(
          (peak, hour) =>
            hourlyOrders[parseInt(hour)] > hourlyOrders[parseInt(peak)]
              ? hour
              : peak,
          "12",
        );

        const dashboardData = {
          periodRevenue,
          periodOrderCount,
          periodCustomerCount,
          dailyAverageRevenue,
          activeOrders,
          occupiedTables: occupiedTables.length,
          monthRevenue,
          averageOrderValue,
          peakHour: parseInt(peakHour),
          totalTables: tables.length,
          filteredCompletedOrders,
          orders: orders || [],
          tables: tables || [],
          transactions: transactions || [],
          invoices: invoices || [],
        };

        console.log("Dashboard data calculated:", {
          periodRevenue,
          periodOrderCount,
          periodCustomerCount,
          filteredOrdersCount: filteredCompletedOrders.length,
        });

        res.json(dashboardData);
      } catch (error) {
        console.error("Error in dashboard data API:", error);
        res.status(500).json({
          error: "Failed to fetch dashboard data",
        });
      }
    },
  );

  // Transactions API with enhanced filtering
  app.get(
    "/api/transactions/:startDate/:endDate/:salesMethod/:salesChannel/:analysisType/:concernType/:selectedEmployee",
    async (req: TenantRequest, res) => {
      try {
        const {
          startDate,
          endDate,
          salesMethod,
          salesChannel,
          analysisType,
          concernType,
          selectedEmployee,
        } = req.params;
        const tenantDb = await getTenantDatabase(req);

        console.log("Transactions API called with params:", {
          startDate,
          endDate,
          salesMethod,
          salesChannel,
          analysisType,
          concernType,
          selectedEmployee,
        });

        // Get transactions data
        const transactions = await storage.getTransactions(tenantDb);

        // Filter transactions based on parameters
        const filteredTransactions = transactions.filter((transaction) => {
          const transactionDate = new Date(transaction.createdAt);
          const start = new Date(startDate);
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);

          const dateMatch = transactionDate >= start && transactionDate <= end;

          // Enhanced sales method filtering
          let salesMethodMatch = true;
          if (salesMethod !== "all") {
            const paymentMethod = transaction.paymentMethod || "cash";
            switch (salesMethod) {
              case "no_delivery":
                salesMethodMatch =
                // @ts-ignore
                  !transaction.deliveryMethod ||
                  // @ts-ignore
                  transaction.deliveryMethod === "pickup" ||
                  // @ts-ignore
                  transaction.deliveryMethod === "takeaway";
                break;
              case "delivery":
                // @ts-ignore
                salesMethodMatch = transaction.deliveryMethod === "delivery";
                break;
              default:
                salesMethodMatch =
                  paymentMethod.toLowerCase() === salesMethod.toLowerCase();
            }
          }

          // Enhanced sales channel filtering
          let salesChannelMatch = true;
          if (salesChannel !== "all") {
            // @ts-ignore
            const channel = transaction.salesChannel || "direct";
            switch (salesChannel) {
              case "direct":
                salesChannelMatch =
                // @ts-ignore
                  !transaction.salesChannel ||
                  // @ts-ignore
                  transaction.salesChannel === "direct" ||
                  // @ts-ignore
                  transaction.salesChannel === "pos";
                break;
              case "other":
                salesChannelMatch =
                // @ts-ignore
                  transaction.salesChannel &&
                  // @ts-ignore
                  transaction.salesChannel !== "direct" &&
                  // @ts-ignore
                  transaction.salesChannel !== "pos";
                break;
              default:
                salesChannelMatch =
                  channel.toLowerCase() === salesChannel.toLowerCase();
            }
          }

          // Enhanced employee filtering
          let employeeMatch = true;
          if (selectedEmployee !== "all") {
            employeeMatch =
            // @ts-ignore
              transaction.cashierName === selectedEmployee ||
              // @ts-ignore
              (transaction.cashierName &&
                // @ts-ignore
                transaction.cashierName
                  .toLowerCase()
                  .includes(selectedEmployee.toLowerCase()));
          }

          return (
            dateMatch && salesMethodMatch && salesChannelMatch && employeeMatch
          );
        });

        console.log(
          `Found ${filteredTransactions.length} filtered transactions out of ${transactions.length} total`,
        );
        res.json(filteredTransactions);
      } catch (error) {
        console.error("Error in transactions API:", error);
        res.status(500).json({
          error: "Failed to fetch transactions data",
        });
      }
    },
  );

  app.get(
    "/api/orders/:startDate/:endDate/:selectedEmployee/:salesChannel/:salesMethod/:analysisType/:concernType",
    async (req: TenantRequest, res) => {
      try {
        const {
          startDate,
          endDate,
          selectedEmployee,
          salesChannel,
          salesMethod,
          analysisType,
          concernType,
        } = req.params;
        const tenantDb = await getTenantDatabase(req);

        console.log("Orders API called with params:", {
          startDate,
          endDate,
          selectedEmployee,
          salesChannel,
          salesMethod,
          analysisType,
          concernType,
        });

        // Get orders data
        const orders = await storage.getOrders(undefined, undefined, tenantDb);

        // Filter orders based on parameters with enhanced logic
        const filteredOrders = orders.filter((order) => {
          const orderDate = new Date(order.orderedAt || order.createdAt);
          const start = new Date(startDate);
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);

          const dateMatch = orderDate >= start && orderDate <= end;

          // Enhanced employee filtering
          let employeeMatch = true;
          if (selectedEmployee !== "all") {
            employeeMatch =
              order.employeeId?.toString() === selectedEmployee ||
              (order.employeeName &&
                order.employeeName
                  .toLowerCase()
                  .includes(selectedEmployee.toLowerCase()));
          }

          // Enhanced sales channel filtering
          let salesChannelMatch = true;
          if (salesChannel !== "all") {
            const channel = order.salesChannel || "direct";
            switch (salesChannel) {
              case "direct":
                salesChannelMatch =
                  !order.salesChannel ||
                  order.salesChannel === "direct" ||
                  order.salesChannel === "pos";
                break;
              case "other":
                salesChannelMatch =
                  order.salesChannel &&
                  order.salesChannel !== "direct" &&
                  order.salesChannel !== "pos";
                break;
              default:
                salesChannelMatch =
                  channel.toLowerCase() === salesChannel.toLowerCase();
            }
          }

          // Enhanced sales method filtering
          let salesMethodMatch = true;
          if (salesMethod !== "all") {
            switch (salesMethod) {
              case "no_delivery":
                salesMethodMatch =
                  !order.deliveryMethod ||
                  order.deliveryMethod === "pickup" ||
                  order.deliveryMethod === "takeaway";
                break;
              case "delivery":
                salesMethodMatch = order.deliveryMethod === "delivery";
                break;
              default:
                const paymentMethod = order.paymentMethod || "cash";
                salesMethodMatch =
                  paymentMethod.toLowerCase() === salesMethod.toLowerCase();
            }
          }

          // Only include paid orders for analysis
          const statusMatch = order.status === "paid";

          return (
            dateMatch &&
            employeeMatch &&
            salesChannelMatch &&
            salesMethodMatch &&
            statusMatch
          );
        });

        console.log(
          `Found ${filteredOrders.length} filtered orders out of ${orders.length} total`,
        );
        res.json(filteredOrders);
      } catch (error) {
        console.error("Error in orders API:", error);
        res.status(500).json({
          error: "Failed to fetch orders data",
        });
      }
    },
  );

  app.get(
    "/api/products/:selectedCategory/:productType/:productSearch?",
    async (req: TenantRequest, res) => {
      try {
        const { selectedCategory, productType, productSearch } = req.params;
        const tenantDb = await getTenantDatabase(req);

        console.log("Products API called with params:", {
          selectedCategory,
          productType,
          productSearch,
        });

        let products;

        // Get products by category or all products
        if (
          selectedCategory &&
          selectedCategory !== "all" &&
          selectedCategory !== "undefined"
        ) {
          const categoryId = parseInt(selectedCategory);
          if (!isNaN(categoryId)) {
            products = await storage.getProductsByCategory(
              categoryId,
              true,
              tenantDb,
            );
          } else {
            products = await storage.getAllProducts(true, tenantDb);
          }
        } else {
          products = await storage.getAllProducts(true, tenantDb);
        }

        // Filter by product type if specified
        if (
          productType &&
          productType !== "all" &&
          productType !== "undefined"
        ) {
          const typeMap = {
            combo: 3,
            "combo-dongoi": 3,
            product: 1,
            "hang-hoa": 1,
            service: 2,
            "dich-vu": 2,
          };
          const typeValue =
            typeMap[productType.toLowerCase() as keyof typeof typeMap];
          if (typeValue) {
            products = products.filter(
              (product) => product.productType === typeValue,
            );
          }
        }

        // Filter by product search if provided
        if (
          productSearch &&
          productSearch !== "" &&
          productSearch !== "undefined" &&
          productSearch !== "all"
        ) {
          const searchTerm = productSearch.toLowerCase();
          products = products.filter(
            (product) =>
              product.name?.toLowerCase().includes(searchTerm) ||
              product.sku?.toLowerCase().includes(searchTerm) ||
              product.description?.toLowerCase().includes(searchTerm),
          );
        }

        console.log(`Found ${products.length} products after filtering`);
        res.json(products);
      } catch (error) {
        console.error("Error in products API:", error);
        res.status(500).json({
          error: "Failed to fetch products data",
        });
      }
    },
  );

  app.get(
    "/api/customers/:customerSearch?/:customerStatus?",
    async (req: TenantRequest, res) => {
      try {
        const { customerSearch, customerStatus } = req.params;
        const tenantDb = await getTenantDatabase(req);

        console.log(
          "Customers API called with search:",
          customerSearch,
          "status:",
          customerStatus,
        );

        let customers = await storage.getCustomers(tenantDb);

        // Filter by search if provided
        if (
          customerSearch &&
          customerSearch !== "" &&
          customerSearch !== "undefined" &&
          customerSearch !== "all"
        ) {
          const searchTerm = customerSearch.toLowerCase();
          customers = customers.filter(
            (customer) =>
              customer.name?.toLowerCase().includes(searchTerm) ||
              customer.phone?.includes(customerSearch) ||
              customer.email?.toLowerCase().includes(searchTerm) ||
              customer.customerId?.toLowerCase().includes(searchTerm) ||
              customer.address?.toLowerCase().includes(searchTerm),
          );
        }

        // Filter by status if provided
        if (
          customerStatus &&
          customerStatus !== "all" &&
          customerStatus !== "undefined"
        ) {
          const now = new Date();
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

          customers = customers.filter((customer) => {
            const totalSpent = Number(customer.totalSpent || 0);
            // @ts-ignore
            const lastVisit = customer.lastVisit
            // @ts-ignore
              ? new Date(customer.lastVisit)
              : null;

            switch (customerStatus) {
              case "active":
                return lastVisit && lastVisit >= thirtyDaysAgo;
              case "inactive":
                return !lastVisit || lastVisit < thirtyDaysAgo;
              case "vip":
                return totalSpent >= 500000; // VIP customers with total spent >= 500k VND
              case "new":
                const joinDate = customer.createdAt
                  ? new Date(customer.createdAt)
                  : null;
                return joinDate && joinDate >= thirtyDaysAgo;
              default:
                return true;
            }
          });
        }

        console.log(`Found ${customers.length} customers after filtering`);
        res.json(customers);
      } catch (error) {
        console.error("Error in customers API:", error);
        res.status(500).json({
          error: "Failed to fetch customers data",
        });
      }
    },
  );

  // Tax code lookup proxy endpoint
  app.post("/api/tax-code-lookup", async (req: TenantRequest, res) => {
    try {
      const { taxCode } = req.body;
      const tenantDb = await getTenantDatabase(req);

      if (!taxCode) {
        return res.status(400).json({
          success: false,
          message: "Mã số thuế không được để trống",
        });
      }

      // Call the external tax code API
      const response = await fetch(
        "https://infoerpvn.com:9440/api/CheckListTaxCode/v2",
        {
          method: "POST",
          headers: {
            token: "EnURbbnPhUm4GjNgE4Ogrw==",
            "Content-Type": "application/json",
          },
          body: JSON.stringify([taxCode]),
        },
      );

      if (!response.ok) {
        throw new Error(
          `External API error: ${response.status} ${response.statusText}`,
        );
      }

      const result = await response.json();

      res.json({
        success: true,
        data: result,
        message: "Tra cứu thành công",
      });
    } catch (error) {
      console.error("Tax code lookup error:", error);
      res.status(500).json({
        success: false,
        message: "Có lỗi xảy ra khi tra cứu mã số thuế",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // E-invoice publish proxy endpoint
  app.post("/api/einvoice/publish", async (req: TenantRequest, res) => {
    try {
      const publishRequest = req.body;
      const tenantDb = await getTenantDatabase(req);
      console.log(
        "Publishing invoice with data:",
        JSON.stringify(publishRequest, null, 2),
      );

      // Call the real e-invoice API
      const response = await fetch(
        "https://infoerpvn.com:9440/api/invoice/publish",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            token: "EnURbbnPhUm4GjNgE4Ogrw==",
          },
          body: JSON.stringify(publishRequest),
        },
      );

      if (!response.ok) {
        console.error(
          "E-invoice API error:",
          response.status,
          response.statusText,
        );
        const errorText = await response.text();
        console.error("Error response:", errorText);

        return res.status(response.status).json({
          error: "Failed to publish invoice",
          details: `API returned ${response.status}: ${response.statusText}`,
          apiResponse: errorText,
        });
      }

      const result: any = await response.json();
      console.log("E-invoice API response:", result);

      // Check if the API returned success
      if (result.status === true) {
        console.log("Invoice published successfully:", result);

        // Return standardized response format
        res.json({
          success: true,
          message:
            result.message || "Hóa đơn điện tử đã được phát hành thành công",
          data: {
            invoiceNo: result.data?.invoiceNo,
            invDate: result.data?.invDate,
            transactionID: result.data?.transactionID,
            macqt: result.data?.macqt,
            originalRequest: {
              transactionID: publishRequest.transactionID,
              invRef: publishRequest.invRef,
              totalAmount: publishRequest.invTotalAmount,
              customer: publishRequest.Customer,
            },
          },
        });
      } else {
        // API returned failure
        console.error("E-invoice API returned failure:", result);
        res.status(400).json({
          error: "E-invoice publication failed",
          message: result.message || "Unknown error from e-invoice service",
          details: result,
        });
      }
    } catch (error) {
      console.error("E-invoice publish proxy error details:");
      console.error("- Error type:", error?.constructor.name);
      console.error("- Error message:", error?.message);
      console.error("- Full error:", error);

      res.status(500).json({
        error: "Failed to publish invoice",
        details: error?.message,
        errorType: error?.constructor.name,
      });
    }
  });

  // Printer configuration management APIs
  app.get(
    "/api/printer-configs",
    tenantMiddleware,
    async (req: TenantRequest, res) => {
      try {
        const tenantDb = await getTenantDatabase(req);
        const configs = await storage.getPrinterConfigs(tenantDb);
        res.json(configs);
      } catch (error) {
        console.error("Error fetching printer configs:", error);
        res
          .status(500)
          .json({ error: "Failed to fetch printer configurations" });
      }
    },
  );

  app.post("/api/printer-configs", async (req: TenantRequest, res) => {
    try {
      const tenantDb = await getTenantDatabase(req);
      const configData = req.body;

      // Validate required fields
      if (!configData.name || !configData.connectionType) {
        return res
          .status(400)
          .json({ error: "Name and connection type are required" });
      }

      const config = await storage.createPrinterConfig(configData, tenantDb);
      res.status(201).json(config);
    } catch (error) {
      console.error("Error creating printer config:", error);
      res.status(500).json({ error: "Failed to create printer configuration" });
    }
  });

  app.put("/api/printer-configs/:id", async (req: TenantRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const tenantDb = await getTenantDatabase(req);
      const configData = req.body;

      const config = await storage.updatePrinterConfig(
        id,
        configData,
        tenantDb,
      );
      if (!config) {
        return res
          .status(404)
          .json({ error: "Printer configuration not found" });
      }

      res.json(config);
    } catch (error) {
      console.error("Error updating printer config:", error);
      res.status(500).json({ error: "Failed to update printer configuration" });
    }
  });

  app.delete("/api/printer-configs/:id", async (req: TenantRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const tenantDb = await getTenantDatabase(req);

      const deleted = await storage.deletePrinterConfig(id, tenantDb);
      if (!deleted) {
        return res
          .status(404)
          .json({ error: "Printer configuration not found" });
      }

      res.json({ message: "Printer configuration deleted successfully" });
    } catch (error) {
      console.error("Error deleting printer config:", error);
      res.status(500).json({ error: "Failed to delete printer configuration" });
    }
  });

  // Test printer connection
  app.post("/api/printer-configs/:id/test", async (req: TenantRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const tenantDb = await getTenantDatabase(req);

      const [config] = await db
        .select()
        .from(printerConfigs)
        .where(eq(printerConfigs.id, id));
      if (!config) {
        return res
          .status(404)
          .json({ error: "Printer configuration not found" });
      }

      // Test connection based on printer type
      let testResult = { success: false, message: "" };

      if (config.connectionType === "network" && config.ipAddress) {
        // Test network printer connection
        try {
          const net = require("net");
          const socket = new net.Socket();

          socket.setTimeout(3000);

          await new Promise((resolve) => {
            socket.connect(config.port || 9100, config.ipAddress, () => {
              // Send test print command
              const testData = Buffer.from(
                "\x1B@Test Print from EDPOS\n\n\n\x1DV\x41\x00",
                "utf8",
              );

              socket.write(testData, (error) => {
                if (error) {
                  resolve({
                    success: false,
                    message: `Failed to send test data: ${error.message}`,
                  });
                } else {
                  socket.destroy();
                  resolve({
                    success: true,
                    message: `Successfully connected to ${config.name}`,
                  });
                }
              });
            });

            socket.on("error", (err) => {
              resolve({
                success: false,
                message: `Connection failed: ${err.message}`,
              });
            });

            socket.on("timeout", () => {
              socket.destroy();
              resolve({ success: false, message: "Connection timeout" });
            });
          });
        } catch (error) {
          testResult = {
            success: false,
            message: `Network test failed: ${error.message}`,
          };
        }
      } else if (config.connectionType === "usb") {
        // For USB printers, we can't directly test but we can check if the config is valid
        testResult = {
          success: true,
          message: "USB printer detection not implemented",
        };
      } else {
        testResult = {
          success: false,
          message: "Invalid printer configuration",
        };
      }

      res.json(testResult);
    } catch (error) {
      console.error("Error testing printer connection:", error);
      res.status(500).json({
        success: false,
        message: "Failed to test printer connection",
      });
    }
  });

  // POS Print Receipt API with real printer integration
  app.post("/api/pos/print-receipt", async (req, res) => {
    try {
      const { content, type, timestamp, orderId, transactionId, printerId } =
        req.body;

      console.log("🖨️ POS Print Receipt API called:", {
        type,
        timestamp,
        orderId,
        transactionId,
        printerId,
        contentLength: content?.length || 0,
        userAgent: req.headers["user-agent"]?.substring(0, 100),
      });

      // Validate input
      if (!content || !transactionId) {
        return res.status(400).json({
          error: "Missing required fields",
          message: "Content and transactionId are required",
          success: false,
        });
      }

      const tenantDb = await getTenantDatabase(req);

      // Get available printers
      const printers = await storage.getPrinterConfigs(tenantDb);

      if (printers.length === 0) {
        console.log("⚠️ No printers configured");
        return res.status(404).json({
          success: false,
          message:
            "No printers configured. Please add printer configuration first.",
          error: "NO_PRINTERS_CONFIGURED",
        });
      }

      // Select printer (use specified printerId or primary printer)
      let selectedPrinter = null;
      if (printerId) {
        selectedPrinter = printers.find((p) => p.id === printerId);
      } else {
        selectedPrinter = printers.find((p) => p.isPrimary) || printers[0];
      }

      if (!selectedPrinter) {
        return res.status(404).json({
          success: false,
          message: "Selected printer not found",
          error: "PRINTER_NOT_FOUND",
        });
      }

      console.log("🖨️ Using printer:", {
        id: selectedPrinter.id,
        name: selectedPrinter.name,
        type: selectedPrinter.printerType,
        connection: selectedPrinter.connectionType,
      });

      // Process print job based on connection type
      let printResult = {
        success: false,
        message: "",
        printerId: selectedPrinter.id,
      };

      if (
        selectedPrinter.connectionType === "network" &&
        selectedPrinter.ipAddress
      ) {
        // Network printer
        try {
          console.log(
            `🌐 Printing to network printer: ${selectedPrinter.ipAddress}:${selectedPrinter.port}`,
          );

          // Convert HTML content to ESC/POS commands
          const escPosData = convertToEscPos(content, selectedPrinter);

          // Send to network printer
          const net = require("net");
          const socket = new net.Socket();

          await new Promise((resolve, reject) => {
            socket.connect(
              selectedPrinter.port || 9100,
              selectedPrinter.ipAddress,
              () => {
                socket.write(escPosData);
                socket.end();

                printResult = {
                  success: true,
                  message: `Printed successfully to ${selectedPrinter.name}`,
                  printerId: selectedPrinter.id,
                };

                console.log("✅ Network print successful");
                resolve(true);
              },
            );

            socket.on("error", (err) => {
              printResult = {
                success: false,
                message: `Network printer error: ${err.message}`,
                printerId: selectedPrinter.id,
              };
              reject(err);
            });

            socket.setTimeout(5000, () => {
              printResult = {
                success: false,
                message: "Network printer timeout",
                printerId: selectedPrinter.id,
              };
              socket.destroy();
              reject(new Error("timeout"));
            });
          });
        } catch (error) {
          console.error("❌ Network printer error:", error);
          printResult = {
            success: false,
            message: `Network printer error: ${error.message}`,
            printerId: selectedPrinter.id,
          };
        }
      } else if (selectedPrinter.connectionType === "usb") {
        // USB printer
        try {
          console.log("🔌 Printing to USB printer...");

          // For USB printers, we would typically use node modules like 'node-printer' or 'electron-pos-printer'
          // Since we're in a web environment, we'll simulate the process

          // Convert HTML to ESC/POS
          const escPosData = convertToEscPos(content, selectedPrinter);

          // In a real implementation, you would:
          // const printer = require('node-printer');
          // printer.printDirect({
          //   data: escPosData,
          //   printer: selectedPrinter.name,
          //   type: 'RAW',
          //   success: function(jobID) { console.log("Printed with job ID: " + jobID); },
          //   error: function(err) { console.log(err); }
          // });

          // For now, simulate successful USB printing
          printResult = {
            success: true,
            message: `Print job sent to USB printer: ${selectedPrinter.name}`,
            printerId: selectedPrinter.id,
          };

          console.log("✅ USB print job queued");
        } catch (error) {
          console.error("❌ USB printer error:", error);
          printResult = {
            success: false,
            message: `USB printer error: ${error.message}`,
            printerId: selectedPrinter.id,
          };
        }
      } else {
        printResult = {
          success: false,
          message: "Unsupported printer connection type",
          printerId: selectedPrinter.id,
        };
      }

      // Return result
      res.json({
        ...printResult,
        timestamp: new Date().toISOString(),
        orderId,
        transactionId,
        printerInfo: {
          name: selectedPrinter.name,
          type: selectedPrinter.printerType,
          connection: selectedPrinter.connectionType,
        },
      });
    } catch (error) {
      console.error("❌ Print receipt error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to process print request",
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Helper function to convert HTML content to ESC/POS commands
  function convertToEscPos(htmlContent: string, printer: any): Buffer {
    // This is a simplified ESC/POS conversion
    // In a real implementation, you'd use libraries like 'escpos' or 'node-thermal-printer'

    const escPos = [];

    // Initialize printer
    escPos.push(0x1b, 0x40); // ESC @

    // Set character set to UTF-8
    escPos.push(0x1b, 0x74, 0x06);

    // Extract text content from HTML (simplified)
    const textContent = htmlContent
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
      .replace(/<[^>]*>/g, "\n")
      .replace(/\n\s*\n/g, "\n")
      .trim();

    // Convert text to bytes
    const textBytes: any = Buffer.from(textContent, "utf8");
    escPos.push(...textBytes);

    // Add some line feeds and cut paper
    escPos.push(0x0a, 0x0a, 0x0a); // Line feeds
    escPos.push(0x1d, 0x56, 0x42, 0x00); // Cut paper

    return Buffer.from(escPos);
  }

  // Test customer display connection
  app.post("/api/test-customer-display", async (req, res) => {
    try {
      const { testCart } = req.body;

      console.log(
        "🧪 Test customer display endpoint called with cart:",
        testCart,
      );

      // Simulate a cart update broadcast
      // @ts-ignore
      if (wss) {
        const testMessage = JSON.stringify({
          type: "cart_update",
          cart: testCart || [
            {
              id: "test-1",
              product: {
                name: "Test Product",
                price: "50000",
              },
              quantity: 2,
              price: "50000",
              total: "100000",
            },
          ],
          subtotal: 100000,
          tax: 10000,
          total: 110000,
          timestamp: new Date().toISOString(),
        });

        let clientCount = 0;
        // @ts-ignore
        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(testMessage);
            clientCount++;
          }
        });

        console.log(`🧪 Test message sent to ${clientCount} WebSocket clients`);

        res.json({
          success: true,
          message: `Test cart update sent to ${clientCount} connected clients`,
          clientCount,
        });
      } else {
        res.status(500).json({
          success: false,
          message: "WebSocket server not available",
        });
      }
    } catch (error) {
      console.error("❌ Error in test customer display:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  // Database health check
  app.get("/api/health/db", async (req, res) => {
    try {
      // Test basic connection with simple query
      const result = await db.execute(sql`
        SELECT
          current_database() as database_name,
          current_user as user_name,
          version() as postgres_version,
          NOW() as server_time
      `);

      // @ts-ignore
      const dbInfo = result && result.length > 0 ? result[0] : {};

      res.json({
        status: "healthy",
        database: dbInfo.database_name,
        user: dbInfo.user_name,
        version: dbInfo.postgres_version,
        serverTime: dbInfo.server_time,
        connectionString: process.env.DATABASE_URL?.replace(
          /:[^:@]*@/,
          ":****@",
        ),
        usingExternalDb: !!process.env.EXTERNAL_DB_URL,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("Database health check failed:", error);

      res.status(500).json({
        status: "unhealthy",
        error: errorMessage,
        connectionString: process.env.DATABASE_URL?.replace(
          /:[^:@]*@/,
          ":****@",
        ),
        usingExternalDb: !!process.env.EXTERNAL_DB_URL,
        details: error,
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
