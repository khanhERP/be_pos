import {
  pgTable,
  text,
  serial,
  decimal,
  integer,
  timestamp,
  boolean,
  varchar,
  date,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { relations } from "drizzle-orm";
import { z } from "zod";
import { InferSelectModel, InferInsertModel } from "drizzle-orm";

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  icon: text("icon").notNull(),
});

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  sku: text("sku").notNull().unique(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  stock: integer("stock").notNull().default(0),
  categoryId: integer("category_id")
    .references(() => categories.id)
    .notNull(),
  imageUrl: text("image_url"),
  isActive: boolean("is_active").notNull().default(true),
  productType: integer("product_type").notNull().default(1),
  trackInventory: boolean("track_inventory").notNull().default(true),
  taxRate: decimal("tax_rate", { precision: 5, scale: 2 })
    .notNull()
    .default("0.00"),
  priceIncludesTax: boolean("price_includes_tax").notNull().default(false),
  afterTaxPrice: decimal("after_tax_price", { precision: 10, scale: 2 }),
});

export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  transactionId: text("transaction_id").notNull().unique(),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
  tax: decimal("tax", { precision: 10, scale: 2 }).notNull(),
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),
  paymentMethod: text("payment_method").notNull(),
  amountReceived: decimal("amount_received", { precision: 10, scale: 2 }),
  change: decimal("change", { precision: 10, scale: 2 }),
  cashierName: text("cashier_name").notNull(),
  notes: text("notes"),
  invoiceId: integer("invoice_id").references(() => invoices.id),
  invoiceNumber: varchar("invoice_number", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const transactionItems = pgTable("transaction_items", {
  id: serial("id").primaryKey(),
  transactionId: integer("transaction_id")
    .references(() => transactions.id)
    .notNull(),
  productId: integer("product_id")
    .references(() => products.id)
    .notNull(),
  productName: text("product_name").notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  quantity: integer("quantity").notNull(),
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),
});

export const employees = pgTable("employees", {
  id: serial("id").primaryKey(),
  employeeId: text("employee_id").notNull().unique(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  role: text("role").notNull(), // "manager", "cashier", "admin"
  isActive: boolean("is_active").notNull().default(true),
  hireDate: timestamp("hire_date").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const attendanceRecords = pgTable("attendance_records", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id")
    .references(() => employees.id)
    .notNull(),
  clockIn: timestamp("clock_in").notNull(),
  clockOut: timestamp("clock_out"),
  breakStart: timestamp("break_start"),
  breakEnd: timestamp("break_end"),
  totalHours: decimal("total_hours", { precision: 4, scale: 2 }),
  overtime: decimal("overtime", { precision: 4, scale: 2 }).default("0.00"),
  status: text("status").notNull().default("present"), // "present", "absent", "late", "half_day"
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const storeSettings = pgTable("store_settings", {
  id: serial("id").primaryKey(),
  storeName: text("store_name").notNull().default("EDPOS 레스토랑"),
  storeCode: text("store_code"),
  taxId: text("tax_id"),
  businessType: text("business_type").default("restaurant"),
  pinCode: text("pin_code"),
  address: text("address"),
  phone: text("phone"),
  email: text("email"),
  openTime: text("open_time").default("09:00"),
  closeTime: text("close_time").default("22:00"),
  goldThreshold: text("gold_threshold").default("300000"),
  vipThreshold: text("vip_threshold").default("1000000"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const suppliers = pgTable("suppliers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  contactPerson: text("contact_person"),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  taxId: text("tax_id"),
  bankAccount: text("bank_account"),
  paymentTerms: text("payment_terms").default("30일"), // "30일", "60일", "현금" 등
  status: text("status").notNull().default("active"), // "active", "inactive"
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const tables = pgTable("tables", {
  id: serial("id").primaryKey(),
  tableNumber: text("table_number").notNull().unique(),
  capacity: integer("capacity").notNull().default(4),
  status: text("status").notNull().default("available"), // "available", "occupied", "reserved", "maintenance"
  qrCode: text("qr_code"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  orderNumber: text("order_number").notNull().unique(),
  tableId: integer("table_id")
    .references(() => tables.id),
  employeeId: integer("employee_id").references(() => employees.id),
  status: text("status").notNull().default("pending"), // "pending", "confirmed", "preparing", "ready", "served", "paid", "cancelled"
  customerName: text("customer_name"),
  customerCount: integer("customer_count").default(1),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
  tax: decimal("tax", { precision: 10, scale: 2 }).notNull().default("0.00"),
  discount: decimal("discount", { precision: 10, scale: 2 }).notNull().default("0.00"),
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),
  paymentMethod: text("payment_method"), // "cash", "card", "mobile", "einvoice"
  paymentStatus: text("payment_status").notNull().default("pending"), // "pending", "paid", "refunded"
  einvoiceStatus: integer("einvoice_status").notNull().default(0), // 0=Chưa phát hành, 1=Đã phát hành, 2=Tạo nháp, 3=Đã duyệt, 4=Đã bị thay thế (hủy), 5=Thay thế tạm, 6=Thay thế, 7=Đã bị điều chỉnh, 8=Điều chỉnh tạm, 9=Điều chỉnh, 10=Đã hủy
  templateNumber: varchar("template_number", { length: 50 }),
  symbol: varchar("symbol", { length: 20 }),
  invoiceNumber: varchar("invoice_number", { length: 50 }),
  salesChannel: text("sales_channel").notNull().default("table"), // "table", "pos", "online", "delivery"
  notes: text("notes"),
  orderedAt: timestamp("ordered_at").defaultNow().notNull(),
  servedAt: timestamp("served_at"),
  paidAt: timestamp("paid_at"),
});

export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id")
    .references(() => orders.id)
    .notNull(),
  productId: integer("product_id")
    .references(() => products.id)
    .notNull(),
  quantity: integer("quantity").notNull(),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),
  discount: decimal("discount", { precision: 10, scale: 2 }).notNull().default("0.00"),
  notes: text("notes"), // special requests
});

export const insertCategorySchema = createInsertSchema(categories).omit({
  // @ts-ignore
  id: true,
});

export const insertProductSchema = createInsertSchema(products)
  .omit({
    // @ts-ignore
    id: true,
  })
  .extend({
    price: z.string().refine((val) => !isNaN(Number(val)) && Number(val) > 0, {
      message: "Price must be a positive number",
    }),
    stock: z.number().min(0, "Stock cannot be negative"),
    productType: z.number().min(1).max(3, "Product type is required"),
    taxRate: z
      .string()
      .refine(
        (val) => !isNaN(Number(val)) && Number(val) >= 0 && Number(val) <= 100,
        {
          message: "Tax rate must be between 0 and 100",
        },
      ),
    priceIncludesTax: z.boolean().optional().default(false),
  });

export const insertTransactionSchema = createInsertSchema(transactions).omit({
  // @ts-ignore
  id: true,
  // @ts-ignore
  createdAt: true,
}).extend({
  invoiceId: z.number().nullable().optional(),
  invoiceNumber: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  orderId: z.number().nullable().optional(),
});

export const insertTransactionItemSchema = createInsertSchema(
  transactionItems,
).omit({
  // @ts-ignore
  id: true,
  // @ts-ignore
  transactionId: true,
});

export const insertEmployeeSchema = createInsertSchema(employees)
  .omit({
    // @ts-ignore
    id: true,
    // @ts-ignore
    createdAt: true,
  })
  .extend({
    name: z.string().min(1, "Tên nhân viên là bắt buộc"),
    role: z.enum(["manager", "cashier", "admin"], {
      errorMap: () => ({ message: "Role must be manager, cashier, or admin" }),
    }),
    hireDate: z.coerce.date(),
  });

export const insertAttendanceSchema = createInsertSchema(attendanceRecords)
  .omit({
    // @ts-ignore
    id: true,
    // @ts-ignore
    createdAt: true,
  })
  .extend({
    status: z.enum(["present", "absent", "late", "half_day"], {
      errorMap: () => ({
        message: "Status must be present, absent, late, or half_day",
      }),
    }),
  });

export const insertTableSchema = createInsertSchema(tables)
  .omit({
    // @ts-ignore
    id: true,
    // @ts-ignore
    createdAt: true,
  })
  .extend({
    status: z.enum(["available", "occupied", "reserved", "maintenance"], {
      errorMap: () => ({
        message: "Status must be available, occupied, reserved, or maintenance",
      }),
    }),
  });

export const insertOrderSchema = createInsertSchema(orders)
  .omit({
    // @ts-ignore
    id: true,
    // @ts-ignore
    orderedAt: true,
  })
  .extend({
    tableId: z.number().nullable().optional(),
    status: z.enum(
      [
        "pending",
        "confirmed",
        "preparing",
        "ready",
        "served",
        "paid",
        "cancelled",
      ],
      {
        errorMap: () => ({ message: "Invalid order status" }),
      },
    ),
    paymentMethod: z.string().optional(),
    paymentStatus: z.enum(["pending", "paid", "refunded"], {
      errorMap: () => ({ message: "Invalid payment status" }),
    }),
    einvoiceStatus: z.number().min(0).max(10).optional().default(0),
    salesChannel: z.enum(["table", "pos", "online", "delivery"]).optional().default("table"),
    paidAt: z.union([z.date(), z.string().datetime()]).optional().transform((val) => {
      if (typeof val === 'string') {
        return new Date(val);
      }
      return val;
    }),
  });

export const insertOrderItemSchema = createInsertSchema(orderItems).omit({
  // @ts-ignore
  id: true,
  // @ts-ignore
  orderId: true,
}).extend({
  discount: z.string().optional().default("0.00"),
});

export const insertStoreSettingsSchema = createInsertSchema(storeSettings).omit(
  {
    // @ts-ignore
    id: true,
    // @ts-ignore
    updatedAt: true,
  },
);

export const insertSupplierSchema = createInsertSchema(suppliers)
  .omit({
    // @ts-ignore
    id: true,
    // @ts-ignore
    createdAt: true,
    // @ts-ignore
    updatedAt: true,
  })
  .extend({
    status: z.enum(["active", "inactive"], {
      errorMap: () => ({ message: "Status must be active or inactive" }),
    }),
    email: z
      .string()
      .email("Invalid email format")
      .optional()
      .or(z.literal("")),
  });

export type Category = typeof categories.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type TransactionItem = typeof transactionItems.$inferSelect;
export type Employee = InferSelectModel<typeof employees>;
export type InsertEmployee = InferInsertModel<typeof employees>;

// Customers table
export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  customerId: varchar("customer_id", { length: 20 }).unique().notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  phone: varchar("phone", { length: 20 }),
  email: varchar("email", { length: 100 }),
  address: text("address"),
  dateOfBirth: date("date_of_birth"),
  visitCount: integer("visit_count").default(0),
  totalSpent: decimal("total_spent", { precision: 10, scale: 2 }).default(
    "0.00",
  ),
  points: integer("points").default(0),
  membershipLevel: varchar("membership_level", { length: 20 }).default(
    "SILVER",
  ),
  notes: text("notes"),
  status: varchar("status", { length: 20 }).default("active"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Point transactions table for tracking point history
export const pointTransactions = pgTable("point_transactions", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id")
    .references(() => customers.id)
    .notNull(),
  type: varchar("type", { length: 20 }).notNull(), // 'earned', 'redeemed', 'adjusted', 'expired'
  points: integer("points").notNull(), // positive for earned, negative for redeemed
  description: text("description").notNull(),
  orderId: integer("order_id").references(() => orders.id), // when points are earned/redeemed from order
  employeeId: integer("employee_id").references(() => employees.id), // who processed the transaction
  previousBalance: integer("previous_balance").notNull(),
  newBalance: integer("new_balance").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const inventoryTransactions = pgTable("inventory_transactions", {
  id: serial("id").primaryKey(),
  productId: integer("product_id")
    .references(() => products.id)
    .notNull(),
  type: varchar("type", { length: 20 }).notNull(), // 'add', 'subtract', 'set', 'sale', 'return'
  quantity: integer("quantity").notNull(),
  previousStock: integer("previous_stock").notNull(),
  newStock: integer("new_stock").notNull(),
  notes: text("notes"),
  invoiceId: integer("invoice_id"),
  invoiceNumber: varchar("invoice_number", { length: 50 }),
  createdAt: varchar("created_at", { length: 50 }).notNull(),
});

export const invoices = pgTable("invoices", {
  id: serial("id").primaryKey(),
  invoiceNumber: varchar("invoice_number", { length: 50 }),
  tradeNumber: varchar("trade_number", { length: 50 }).unique(),
  templateNumber: varchar("template_number", { length: 50 }),
  symbol: varchar("symbol", { length: 20 }),
  customerId: integer("customer_id").references(() => customers.id),
  customerName: varchar("customer_name", { length: 100 }).notNull(),
  customerTaxCode: varchar("customer_tax_code", { length: 20 }),
  customerAddress: text("customer_address"),
  customerPhone: varchar("customer_phone", { length: 20 }),
  customerEmail: varchar("customer_email", { length: 100 }),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
  tax: decimal("tax", { precision: 10, scale: 2 }).notNull(),
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),
  paymentMethod: integer("payment_method").notNull().default(1), // 1=Tiền mặt,2=Chuyển khoản,3=TM/CK,4=Đối trừ công nợ
  invoiceDate: timestamp("invoice_date").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("draft"), // 'draft', 'published', 'cancelled'
  einvoiceStatus: integer("einvoice_status").notNull().default(0), // 0=Chưa phát hành, 1=Đã phát hành, 2=Tạo nháp, 3=Đã duyệt, 4=Đã bị thay thế (hủy), 5=Thay thế tạm, 6=Thay thế, 7=Đã bị điều chỉnh, 8=Điều chỉnh tạm, 9=Điều chỉnh, 10=Đã hủy
  invoiceStatus: integer("invoice_status").notNull().default(1), // 1=Hoàn thành, 2=Đang phục vụ, 3=Đã hủy
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const invoiceItems = pgTable("invoice_items", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id")
    .references(() => invoices.id)
    .notNull(),
  productId: integer("product_id")
    .references(() => products.id)
    .notNull(),
  productName: varchar("product_name", { length: 200 }).notNull(),
  quantity: integer("quantity").notNull(),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),
  taxRate: decimal("tax_rate", { precision: 5, scale: 2 }).notNull().default("0.00"),
});

export const eInvoiceConnections = pgTable("einvoice_connections", {
  id: serial("id").primaryKey(),
  symbol: varchar("symbol", { length: 10 }).notNull(),
  taxCode: varchar("tax_code", { length: 20 }).notNull(),
  loginId: varchar("login_id", { length: 50 }).notNull(),
  password: text("password").notNull(),
  softwareName: varchar("software_name", { length: 50 }).notNull(),
  loginUrl: text("login_url"),
  signMethod: varchar("sign_method", { length: 20 }).notNull().default("Ký server"),
  cqtCode: varchar("cqt_code", { length: 20 }).notNull().default("Cấp nhật"),
  notes: text("notes"),
  isDefault: boolean("is_default").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const printerConfigs = pgTable("printer_configs", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  printerType: varchar("printer_type", { length: 50 }).notNull().default("thermal"),
  connectionType: varchar("connection_type", { length: 50 }).notNull().default("usb"),
  ipAddress: varchar("ip_address", { length: 45 }),
  port: integer("port").default(9100),
  macAddress: varchar("mac_address", { length: 17 }),
  paperWidth: integer("paper_width").notNull().default(80),
  printSpeed: integer("print_speed").default(100),
  isEmployee: boolean("is_employee").notNull().default(false),
  isKitchen: boolean("is_kitchen").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const invoiceTemplates = pgTable("invoice_templates", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  templateNumber: varchar("template_number", { length: 50 }).notNull(),
  templateCode: varchar("template_code", { length: 50 }),
  symbol: varchar("symbol", { length: 20 }).notNull(),
  useCK: boolean("use_ck").notNull().default(true),
  notes: text("notes"),
  isDefault: boolean("is_default").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertCustomerSchema = createInsertSchema(customers)
  .omit({
    // @ts-ignore
    id: true,
    // @ts-ignore
    createdAt: true,
    // @ts-ignore
    updatedAt: true,
  })
  .extend({
    email: z
      .string()
      .email("Invalid email format")
      .optional()
      .or(z.literal("")),
    membershipLevel: z
      .enum(["BRONZE", "SILVER", "GOLD", "PLATINUM"])
      .optional(),
    status: z.enum(["active", "inactive"]).optional(),
  });

export const insertPointTransactionSchema = createInsertSchema(
  pointTransactions,
)
  .omit({
    // @ts-ignore
    id: true,
    // @ts-ignore
    createdAt: true,
  })
  .extend({
    type: z.enum(["earned", "redeemed", "adjusted", "expired"], {
      errorMap: () => ({
        message: "Type must be earned, redeemed, adjusted, or expired",
      }),
    }),
  });

export type Customer = InferSelectModel<typeof customers>;
export type PointTransaction = typeof pointTransactions.$inferSelect;
export type AttendanceRecord = typeof attendanceRecords.$inferSelect;
export type Table = typeof tables.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type StoreSettings = typeof storeSettings.$inferSelect;
export type Supplier = typeof suppliers.$inferSelect;

export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type InsertTransactionItem = z.infer<typeof insertTransactionItemSchema>;
export type InsertAttendance = z.infer<typeof insertAttendanceSchema>;
export type InsertTable = z.infer<typeof insertTableSchema>;
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type InsertOrderItem = z.infer<typeof insertOrderItemSchema>;
export type InsertStoreSettings = z.infer<typeof insertStoreSettingsSchema>;
export type InsertSupplier = z.infer<typeof insertSupplierSchema>;
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type InsertPointTransaction = z.infer<
  typeof insertPointTransactionSchema
>;

export const insertEInvoiceConnectionSchema = createInsertSchema(
  eInvoiceConnections,
)
  .omit({
    // @ts-ignore
    id: true,
    // @ts-ignore
    createdAt: true,
    // @ts-ignore
    updatedAt: true,
  })
  .extend({
    signMethod: z.enum(["Ký server", "Ký USB Token", "Ký HSM"]).optional(),
    cqtCode: z.enum(["Cấp nhật", "Cấp hai"]).optional(),
  });

export const insertInvoiceTemplateSchema = createInsertSchema(
  invoiceTemplates,
).omit({
  // @ts-ignore
  id: true,
  // @ts-ignore
  createdAt: true,
  // @ts-ignore
  updatedAt: true,
});

export const insertInvoiceSchema = createInsertSchema(invoices).omit({
  // @ts-ignore
  id: true,
  // @ts-ignore
  createdAt: true,
  // @ts-ignore
  updatedAt: true,
}).extend({
  einvoiceStatus: z.number().min(0).max(10).optional().default(0),
});

export const insertInvoiceItemSchema = createInsertSchema(invoiceItems).omit({
  // @ts-ignore
  id: true,
  // @ts-ignore
  invoiceId: true,
});

export type EInvoiceConnection = typeof eInvoiceConnections.$inferSelect;
export type InsertEInvoiceConnection = z.infer<
  typeof insertEInvoiceConnectionSchema
>;
export type InvoiceTemplate = typeof invoiceTemplates.$inferSelect;
export type InsertInvoiceTemplate = z.infer<typeof insertInvoiceTemplateSchema>;
export type Invoice = typeof invoices.$inferSelect;
export type InvoiceItem = typeof invoiceItems.$inferSelect;
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type InsertInvoiceItem = z.infer<typeof insertInvoiceItemSchema>;

export const insertPrinterConfigSchema = createInsertSchema(printerConfigs).omit({
  // @ts-ignore
  id: true,
  // @ts-ignore
  createdAt: true,
  // @ts-ignore
  updatedAt: true,
}).extend({
  printerType: z.enum(["thermal", "inkjet", "laser"]).optional(),
  connectionType: z.enum(["usb", "network", "bluetooth"]).optional(),
});

export type PrinterConfig = typeof printerConfigs.$inferSelect;
export type InsertPrinterConfig = z.infer<typeof insertPrinterConfigSchema>;

// Cart item type for frontend use
export type CartItem = {
  id: number;
  name: string;
  price: string;
  quantity: number;
  total: string;
  imageUrl?: string;
  stock: number;
  taxRate?: string;
  afterTaxPrice?: string;
};

// Relations
export const categoriesRelations = relations(categories, ({ many }) => ({
  products: many(products),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, {
    fields: [products.categoryId],
    references: [categories.id],
  }),
  transactionItems: many(transactionItems),
}));

export const transactionsRelations = relations(transactions, ({ many }) => ({
  items: many(transactionItems),
}));

export const transactionItemsRelations = relations(
  transactionItems,
  ({ one }) => ({
    transaction: one(transactions, {
      fields: [transactionItems.transactionId],
      references: [transactions.id],
    }),
    product: one(products, {
      fields: [transactionItems.productId],
      references: [products.id],
    }),
  }),
);

export const employeesRelations = relations(employees, ({ many }) => ({
  attendanceRecords: many(attendanceRecords),
}));

export const attendanceRecordsRelations = relations(
  attendanceRecords,
  ({ one }) => ({
    employee: one(employees, {
      fields: [attendanceRecords.employeeId],
      references: [employees.id],
    }),
  }),
);

export const tablesRelations = relations(tables, ({ many }) => ({
  orders: many(orders),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  table: one(tables, {
    fields: [orders.tableId],
    references: [tables.id],
  }),
  employee: one(employees, {
    fields: [orders.employeeId],
    references: [employees.id],
  }),
  items: many(orderItems),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  product: one(products, {
    fields: [orderItems.productId],
    references: [products.id],
  }),
}));

export const customersRelations = relations(customers, ({ many }) => ({
  pointTransactions: many(pointTransactions),
}));

export const pointTransactionsRelations = relations(
  pointTransactions,
  ({ one }) => ({
    customer: one(customers, {
      fields: [pointTransactions.customerId],
      references: [customers.id],
    }),
    order: one(orders, {
      fields: [pointTransactions.orderId],
      references: [orders.id],
    }),
    employee: one(employees, {
      fields: [pointTransactions.employeeId],
      references: [employees.id],
    }),
  }),
);

// Receipt data type
export type Receipt = Transaction & {
  items: (TransactionItem & { productName: string })[];
};