import {
  categories,
  products,
  transactions,
  transactions as transactionsTable,
  transactionItems,
  transactionItems as transactionItemsTable,
  employees,
  attendanceRecords,
  tables,
  orders,
  orderItems as orderItemsTable,
  storeSettings,
  suppliers,
  customers,
  pointTransactions,
  invoiceTemplates,
  eInvoiceConnections,
  inventoryTransactions,
  invoices,
  invoiceItems,
  printerConfigs, // Import printerConfigs schema
} from "@shared/schema";
import { db } from "./db";
import { eq, ilike, and, gte, lte, or, sql, desc, not, like } from "drizzle-orm";

// Validate database connection on module load
if (!db) {
  console.error('❌ CRITICAL: Database connection is undefined on module load');
  throw new Error('Database connection failed to initialize');
}

// Additional validation to ensure db has required methods
if (!db.select || typeof db.select !== 'function') {
  console.error('❌ CRITICAL: Database connection is missing select method');
  throw new Error('Database connection is invalid - missing required methods');
}

console.log('✅ Database connection validated successfully');

export interface IStorage {
  // Categories
  getCategories(): Promise<Category[]>;
  createCategory(category: InsertCategory): Promise<Category>;
  updateCategory(
    id: number,
    updateData: Partial<InsertCategory>,
  ): Promise<Category>;
  deleteCategory(id: number): Promise<void>;

  // Products
  getProducts(): Promise<Product[]>;
  getProductsByCategory(
    categoryId: number,
    includeInactive?: boolean,
  ): Promise<Product[]>;
  getProduct(id: number): Promise<Product | undefined>;
  getProductBySku(sku: string): Promise<Product | undefined>;
  searchProducts(query: string, includeInactive?: boolean): Promise<Product[]>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(
    id: number,
    product: Partial<InsertProduct>,
  ): Promise<Product | undefined>;
  deleteProduct(id: number): Promise<boolean>;
  deleteInactiveProducts(): Promise<number>;
  updateProductStock(
    id: number,
    quantity: number,
  ): Promise<Product | undefined>;

  // Inventory Management
  updateInventoryStock(
    productId: number,
    quantity: number,
    type: "add" | "subtract" | "set",
    notes?: string,
  ): Promise<Product | undefined>;

  // Transactions
  createTransaction(
    transaction: InsertTransaction,
    items: InsertTransactionItem[],
  ): Promise<Receipt>;
  getTransaction(id: number): Promise<Receipt | undefined>;
  getTransactionByTransactionId(
    transactionId: string,
  ): Promise<Receipt | undefined>;
  getTransactions(): Promise<Transaction[]>;

  // Employees
  getEmployees(): Promise<Employee[]>;
  getEmployee(id: number): Promise<Employee | undefined>;
  getEmployeeByEmployeeId(employeeId: string): Promise<Employee | undefined>;
  createEmployee(employee: InsertEmployee): Promise<Employee>;
  updateEmployee(
    id: number,
    employee: Partial<InsertEmployee>,
  ): Promise<Employee | undefined>;
  deleteEmployee(id: number): Promise<boolean>;
  getNextEmployeeId(): Promise<string>;

  // Attendance
  getAttendanceRecords(
    employeeId?: number,
    date?: string,
  ): Promise<AttendanceRecord[]>;
  getAttendanceRecord(id: number): Promise<AttendanceRecord | undefined>;
  getTodayAttendance(employeeId: number): Promise<AttendanceRecord | undefined>;
  clockIn(employeeId: number, notes?: string): Promise<AttendanceRecord>;
  clockOut(attendanceId: number): Promise<AttendanceRecord | undefined>;
  startBreak(attendanceId: number): Promise<AttendanceRecord | undefined>;
  endBreak(attendanceId: number): Promise<AttendanceRecord | undefined>;
  updateAttendanceStatus(
    id: number,
    status: string,
  ): Promise<AttendanceRecord | undefined>;
  getAttendanceRecordsByRange(startDate: string, endDate: string): Promise<AttendanceRecord[]>;


  // Tables
  getTables(): Promise<Table[]>;
  getTable(id: number): Promise<Table | undefined>;
  getTableByNumber(tableNumber: string): Promise<Table | undefined>;
  createTable(table: InsertTable): Promise<Table>;
  updateTable(
    id: number,
    table: Partial<InsertTable>,
  ): Promise<Table | undefined>;
  updateTableStatus(id: number, status: string): Promise<Table | undefined>;
  deleteTable(id: number): Promise<boolean>;

  // Orders
  getOrders(tableId?: number, status?: string, salesChannel?: string): Promise<Order[]>;
  getOrder(id: number): Promise<Order | undefined>;
  getOrderByNumber(orderNumber: string): Promise<Order | undefined>;
  createOrder(order: InsertOrder, items: InsertOrderItem[]): Promise<Order>;
  updateOrder(
    id: number,
    order: Partial<InsertOrder>,
  ): Promise<Order | undefined>;
  updateOrderStatus(id: number | string, status: string): Promise<Order | undefined>;
  addOrderItems(
    orderId: number,
    items: InsertOrderItem[],
  ): Promise<OrderItem[]>;
  removeOrderItem(itemId: number): Promise<boolean>;
  getOrderItems(orderId: number): Promise<OrderItem[]>;

  // Store Settings
  getStoreSettings(): Promise<StoreSettings>;
  updateStoreSettings(
    settings: Partial<InsertStoreSettings>,
  ): Promise<StoreSettings>;

  // Suppliers
  getSuppliers(): Promise<any>;
  getSupplier(id: number): Promise<any>;
  getSuppliersByStatus(status: string): Promise<any>;
  searchSuppliers(query: string): Promise<any>;
  createSupplier(data: InsertSupplier): Promise<any>;
  updateSupplier(id: number, data: Partial<InsertSupplier>): Promise<any>;
  deleteSupplier(id: number): Promise<boolean>;

  // Customers
  getCustomers(): Promise<Customer[]>;
  searchCustomers(query: string): Promise<Customer[]>;
  getCustomer(id: number): Promise<Customer | undefined>;
  getCustomerByCustomerId(customerId: string): Promise<Customer | undefined>;
  createCustomer(customer: InsertCustomer): Promise<Customer>;
  updateCustomer(
    id: number,
    customer: Partial<InsertCustomer>,
  ): Promise<Customer | undefined>;
  deleteCustomer(id: number): Promise<boolean>;
  updateCustomerVisit(
    id: number,
    amount: number,
    points: number,
  ): Promise<Customer | undefined>;

  // Point Management
  getCustomerPoints(
    customerId: number,
  ): Promise<{ points: number } | undefined>;
  updateCustomerPoints(
    customerId: number,
    points: number,
    description: string,
    type: "earned" | "redeemed" | "adjusted",
    employeeId?: number,
    orderId?: number,
  ): Promise<PointTransaction>;
  getPointHistory(
    customerId: number,
    limit?: number,
  ): Promise<PointTransaction[]>;

  getAllPointTransactions(limit?: number): Promise<PointTransaction[]>;

  getMembershipThresholds(): Promise<{ GOLD: number; VIP: number }>;
  updateMembershipThresholds(thresholds: {
    GOLD: number;
    VIP: number;
  }): Promise<{ GOLD: number; VIP: number }>;
  recalculateAllMembershipLevels(
    goldThreshold: number,
    vipThreshold: number,
  ): Promise<void>;

  getAllProducts(includeInactive?: boolean): Promise<Product[]>;
  getActiveProducts(): Promise<Product[]>;

  // Invoice methods
  getInvoices(tenantDb?: any): Promise<any[]>;
  getInvoice(id: number, tenantDb?: any): Promise<any>;
  createInvoice(invoiceData: any, tenantDb?: any): Promise<any>;
  updateInvoice(id: number, updateData: any, tenantDb?: any): Promise<any>;
  deleteInvoice(id: number, tenantDb?: any): Promise<boolean>;

  // Invoice template methods
  getInvoiceTemplates(tenantDb?: any): Promise<any[]>;
  getActiveInvoiceTemplates(): Promise<any[]>;
  createInvoiceTemplate(templateData: any, tenantDb?: any): Promise<any>;
  updateInvoiceTemplate(id: number, templateData: any, tenantDb?: any): Promise<any>;
  deleteInvoiceTemplate(id: number, tenantDb?: any): Promise<boolean>;

  // E-invoice connections
  getEInvoiceConnections(): Promise<any[]>;
  getEInvoiceConnection(id: number): Promise<any>;
  createEInvoiceConnection(data: any): Promise<any>;
  updateEInvoiceConnection(id: number, data: any): Promise<any>;
  deleteEInvoiceConnection(id: number): Promise<boolean>;

  getEmployeeByEmail(email: string): Promise<Employee | undefined>;

  // Printer configuration management
  getPrinterConfigs(tenantDb?: any): Promise<PrinterConfig[]>;
  createPrinterConfig(configData: any, tenantDb?: any): Promise<PrinterConfig>;
  updatePrinterConfig(id: number, configData: any, tenantDb?: any): Promise<PrinterConfig | null>;
  deletePrinterConfig(id: number, tenantDb?: any): Promise<boolean>;
}

// Define interfaces for the schemas
interface Category {
  id: number;
  name: string;
  isActive: boolean;
}

interface InsertCategory {
  name: string;
  isActive?: boolean;
}

interface Product {
  id: number;
  name: string;
  sku: string;
  price: number;
  stock: number;
  categoryId: number;
  productType: number;
  trackInventory: boolean;
  imageUrl: string | null;
  isActive: boolean;
  afterTaxPrice: number | null;
}

interface InsertProduct {
  name: string;
  sku: string;
  price: number;
  stock: number;
  categoryId: number;
  productType?: number;
  trackInventory?: boolean;
  imageUrl?: string | null;
  isActive?: boolean;
}

interface Transaction {
  id: number;
  transactionId: string;
  customerId: number | null;
  employeeId: number | null;
  tableId: number | null;
  status: string;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  amountReceived: number | null;
  change: number | null;
  paymentMethod: string;
  paymentStatus: string;
  createdAt: string;
  updatedAt: string;
}

interface InsertTransaction {
  transactionId: string;
  customerId?: number | null;
  employeeId?: number | null;
  tableId?: number | null;
  status: string;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  amountReceived?: number | null;
  change?: number | null;
  paymentMethod: string;
  paymentStatus: string;
  createdAt?: Date;
}

interface TransactionItem {
  id: number;
  transactionId: number;
  productId: number;
  quantity: number;
  unitPrice: number;
  total: number;
  productName: string;
}

interface InsertTransactionItem {
  productId: number;
  quantity: number;
  unitPrice: number;
  total: number;
  productName: string;
}

interface Receipt extends Transaction {
  items: TransactionItem[];
}

interface Employee {
  id: number;
  employeeId: string;
  name: string;
  email: string;
  phone: string;
  position: string;
  salary: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface InsertEmployee {
  employeeId?: string;
  name: string;
  email: string;
  phone: string;
  position: string;
  salary: number;
  isActive?: boolean;
}

interface AttendanceRecord {
  id: number;
  employeeId: number;
  clockIn: Date;
  clockOut: Date | null;
  breakStart: Date | null;
  breakEnd: Date | null;
  status: string;
  notes: string | null;
  totalHours: string | null;
  overtime: string | null;
}

interface Table {
  id: number;
  tableNumber: string;
  status: string;
  capacity: number;
  createdAt: string;
  updatedAt: string;
}

interface InsertTable {
  tableNumber: string;
  status?: string;
  capacity?: number;
}

interface Order {
  id: number;
  orderNumber: string;
  tableId: number | null;
  employeeId: number | null;
  status: string;
  customerName: string | null;
  customerCount: number | null;
  subtotal: string;
  tax: string;
  discount: string;
  total: string;
  paymentMethod: string | null;
  paymentStatus: string;
  einvoiceStatus: number;
  salesChannel: string;
  notes: string | null;
  paidAt: Date | null;
  servedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  invoiceNumber?: string | null;
  invoiceId?: number | null;
  templateNumber?: string | null;
  symbol?: string | null;
}

interface InsertOrder {
  orderNumber?: string;
  tableId?: number | null;
  employeeId?: number | null;
  status: string;
  customerName?: string | null;
  customerCount?: number | null;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  paymentMethod?: string | null;
  paymentStatus?: string;
  einvoiceStatus?: number;
  salesChannel?: string;
  notes?: string | null;
  paidAt?: Date | null;
  servedAt?: Date | null;
  invoiceNumber?: string | null;
  invoiceId?: number | null;
  templateNumber?: string | null;
  symbol?: string | null;
}

interface OrderItem {
  id: number;
  orderId: number;
  productId: number;
  quantity: number;
  unitPrice: number;
  total: number;
  discount?: string; // Added discount field
  notes: string | null;
  productName?: string;
  productSku?: string;
}

interface InsertOrderItem {
  productId: number;
  quantity: number;
  unitPrice: number;
  total: number;
  discount?: string; // Added discount field
  notes?: string | null;
}

interface StoreSettings {
  id: number;
  storeName: string;
  storeCode: string;
  businessType: string;
  openTime: string;
  closeTime: string;
  logoUrl?: string | null;
  currency?: string;
  taxRate?: string;
  goldThreshold?: string;
  vipThreshold?: string;
  createdAt: string;
  updatedAt: string;
}

interface InsertStoreSettings {
  storeName?: string;
  storeCode?: string;
  businessType?: string;
  openTime?: string;
  closeTime?: string;
  logoUrl?: string | null;
  currency?: string;
  taxRate?: string;
  goldThreshold?: string;
  vipThreshold?: string;
}

interface Supplier {
  id: number;
  name: string;
  code: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface InsertSupplier {
  name: string;
  code: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  status?: string;
}

interface Customer {
  id: number;
  customerId: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  visitCount: number;
  totalSpent: string;
  points: number;
  membershipLevel: string;
  createdAt: string;
  updatedAt: string;
}

interface InsertCustomer {
  customerId?: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  visitCount?: number;
  totalSpent?: string;
  points?: number;
  membershipLevel?: string;
}

interface PointTransaction {
  id: number;
  customerId: number;
  type: "earned" | "redeemed" | "adjusted";
  points: number;
  description: string;
  orderId: number | null;
  employeeId: number | null;
  previousBalance: number;
  newBalance: number;
  createdAt: string;
}

interface Invoice {
  id: number;
  invoiceNumber: string | null;
  templateNumber: string | null;
  symbol: string | null;
  customerName: string;
  customerTaxCode: string | null;
  customerAddress: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  subtotal: number;
  tax: number;
  total: number;
  paymentMethod: number;
  invoiceDate: Date;
  status: string;
  einvoiceStatus: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface InvoiceItem {
  id: number;
  invoiceId: number;
  productId: number;
  productName: string;
  quantity: number;
  unitPrice: number;
  total: number;
  taxRate: string;
}

interface InvoiceTemplate {
  id: number;
  name: string;
  templateNumber: string;
  templateCode: string | null;
  symbol: string;
  useCK: boolean;
  notes: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

interface EInvoiceConnection {
  id: number;
  symbol: string;
  taxCode: string;
  loginId: string;
  password: string;
  softwareName: string;
  loginUrl?: string;
  signMethod: string;
  cqtCode: string;
  notes?: string;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface PrinterConfig {
  id: number;
  name: string;
  printerType: string;
  connectionType: string;
  ipAddress?: string;
  port?: number;
  macAddress?: string;
  paperWidth: number;
  printSpeed: number;
  isPrimary: boolean;
  isSecondary: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class DatabaseStorage implements IStorage {
  // Store db connection for reuse
  private db: any;

  constructor() {
    this.db = db;
  }

  // Get safe database connection with fallback
  private getSafeDatabase(tenantDb?: any, operation: string = 'operation'): any {
    console.log(`🔍 Getting safe database for operation: ${operation}`);

    let database = tenantDb || this.db;

    // If both tenantDb and db are undefined/null, throw critical error
    if (!database) {
      console.error(`❌ CRITICAL: No database connection available for ${operation}`);
      console.error(`❌ tenantDb:`, !!tenantDb);
      console.error(`❌ global db:`, !!this.db);
      throw new Error(`Database connection is completely unavailable for ${operation}`);
    }

    // Comprehensive validation of database object
    if (typeof database !== 'object' || database === null) {
      console.error(`❌ Database is not a valid object in ${operation}:`, {
        type: typeof database,
        isNull: database === null,
        isUndefined: database === undefined
      });

      // Try falling back to global db if tenantDb is invalid
      if (tenantDb && this.db && typeof this.db === 'object' && this.db !== null) {
        console.log(`🔄 Falling back to global db for ${operation}`);
        database = this.db;
      } else {
        throw new Error(`Invalid database connection for ${operation} - no valid fallback available`);
      }
    }

    // Validate required methods exist
    const requiredMethods = ['select', 'insert', 'update', 'delete'];
    const missingMethods = requiredMethods.filter(method => !database[method] || typeof database[method] !== 'function');

    if (missingMethods.length > 0) {
      console.error(`❌ Database missing required methods in ${operation}:`, {
        missingMethods,
        availableMethods: Object.keys(database).filter(key => typeof database[key] === 'function')
      });

      // Try falling back to global db if methods are missing
      if (tenantDb && this.db && typeof this.db === 'object') {
        const globalDbMissingMethods = requiredMethods.filter(method => !this.db[method] || typeof this.db[method] !== 'function');
        if (globalDbMissingMethods.length === 0) {
          console.log(`🔄 Falling back to global db with complete methods for ${operation}`);
          database = this.db;
        } else {
          throw new Error(`Both tenant and global database connections are invalid for ${operation}`);
        }
      } else {
        throw new Error(`Database connection is invalid - missing methods: ${missingMethods.join(', ')} for ${operation}`);
      }
    }

    console.log(`✅ Database validation passed for ${operation}`);
    return database;
  }

  async getCategories(tenantDb?: any): Promise<Category[]> {
    try {
      const database = this.getSafeDatabase(tenantDb, 'getCategories');
      const result = await database.select().from(categories);
      return result || [];
    } catch (error) {
      console.error(`❌ Error in getCategories:`, error);
      // Return empty array instead of throwing to prevent crashes
      return [];
    }
  }

  async createCategory(insertCategory: InsertCategory, tenantDb?: any): Promise<Category> {
    const database = tenantDb || this.db;
    const [category] = await database
      .insert(categories)
      .values(insertCategory)
      .returning();
    return category;
  }

  async updateCategory(
    id: number,
    updateData: Partial<InsertCategory>,
    tenantDb?: any,
  ): Promise<Category> {
    const database = tenantDb || this.db;
    const [category] = await database
      .update(categories)
      .set(updateData)
      .where(eq(categories.id, id))
      .returning();
    return category;
  }

  async deleteCategory(id: number, tenantDb?: any): Promise<void> {
    const database = tenantDb || this.db;
    await database.delete(categories).where(eq(categories.id, id));
  }

  async getProducts(tenantDb?: any): Promise<Product[]> {
    try {
      const database = this.getSafeDatabase(tenantDb, 'getProducts');
      const result = await database
        .select()
        .from(products)
        .where(eq(products.isActive, true));
      // Ensure productType has a default value if missing and afterTaxPrice is properly returned
      return result.map((product) => ({
        ...product,
        productType: product.productType || 1,
        afterTaxPrice: product.afterTaxPrice || null
      }));
    } catch (error) {
      console.error(`❌ Error in getProducts:`, error);
      return [];
    }
  }

  async getProductsByCategory(
    categoryId: number,
    includeInactive: boolean = false,
    tenantDb?: any,
  ): Promise<Product[]> {
    try {
      const database = this.getSafeDatabase(tenantDb, 'getProductsByCategory');
      let whereCondition = eq(products.categoryId, categoryId);

      if (!includeInactive) {
        whereCondition = and(whereCondition, eq(products.isActive, true));
      }

      const result = await database
        .select()
        .from(products)
        .where(whereCondition)
        .orderBy(products.name);

      // Ensure afterTaxPrice is properly returned
      return result.map((product) => ({
        ...product,
        afterTaxPrice: product.afterTaxPrice || null
      }));
    } catch (error) {
      console.error(`❌ Error in getProductsByCategory:`, error);
      return [];
    }
  }

  async getProduct(id: number, tenantDb?: any): Promise<Product | undefined> {
    const database = tenantDb || this.db;
    if (!database) {
      console.error(`❌ Database is undefined in getProduct`);
      throw new Error(`Database connection is not available`);
    }
    const [product] = await database
      .select()
      .from(products)
      .where(and(eq(products.id, id), eq(products.isActive, true)));
    return product || undefined;
  }

  async getProductBySku(sku: string, tenantDb?: any): Promise<Product | undefined> {
    const database = tenantDb || this.db;
    if (!database) {
      console.error(`❌ Database is undefined in getProductBySku`);
      throw new Error(`Database connection is not available`);
    }
    const [product] = await database
      .select()
      .from(products)
      .where(and(eq(products.sku, sku), eq(products.isActive, true)));
    return product || undefined;
  }

  async searchProducts(
    query: string,
    includeInactive: boolean = false,
    tenantDb?: any,
  ): Promise<Product[]> {
    const database = tenantDb || this.db;
    if (!database) {
      console.error(`❌ Database is undefined in searchProducts`);
      throw new Error(`Database connection is not available`);
    }
    let whereCondition = or(
      ilike(products.name, `%${query}%`),
      ilike(products.sku, `%${query}%`)
    );

    if (!includeInactive) {
      whereCondition = and(whereCondition, eq(products.isActive, true));
    }

    return await database.select().from(products).where(whereCondition);
  }

  // @ts-ignore
  async createProduct(insertProduct: InsertProduct, tenantDb?: any): Promise<Product> {
    const database = tenantDb || this.db;
    if (!database) {
      console.error(`❌ Database is undefined in createProduct`);
      throw new Error(`Database connection is not available`);
    }
    try {
      console.log("Storage: Creating product with data:", insertProduct);
      const productData = {
        name: insertProduct.name,
        sku: insertProduct.sku,
        price: insertProduct.price,
        stock: insertProduct.stock,
        categoryId: insertProduct.categoryId,
        productType: insertProduct.productType || 1,
        trackInventory: insertProduct.trackInventory !== false,
        imageUrl: insertProduct.imageUrl || null,
        isActive: true,
      };

      console.log("Storage: Inserting product data:", productData);

      const [product] = await database
        .insert(products)
        .values(productData)
        .returning();

      console.log("Storage: Product created successfully:", product);
      return product;
    } catch (error) {
      console.error("Storage: Error creating product:", error);
      throw error;
    }
  }

  async updateProduct(
    id: number,
    updateData: Partial<InsertProduct>,
    tenantDb?: any,
  ): Promise<Product | undefined> {
    const database = tenantDb || this.db;
    if (!database) {
      console.error(`❌ Database is undefined in updateProduct`);
      throw new Error(`Database connection is not available`);
    }
    const [product] = await database
      .update(products)
      .set({
        ...updateData,
        imageUrl: updateData.imageUrl || null,
      })
      .where(and(eq(products.id, id), eq(products.isActive, true)))
      .returning();
    return product || undefined;
  }

  async deleteProduct(id: number, tenantDb?: any): Promise<boolean> {
    const database = tenantDb || this.db;
    if (!database) {
      console.error(`❌ Database is undefined in deleteProduct`);
      throw new Error(`Database connection is not available`);
    }
    try {
      // Check if product exists in transactions
      const transactionItemsCheck = await database
        .select()
        .from(transactionItems)
        .where(eq(transactionItems.productId, id))
        .limit(1);

      if (transactionItemsCheck.length > 0) {
        throw new Error(
          "Cannot delete product: it has been used in transactions",
        );
      }

      // Check if product exists in order items
      const orderItemsCheck = await database
        .select()
        .from(orderItemsTable)
        .where(eq(orderItemsTable.productId, id))
        .limit(1);

      if (orderItemsCheck.length > 0) {
        throw new Error("Cannot delete product: it has been used in orders");
      }

      // If no references found, delete the product
      const result = await database
        .delete(products)
        .where(eq(products.id, id))
        .returning();

      return result.length > 0;
    } catch (error) {
      console.error("Error deleting product:", error);
      throw error;
    }
  }

  async deleteInactiveProducts(tenantDb?: any): Promise<number> {
    const database = tenantDb || this.db;
    if (!database) {
      console.error(`❌ Database is undefined in deleteInactiveProducts`);
      throw new Error(`Database connection is not available`);
    }
    const result = await database
      .delete(products)
      .where(eq(products.isActive, false))
      .returning();
    return result.length;
  }

  async updateProductStock(
    id: number,
    quantity: number,
    tenantDb?: any,
  ): Promise<Product | undefined> {
    const database = tenantDb || this.db;
    if (!database) {
      console.error(`❌ Database is undefined in updateProductStock`);
      throw new Error(`Database connection is not available`);
    }

    try {
      console.log(`🔍 Starting stock update for product ID: ${id}, quantity change: ${quantity}`);

      const [product] = await database
        .select()
        .from(products)
        .where(eq(products.id, id));

      if (!product) {
        console.error(`❌ Product not found for stock update: ID ${id}`);
        throw new Error(`Product with ID ${id} not found`);
      }

      console.log(`📋 Product found: ${product.name}, current stock: ${product.stock}, tracks inventory: ${product.trackInventory}`);

      // Check if product tracks inventory before updating
      if (!product.trackInventory) {
        console.log(`⏭️ Product ${product.name} does not track inventory - skipping stock update`);
        return product; // Return the original product without updating stock
      }

      const currentStock = product.stock || 0;
      // Đơn giản: chỉ cần lấy tổng tồn kho hiện tại trừ đi số lượng bán
      const newStock = currentStock - Math.abs(quantity);

      // Log the stock calculation
      console.log(`📦 Simple stock calculation for ${product.name} (ID: ${id}):`);
      console.log(`   - Current stock: ${currentStock}`);
      console.log(`   - Quantity to subtract: ${Math.abs(quantity)}`);
      console.log(`   - New stock: ${newStock}`);

      // Check if we have sufficient stock
      if (newStock < 0) {
        const errorMsg = `Insufficient stock for ${product.name}. Available: ${currentStock}, Required: ${Math.abs(quantity)}`;
        console.error(`❌ ${errorMsg}`);
        throw new Error(errorMsg);
      }

      const [updatedProduct] = await database
        .update(products)
        .set({ stock: newStock })
        .where(eq(products.id, id))
        .returning();

      if (updatedProduct) {
        console.log(`✅ Stock updated successfully for ${product.name}: ${currentStock} → ${newStock}`);

        // Create inventory transaction record
        try {
          await database.execute(sql`
            INSERT INTO inventory_transactions
            (product_id, type, quantity, previous_stock, new_stock, notes, created_at)
            VALUES (${id}, 'subtract', ${Math.abs(quantity)}, ${currentStock}, ${newStock},
                   'Stock deduction from sale', ${new Date().toISOString()})
          `);
          console.log(`📝 Inventory transaction recorded for ${product.name}`);
        } catch (invError) {
          console.error(`❌ Failed to record inventory transaction:`, invError);
          // Don't throw here as the stock update was successful
        }

        return updatedProduct;
      } else {
        console.error(`❌ Failed to update stock for ${product.name} - no updated product returned`);
        throw new Error(`Failed to update stock for product: ${product.name}`);
      }
    } catch (error) {
      console.error(`❌ Error updating stock for product ID ${id}:`, error);
      throw error; // Re-throw the error so the caller can handle it
    }
  }

  async createTransaction(
    insertTransaction: InsertTransaction,
    items: InsertTransactionItem[],
    tenantDb?: any,
  ): Promise<Receipt> {
    const database = tenantDb || this.db;
    if (!database) {
      console.error(`❌ Database is undefined in createTransaction`);
      throw new Error(`Database connection is not available`);
    }
    console.log(`🔄 Creating transaction: ${insertTransaction.transactionId}`);
    console.log(`📦 Processing ${items.length} items for inventory deduction`);
    console.log(`📋 Transaction details:`, JSON.stringify(insertTransaction, null, 2));

    try {
      // Create the main transaction record
      const [transaction] = await database
        .insert(transactions)
        .values({
          ...insertTransaction,
          amountReceived: insertTransaction.amountReceived || null,
          change: insertTransaction.change || null,
        })
        .returning();

      console.log(`✅ Transaction record created with ID: ${transaction.id}`);

      const transactionItemsWithIds: TransactionItem[] = [];
      const stockUpdateResults: Array<{productName: string, success: boolean, error?: string}> = [];

      // Process each item
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        console.log(`📝 Processing item ${i + 1}/${items.length}: ${item.productName} (ID: ${item.productId}) - Qty: ${item.quantity}`);

        try {
          // Create transaction item record
          const [transactionItem] = await database
            .insert(transactionItems)
            .values({
              ...item,
              transactionId: transaction.id,
            })
            .returning();

          console.log(`✅ Transaction item created with ID: ${transactionItem.id}`);

          // Update product stock - trừ tồn kho đơn giản
          console.log(`🔢 Updating stock for product ID ${item.productId}: subtract ${item.quantity}`);

          try {
            const updatedProduct = await this.updateProductStock(item.productId, item.quantity, tenantDb);

            if (updatedProduct) {
              console.log(`✅ Stock successfully updated for ${item.productName}: New stock = ${updatedProduct.stock}`);
              stockUpdateResults.push({
                productName: item.productName,
                success: true
              });
            } else {
              const errorMsg = `Failed to update stock for ${item.productName} - no product returned`;
              console.error(`❌ ${errorMsg}`);
              stockUpdateResults.push({
                productName: item.productName,
                success: false,
                error: errorMsg
              });
            }
          } catch (stockError) {
            const errorMsg = stockError instanceof Error ? stockError.message : String(stockError);
            console.error(`❌ Stock update error for ${item.productName}:`, errorMsg);
            stockUpdateResults.push({
              productName: item.productName,
              success: false,
              error: errorMsg
            });
          }

          transactionItemsWithIds.push(transactionItem);
        } catch (itemError) {
          console.error(`❌ Error processing transaction item ${item.productName}:`, itemError);
          throw new Error(`Failed to process item ${item.productName}: ${itemError instanceof Error ? itemError.message : String(itemError)}`);
        }
      }

      // Log stock update summary
      const successfulUpdates = stockUpdateResults.filter(r => r.success);
      const failedUpdates = stockUpdateResults.filter(r => !r.success);

      console.log(`📊 Stock update summary:`);
      console.log(`   - Successful: ${successfulUpdates.length}/${items.length}`);
      console.log(`   - Failed: ${failedUpdates.length}/${items.length}`);

      if (failedUpdates.length > 0) {
        console.error(`❌ Failed stock updates:`, failedUpdates);
        // Log but don't fail the transaction - the transaction was created successfully
      }

      console.log(`✅ Transaction created successfully: ${transaction.transactionId} with ${transactionItemsWithIds.length} items`);

      return {
        ...transaction,
        items: transactionItemsWithIds,
      };
    } catch (error) {
      console.error(`❌ Error creating transaction ${insertTransaction.transactionId}:`, error);
      throw new Error(`Failed to create transaction: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async getTransaction(id: number): Promise<Receipt | undefined> {
    if (!this.db) {
      console.error(`❌ Database is undefined in getTransaction`);
      throw new Error(`Database connection is not available`);
    }
    const [transaction] = await this.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, id));

    if (!transaction) return undefined;

    const items = await this.db
      .select()
      .from(transactionItems)
      .where(eq(transactionItems.transactionId, id));

    return { ...transaction, items };
  }

  async getTransactionByTransactionId(
    transactionId: string,
  ): Promise<Receipt | undefined> {
    if (!this.db) {
      console.error(`❌ Database is undefined in getTransactionByTransactionId`);
      throw new Error(`Database connection is not available`);
    }
    const [transaction] = await this.db
      .select()
      .from(transactions)
      .where(eq(transactions.transactionId, transactionId));

    if (!transaction) return undefined;

    const items = await this.db
      .select()
      .from(transactionItems)
      .where(eq(transactionItems.transactionId, transaction.id));

    return { ...transaction, items };
  }

  async getTransactions(tenantDb?: any): Promise<Transaction[]> {
    const database = tenantDb || this.db;
    if (!database) {
      console.error(`❌ Database is undefined in getTransactions`);
      throw new Error(`Database connection is not available`);
    }
    return await database.select().from(transactions).orderBy(transactions.createdAt);
  }

  // Get next employee ID in sequence
  async getNextEmployeeId(tenantDb?: any): Promise<string> {
    const database = tenantDb || this.db;
    if (!database) {
      console.error(`❌ Database is undefined in getNextEmployeeId`);
      throw new Error(`Database connection is not available`);
    }
    try {
      const lastEmployee = await database
        .select()
        .from(employees)
        .orderBy(desc(employees.id))
        .limit(1);

      if (lastEmployee.length === 0) {
        return "EMP-001";
      }

      // Extract number from last employee ID (EMP-001 -> 001)
      const lastId = lastEmployee[0].employeeId;
      const match = lastId.match(/EMP-(\d+)/);

      if (match) {
        const lastNumber = parseInt(match[1], 10);
        const nextNumber = lastNumber + 1;
        return `EMP-${nextNumber.toString().padStart(3, "0")}`;
      }

      // Fallback if format doesn't match
      return "EMP-001";
    } catch (error) {
      console.error("Error generating next employee ID:", error);
      return "EMP-001";
    }
  }

  // Generate next customer ID
  async getNextCustomerId(tenantDb?: any): Promise<string> {
    const database = tenantDb || this.db;
    if (!database) {
      console.error(`❌ Database is undefined in getNextCustomerId`);
      throw new Error(`Database connection is not available`);
    }
    try {
      // Get all customer IDs that match the CUST pattern and extract numbers
      const allCustomers = await database
        .select({ customerId: customers.customerId })
        .from(customers)
        .where(like(customers.customerId, "CUST%"));

      if (allCustomers.length === 0) {
        return "CUST001";
      }

      // Extract all numbers from existing customer IDs
      const existingNumbers = allCustomers
        .map(customer => {
          const match = customer.customerId.match(/CUST(\d+)/);
          return match ? parseInt(match[1], 10) : 0;
        })
        .filter(num => num > 0)
        .sort((a, b) => b - a); // Sort descending

      // Find the highest number and increment
      const highestNumber = existingNumbers[0] || 0;
      const nextNumber = highestNumber + 1;

      return `CUST${nextNumber.toString().padStart(3, "0")}`;
    } catch (error) {
      console.error("Error generating next customer ID:", error);
      return "CUST001";
    }
  }

  // Employee methods
  async getEmployees(tenantDb?: any): Promise<Employee[]> {
    const database = tenantDb || this.db;
    if (!database) {
      console.error(`❌ Database is undefined in getEmployees`);
      throw new Error(`Database connection is not available`);
    }
    return await database
      .select()
      .from(employees)
      .where(eq(employees.isActive, true));
  }

  async getEmployee(id: number, tenantDb?: any): Promise<Employee | undefined> {
    const database = tenantDb || this.db;
    if (!database) {
      console.error(`❌ Database is undefined in getEmployee`);
      throw new Error(`Database connection is not available`);
    }
    const [employee] = await database
      .select()
      .from(employees)
      .where(and(eq(employees.id, id), eq(employees.isActive, true)));
    return employee || undefined;
  }

  async getEmployeeByEmployeeId(
    employeeId: string,
    tenantDb?: any,
  ): Promise<Employee | undefined> {
    const database = tenantDb || this.db;
    if (!database) {
      console.error(`❌ Database is undefined in getEmployeeByEmployeeId`);
      throw new Error(`Database connection is not available`);
    }
    const [employee] = await database
      .select()
      .from(employees)
      .where(
        and(eq(employees.employeeId, employeeId), eq(employees.isActive, true)),
      );
    return employee || undefined;
  }

  async createEmployee(insertEmployee: InsertEmployee, tenantDb?: any): Promise<Employee> {
    const database = tenantDb || this.db;
    if (!database) {
      console.error(`❌ Database is undefined in createEmployee`);
      throw new Error(`Database connection is not available`);
    }
    const [employee] = await database
      .insert(employees)
      .values(insertEmployee)
      .returning();
    return employee;
  }

  async updateEmployee(
    id: number,
    updateData: Partial<InsertEmployee>,
    tenantDb?: any,
  ): Promise<Employee | undefined> {
    const database = tenantDb || this.db;
    if (!database) {
      console.error(`❌ Database is undefined in updateEmployee`);
      throw new Error(`Database connection is not available`);
    }
    const [employee] = await database
      .update(employees)
      .set(updateData)
      .where(and(eq(employees.id, id), eq(employees.isActive, true)))
      .returning();
    return employee || undefined;
  }

  async deleteEmployee(id: number, tenantDb?: any): Promise<boolean> {
    const database = tenantDb || this.db;
    if (!database) {
      console.error(`❌ Database is undefined in deleteEmployee`);
      throw new Error(`Database connection is not available`);
    }
    try {
      // Check if employee has attendance records
      const attendanceCheck = await database
        .select()
        .from(attendanceRecords)
        .where(eq(attendanceRecords.employeeId, id))
        .limit(1);

      if (attendanceCheck.length > 0) {
        throw new Error("Cannot delete employee: employee has attendance records");
      }

      // Check if employee has orders
      const orderCheck = await database
        .select()
        .from(orders)
        .where(eq(orders.employeeId, id))
        .limit(1);

      if (orderCheck.length > 0) {
        throw new Error("Cannot delete employee: employee has orders");
      }

      // If no references found, delete the employee
      const result = await database
        .delete(employees)
        .where(eq(employees.id, id))
        .returning();

      return result.length > 0;
    } catch (error) {
      console.error("Error deleting employee:", error);
      throw error;
    }
  }

  async getAttendanceRecords(
    employeeId?: number,
    date?: string,
    tenantDb?: any,
  ): Promise<AttendanceRecord[]> {
    try {
      const database = this.getSafeDatabase(tenantDb, 'getAttendanceRecords');

      const conditions = [];

      if (employeeId) {
        conditions.push(eq(attendanceRecords.employeeId, employeeId));
      }

      if (date) {
        const startDate = new Date(date);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(date);
        endDate.setHours(23, 59, 59, 999);

        conditions.push(
          gte(attendanceRecords.clockIn, startDate),
          lte(attendanceRecords.clockIn, endDate),
        );
      }

      if (conditions.length > 0) {
        return await database
          .select()
          .from(attendanceRecords)
          .where(and(...conditions))
          .orderBy(attendanceRecords.clockIn);
      }

      return await database
        .select()
        .from(attendanceRecords)
        .orderBy(attendanceRecords.clockIn);
    } catch (error) {
      console.error(`❌ Error in getAttendanceRecords:`, error);
      return [];
    }
  }

  async getAttendanceRecord(id: number, tenantDb?: any): Promise<AttendanceRecord | undefined> {
    const database = tenantDb || this.db;

    try {
      this.validateDatabase(database, 'getAttendanceRecord');
      const [record] = await database
        .select()
        .from(attendanceRecords)
        .where(eq(attendanceRecords.id, id));
      return record || undefined;
    } catch (error) {
      console.error(`❌ Error in getAttendanceRecord:`, error);
      return undefined;
    }
  }

  async getTodayAttendance(
    employeeId: number,
    tenantDb?: any,
  ): Promise<AttendanceRecord | undefined> {
    const database = tenantDb || this.db;

    try {
      this.validateDatabase(database, 'getTodayAttendance');

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const [record] = await database
        .select()
        .from(attendanceRecords)
        .where(
          and(
            eq(attendanceRecords.employeeId, employeeId),
            gte(attendanceRecords.clockIn, today),
            lte(attendanceRecords.clockIn, tomorrow),
          ),
        );
      return record || undefined;
    } catch (error) {
      console.error(`❌ Error in getTodayAttendance:`, error);
      return undefined;
    }
  }

  async clockIn(employeeId: number, notes?: string): Promise<AttendanceRecord> {
    if (!this.db) {
      console.error(`❌ Database is undefined in clockIn`);
      throw new Error(`Database connection is not available`);
    }
    try {
      // Check if employee exists
      const [employee] = await this.db
        .select()
        .from(employees)
        .where(eq(employees.id, employeeId))
        .limit(1);

      if (!employee) {
        throw new Error(`Employee with ID ${employeeId} not found`);
      }

      // Check if already clocked in today
      const existingRecord = await this.getTodayAttendance(employeeId);
      if (existingRecord) {
        throw new Error('Employee already clocked in today');
      }

      const clockInTime = new Date();
      const [record] = await this.db
        .insert(attendanceRecords)
        .values({
          employeeId,
          clockIn: clockInTime,
          status: "present",
          notes: notes || null,
        })
        .returning();

      if (!record) {
        throw new Error('Failed to create attendance record');
      }

      return record;
    } catch (error) {
      console.error('Clock-in error:', error);
      throw error;
    }
  }

  async clockOut(attendanceId: number): Promise<AttendanceRecord | undefined> {
    if (!this.db) {
      console.error(`❌ Database is undefined in clockOut`);
      throw new Error(`Database connection is not available`);
    }
    const clockOutTime = new Date();
    const record = await this.getAttendanceRecord(attendanceId);
    if (!record) return undefined;

    const clockInTime = new Date(record.clockIn);
    const totalMinutes =
      (clockOutTime.getTime() - clockInTime.getTime()) / (1000 * 60);
    let totalHours = totalMinutes / 60;

    // Subtract break time if any
    if (record.breakStart && record.breakEnd) {
      const breakMinutes =
        (new Date(record.breakEnd).getTime() -
          new Date(record.breakStart).getTime()) /
        (1000 * 60);
      totalHours -= breakMinutes / 60;
    }

    // Calculate overtime (assuming 8 hour work day)
    const overtime = Math.max(0, totalHours - 8);

    const [updatedRecord] = await this.db
      .update(attendanceRecords)
      .set({
        clockOut: clockOutTime,
        totalHours: totalHours.toFixed(2),
        overtime: overtime.toFixed(2),
      })
      .where(eq(attendanceRecords.id, attendanceId))
      .returning();

    return updatedRecord || undefined;
  }

  async startBreak(
    attendanceId: number,
  ): Promise<AttendanceRecord | undefined> {
    if (!this.db) {
      console.error(`❌ Database is undefined in startBreak`);
      throw new Error(`Database connection is not available`);
    }
    const [record] = await this.db
      .update(attendanceRecords)
      .set({ breakStart: new Date() })
      .where(eq(attendanceRecords.id, attendanceId))
      .returning();
    return record || undefined;
  }

  async endBreak(attendanceId: number): Promise<AttendanceRecord | undefined> {
    if (!this.db) {
      console.error(`❌ Database is undefined in endBreak`);
      throw new Error(`Database connection is not available`);
    }
    const [record] = await this.db
      .update(attendanceRecords)
      .set({ breakEnd: new Date() })
      .where(eq(attendanceRecords.id, attendanceId))
      .returning();
    return record || undefined;
  }

  async updateAttendanceStatus(
    id: number,
    status: string,
  ): Promise<AttendanceRecord | undefined> {
    if (!this.db) {
      console.error(`❌ Database is undefined in updateAttendanceStatus`);
      throw new Error(`Database connection is not available`);
    }
    const [record] = await this.db
      .update(attendanceRecords)
      .set({ status })
      .where(eq(attendanceRecords.id, id))
      .returning();
    return record || undefined;
  }

  // Tables
  async getTables(tenantDb?: any): Promise<Table[]> {
    const database = tenantDb || this.db;

    try {
      this.validateDatabase(database, 'getTables');
      return await database.select().from(tables).orderBy(tables.tableNumber);
    } catch (error) {
      console.error(`❌ Error in getTables:`, error);
      return [];
    }
  }

  async getTable(id: number, tenantDb?: any): Promise<Table | undefined> {
    const database = tenantDb || this.db;

    try {
      this.validateDatabase(database, 'getTable');
      const [table] = await database.select().from(tables).where(eq(tables.id, id));
      return table || undefined;
    } catch (error) {
      console.error(`❌ Error in getTable:`, error);
      return undefined;
    }
  }

  async getTableByNumber(tableNumber: string, tenantDb?: any): Promise<Table | undefined> {
    const database = tenantDb || this.db;

    try {
      this.validateDatabase(database, 'getTableByNumber');
      const [table] = await database
        .select()
        .from(tables)
        .where(eq(tables.tableNumber, tableNumber));
      return table || undefined;
    } catch (error) {
      console.error(`❌ Error in getTableByNumber:`, error);
      return undefined;
    }
  }

  async createTable(table: InsertTable, tenantDb?: any): Promise<Table> {
    const database = tenantDb || this.db;

    try {
      this.validateDatabase(database, 'createTable');
      const [newTable] = await database.insert(tables).values(table).returning();
      return newTable;
    } catch (error) {
      console.error(`❌ Error in createTable:`, error);
      throw error;
    }
  }

  async updateTable(
    id: number,
    table: Partial<InsertTable>,
    tenantDb?: any,
  ): Promise<Table | undefined> {
    const database = tenantDb || this.db;

    try {
      this.validateDatabase(database, 'updateTable');
      const [updatedTable] = await database
        .update(tables)
        .set(table)
        .where(eq(tables.id, id))
        .returning();
      return updatedTable || undefined;
    } catch (error) {
      console.error(`❌ Error in updateTable:`, error);
      return undefined;
    }
  }

  async updateTableStatus(
    id: number,
    status: string,
    tenantDb?: any,
  ): Promise<Table | undefined> {
    const database = tenantDb || this.db;

    try {
      this.validateDatabase(database, 'updateTableStatus');
      const [table] = await database
        .update(tables)
        .set({ status })
        .where(eq(tables.id, id))
        .returning();
      return table || undefined;
    } catch (error) {
      console.error(`❌ Error in updateTableStatus:`, error);
      return undefined;
    }
  }

  async deleteTable(id: number, tenantDb?: any): Promise<boolean> {
    const database = tenantDb || this.db;

    try {
      this.validateDatabase(database, 'deleteTable');
      const result = await database.delete(tables).where(eq(tables.id, id));
      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      console.error(`❌ Error in deleteTable:`, error);
      return false;
    }
  }

  // Orders
  async getOrders(
    tableId?: number,
    status?: string,
    tenantDb?: any,
    salesChannel?: string,
  ): Promise<any[]> {
    try {
      const database = this.getSafeDatabase(tenantDb, 'getOrders');

      let query = database.select().from(orders);

      const conditions = [];

      if (tableId) {
        conditions.push(eq(orders.tableId, tableId));
      }

      if (status) {
        conditions.push(eq(orders.status, status));
      }

      if (salesChannel) {
        conditions.push(eq(orders.salesChannel, salesChannel));
      }

      if (conditions.length > 0) {
        query = query.where(and(...conditions));
      }

      const result = await query.orderBy(desc(orders.orderedAt));
      console.log(`Storage: getOrders returned ${result?.length || 0} orders${salesChannel ? ` for channel: ${salesChannel}` : ''}`);
      return result || [];
    } catch (error) {
      console.error('Storage: getOrders error:', error);
      return [];
    }
  }


  async getOrder(id: number, tenantDb?: any): Promise<Order | undefined> {
    const database = tenantDb || this.db;

    try {
      this.validateDatabase(database, 'getOrder');
      const [order] = await database.select().from(orders).where(eq(orders.id, id));
      return order || undefined;
    } catch (error) {
      console.error(`❌ Error in getOrder:`, error);
      return undefined;
    }
  }

  async getOrderByNumber(orderNumber: string, tenantDb?: any): Promise<Order | undefined> {
    const database = tenantDb || this.db;

    try {
      this.validateDatabase(database, 'getOrderByNumber');
      const [order] = await database
        .select()
        .from(orders)
        .where(eq(orders.orderNumber, orderNumber));
      return order || undefined;
    } catch (error) {
      console.error(`❌ Error in getOrderByNumber:`, error);
      return undefined;
    }
  }

  async createOrder(orderData: any, orderItems: any[], tenantDb?: any): Promise<any> {
    try {
      const database = this.getSafeDatabase(tenantDb, 'createOrder');

      console.log(`📝 Creating order with data:`, orderData);

      // Ensure salesChannel is set properly
      if (!orderData.salesChannel) {
        orderData.salesChannel = orderData.tableId ? 'table' : 'pos';
      }

      console.log(`📝 Final order data with salesChannel: ${orderData.salesChannel}`, orderData);

      // Create the order - ensure proper field mapping (save discount without recalculating total)
      const orderInsertData = {
        orderNumber: orderData.orderNumber,
        tableId: orderData.tableId,
        employeeId: orderData.employeeId || null,
        status: orderData.status,
        customerName: orderData.customerName,
        customerCount: orderData.customerCount,
        subtotal: orderData.subtotal ? parseFloat(orderData.subtotal.toString()) : 0,
        tax: orderData.tax ? parseFloat(orderData.tax.toString()) : 0,
        discount: orderData.discount ? parseFloat(orderData.discount.toString()) : 0,
        total: orderData.total ? parseFloat(orderData.total.toString()) : 0,
        paymentMethod: orderData.paymentMethod,
        paymentStatus: orderData.paymentStatus,
        einvoiceStatus: orderData.einvoiceStatus || 0,
        salesChannel: orderData.salesChannel,
        notes: orderData.notes,
        paidAt: orderData.paidAt,
        orderedAt: new Date()
      };

      console.log(`📝 Final order insert data:`, orderInsertData);

      const [order] = await database
        .insert(orders)
        .values(orderInsertData)
        .returning();

      console.log(`Storage: Order created with ID ${order.id}, sales channel: ${order.salesChannel}`);

      // Create order items
      if (orderItems && orderItems.length > 0) {
        const itemsToInsert = orderItems.map((item: any) => ({
          orderId: order.id,
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.total,
          discount: item.discount || "0.00", // Map discount here
          notes: item.notes || null
        }));

        console.log(`Storage: Inserting ${itemsToInsert.length} order items`);
        const insertedItems = await database
          .insert(orderItemsTable)
          .values(itemsToInsert)
          .returning();

        console.log(`Storage: ${insertedItems.length} order items created`);

        // Update product stock for items that track inventory
        for (const item of orderItems) {
          const [product] = await database
            .select()
            .from(products)
            .where(eq(products.id, item.productId))
            .limit(1);

          if (product && product.trackInventory) {
            const newStock = Math.max(0, product.stock - item.quantity);
            await database
              .update(products)
              .set({ stock: newStock })
              .where(eq(products.id, item.productId));

            console.log(`Storage: Updated stock for product ${item.productId}: ${product.stock} -> ${newStock}`);
          }
        }
      }

      // Update table status if this is a table order
      if (orderData.tableId && orderData.salesChannel === "table") {
        await database
          .update(tables)
          .set({ status: "occupied" })
          .where(eq(tables.id, orderData.tableId));

        console.log(`Storage: Updated table ${orderData.tableId} status to occupied`);
      }

      return order;
    } catch (error) {
      console.error('Storage: createOrder error:', error);
      throw error;
    }
  }

  // @ts-ignore
  async updateOrder(
    id: number,
    orderData: Partial<{
      orderNumber: string;
      tableId: number | null;
      employeeId: number | null;
      status: string;
      customerName: string;
      customerCount: number;
      subtotal: string;
      tax: string;
      total: string;
      paymentMethod: string | null;
      paymentStatus: string;
      salesChannel: string;
      einvoiceStatus: number;
      templateNumber: string | null;
      symbol: string | null;
      invoiceNumber: string | null;
      invoiceId: number | null;
      notes: string | null;
      paidAt: Date | null;
      discount: string;
    }>,
    database?: any,
  ): Promise<Order | null> {
    const db = database || this.db;
    console.log(`💾 Storage: Starting order update for ID ${id} with data:`, orderData);

    // Fix timestamp handling - ensure Date objects
    if (orderData.paidAt && typeof orderData.paidAt === 'string') {
      orderData.paidAt = new Date(orderData.paidAt);
    }

    // NO calculation - use exact frontend values
    console.log(`✅ Storage: Saving exact frontend values without any calculation or modification`);

    const updateData = {
      ...orderData,
      updatedAt: new Date(),
    };

    console.log(`💾 Storage: Final update data for order ${id}:`, updateData);

    const [updatedOrder] = await db
      .update(orders)
      .set(updateData)
      .where(eq(orders.id, id))
      .returning();

    if (!updatedOrder) {
      console.error(`❌ Storage: No order returned after update for ID: ${id}`);
      return null;
    }

    console.log(`✅ Storage: Order ${id} updated successfully:`, {
      id: updatedOrder.id,
      orderNumber: updatedOrder.orderNumber,
      status: updatedOrder.status,
      subtotal: updatedOrder.subtotal,
      tax: updatedOrder.tax,
      discount: updatedOrder.discount,
      total: updatedOrder.total,
      paymentMethod: updatedOrder.paymentMethod,
      updatedAt: updatedOrder.updatedAt,
    });

    return updatedOrder;
  }


  // Validate database connection with comprehensive checks
  private validateDatabase(database: any, operation: string): void {
    if (!database) {
      console.error(`❌ Database is null/undefined in ${operation}`);
      throw new Error(`Database connection is not available for ${operation}`);
    }

    if (typeof database !== 'object') {
      console.error(`❌ Database is not an object in ${operation}:`, typeof database);
      throw new Error(`Invalid database type for ${operation}`);
    }

    if (!database.select || typeof database.select !== 'function') {
      console.error(`❌ Database missing select method in ${operation}`);
      console.error(`❌ Available methods:`, Object.keys(database));
      throw new Error(`Database connection is invalid - missing select method for ${operation}`);
    }

    if (!database.insert || typeof database.insert !== 'function') {
      console.error(`❌ Database missing insert method in ${operation}`);
      throw new Error(`Database connection is invalid - missing insert method for ${operation}`);
    }

    if (!database.update || typeof database.update !== 'function') {
      console.error(`❌ Database missing update method in ${operation}`);
      throw new Error(`Database connection is invalid - missing update method for ${operation}`);
    }
  }

  // Safe database query wrapper with enhanced error handling
  private async safeDbQuery<T>(
    queryFn: () => Promise<T>,
    fallbackValue: T,
    operation: string
  ): Promise<T> {
    try {
      console.log(`🔍 Executing safe database query for ${operation}`);
      const result = await queryFn();
      console.log(`✅ Safe database query completed successfully for ${operation}`);
      return result || fallbackValue;
    } catch (error) {
      console.error(`❌ Database error in ${operation}:`, {
        errorMessage: error?.message,
        errorType: error?.constructor?.name,
        errorStack: error?.stack
      });

      // Check if it's a connection error specifically
      if (error?.message?.includes('select') || error?.message?.includes('undefined')) {
        console.error(`❌ CRITICAL: Database connection lost during ${operation}`);
      }

      return fallbackValue;
    }
  }

  async updateOrderStatus(
    id: number | string,
    status: string,
    tenantDb?: any,
  ): Promise<Order | undefined> {
    console.log(`🚀 ========================================`);
    console.log(`🚀 STORAGE FUNCTION CALLED: updateOrderStatus`);
    console.log(`🚀 ========================================`);
    console.log(`📋 updateOrderStatus called with id: ${id}, status: ${status}`);
    console.log(`🔍 updateOrderStatus parameters: {`);
    console.log(`  id: ${id},`);
    console.log(`  idType: '${typeof id}',`);
    console.log(`  status: '${status}',`);
    console.log(`  statusType: '${typeof status}',`);
    console.log(`  tenantDb: ${!!tenantDb}`);
    console.log(`}`);

    // Handle temporary order IDs - return a success response to continue flow
    if (typeof id === 'string' && id.startsWith('temp-')) {
      console.log(`🟡 Temporary order ID detected: ${id} - allowing flow to continue to E-Invoice`);

      // Return a success order object that allows the flow to continue to E-Invoice modal
      const mockOrder = {
        id: id as any, // Keep the temp ID for reference
        orderNumber: `TEMP-${Date.now()}`,
        tableId: null,
        customerName: "Khách hàng",
        customerPhone: null,
        customerEmail: null,
        subtotal: "0.00",
        tax: "0.00",
        total: "0.00",
        status: status,
        paymentMethod: status === 'paid' ? 'cash' : null,
        paymentStatus: status === 'paid' ? 'paid' : 'pending',
        einvoiceStatus: 0, // Not published yet
        invoiceNumber: null,
        templateNumber: null,
        symbol: null,
        notes: `Temporary order - payment flow continuing to E-Invoice`,
        orderedAt: new Date(),
        paidAt: status === 'paid' ? new Date() : null,
        employeeId: null,
        salesChannel: 'pos',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      console.log(`✅ Mock order created for temporary ID - flow will continue to E-Invoice:`, {
        id: mockOrder.id,
        status: mockOrder.status,
        paymentMethod: mockOrder.paymentMethod,
        allowsContinuation: true
      });

      // @ts-ignore
      return mockOrder;
    }

    // Enhanced database validation with comprehensive error handling
    let database;
    try {
      database = this.getSafeDatabase(tenantDb, 'updateOrderStatus');

      // Additional runtime validation
      if (!database || typeof database !== 'object') {
        console.error(`❌ CRITICAL: Invalid database object in updateOrderStatus`);
        throw new Error(`Database connection is completely invalid`);
      }

      if (!database.select || typeof database.select !== 'function') {
        console.error(`❌ CRITICAL: Database missing select method in updateOrderStatus`);
        console.error(`❌ Available methods:`, Object.keys(database));
        throw new Error(`Database connection is missing required methods`);
      }

      if (!database.update || typeof database.update !== 'function') {
        console.error(`❌ CRITICAL: Database missing update method in updateOrderStatus`);
        throw new Error(`Database connection is missing update method`);
      }

      console.log(`✅ Database validation passed for updateOrderStatus`);

    } catch (dbError) {
      console.error(`❌ Database validation failed in updateOrderStatus:`, dbError);

      // Try to fall back to global db if tenant db is problematic
      if (tenantDb && this.db && typeof this.db === 'object' && this.db.select && this.db.update) {
        console.log(`🔄 Falling back to global database connection`);
        database = this.db;
      } else {
        console.error(`❌ No valid fallback database available`);
        throw new Error(`Database connection is completely unavailable: ${dbError.message}`);
      }
    }

    // Ensure id is a number for database operations
    const orderId = typeof id === 'string' ? parseInt(id) : id;
    if (isNaN(orderId)) {
      console.error(`❌ Invalid order ID: ${id}`);
      throw new Error(`Invalid order ID: ${id}`);
    }

    console.log(`🔍 Processing order ID: ${orderId} (type: ${typeof orderId})`);

    try {
      // First, get the current order to know its table
      console.log(`🔍 Fetching current order with ID: ${orderId}`);
      const result = await this.safeDbQuery(
        () => database.select().from(orders).where(eq(orders.id, orderId as number)),
        [],
        `fetchCurrentOrder-${orderId}`
      );
      const [currentOrder] = result;

      if (!currentOrder) {
        console.error(`❌ Order not found: ${orderId}`);
        console.log(`🔍 Attempting to fetch all orders to debug...`);
        try {
          const allOrders = await database.select().from(orders).limit(5);
          console.log(`🔍 Sample orders in database:`, allOrders.map(o => ({ id: o.id, orderNumber: o.orderNumber, status: o.status })));
        } catch (debugError) {
          console.error(`❌ Error fetching sample orders:`, debugError);
        }
        return undefined;
      }

      console.log(`📋 Current order before update:`, {
        id: currentOrder.id,
        orderNumber: currentOrder.orderNumber,
        tableId: currentOrder.tableId,
        currentStatus: currentOrder.status,
        requestedStatus: status,
        paidAt: currentOrder.paidAt,
        einvoiceStatus: currentOrder.einvoiceStatus
      });

      // Update the order status with additional paid timestamp if needed
      const updateData: any = {
        status,
        updatedAt: new Date()
      };

      if (status === "paid") {
        updateData.paidAt = new Date();
        console.log(`💳 Setting paidAt timestamp for order ${orderId}:`, updateData.paidAt);
      }

      console.log(`🔍 Update data being sent:`, updateData);
      console.log(`🔍 Update query targeting order ID: ${orderId}`);

      const queryStartTime = Date.now();
      console.log(`⏱️ DATABASE QUERY STARTED at:`, new Date().toISOString());

      const updateResult = await this.safeDbQuery(
        () => database.update(orders).set(updateData).where(eq(orders.id, orderId as number)).returning(),
        [],
        `updateOrderStatus-${orderId}`
      );
      const [order] = updateResult;

      const queryEndTime = Date.now();
      console.log(`⏱️ DATABASE QUERY COMPLETED in ${queryEndTime - queryEndTime}ms`);
      console.log(`🔍 Database query execution result:`, {
        queryDuration: `${queryEndTime - queryStartTime}ms`,
        rowsAffected: order ? 1 : 0,
        orderReturned: !!order,
        timestamp: new Date().toISOString()
      });

      if (!order) {
        console.error(`❌ No order returned after status update for ID: ${orderId}`);
        console.log(`🔍 Verifying order still exists...`);
        const [verifyOrder] = await database
          .select()
          .from(orders)
          .where(eq(orders.id, orderId as number));
        console.log(`🔍 Order verification result:`, verifyOrder ? 'EXISTS' : 'NOT FOUND');
        return undefined;
      }

      console.log(`✅ Order status updated successfully:`, {
        id: order.id,
        orderNumber: order.orderNumber,
        tableId: order.tableId,
        previousStatus: currentOrder.status,
        newStatus: order.status,
        paidAt: order.paidAt,
        updatedAt: order.updatedAt,
        einvoiceStatus: order.einvoiceStatus
      });

      // CRITICAL: Handle table status update when order is paid
      if (status === "paid" && order.tableId) {
        console.log(`💳 Order PAID - IMMEDIATELY processing table ${order.tableId} release`);
        console.log(`🔍 DEBUG: Table release process started:`, {
          orderId: orderId,
          tableId: order.tableId,
          newStatus: status,
          timestamp: new Date().toISOString()
        });

        try {
          // Import tables from schema
          const { tables } = await import("@shared/schema");
          console.log(`✅ Tables schema imported successfully`);

          // Check for other ACTIVE orders on the same table (excluding current order and paid/cancelled orders)
          const activeStatuses = ["pending", "confirmed", "preparing", "ready", "served"];
          console.log(`🔍 DEBUG: Checking for other active orders on table ${order.tableId}:`, {
            excludeOrderId: orderId,
            activeStatuses: activeStatuses,
            tableId: order.tableId
          });

          const otherActiveOrders = await database
            .select()
            .from(orders)
            .where(
              and(
                eq(orders.tableId, order.tableId),
                not(eq(orders.id, orderId as number)), // Exclude current order
                or(
                  ...activeStatuses.map(activeStatus => eq(orders.status, activeStatus))
                )
              )
            );

          console.log(`🔍 DEBUG: Query completed - found ${otherActiveOrders.length} other active orders`);

          console.log(`🔍 Active orders remaining on table ${order.tableId}:`, {
            count: otherActiveOrders.length,
            orders: otherActiveOrders.map(o => ({
              id: o.id,
              status: o.status,
              orderNumber: o.orderNumber
            }))
          });

          // Get current table status
          const [currentTable] = await database
            .select()
            .from(tables)
            .where(eq(tables.id, order.tableId));

          if (!currentTable) {
            console.error(`❌ Table ${order.tableId} not found`);
          } else {
            console.log(`📋 Current table status:`, {
              id: currentTable.id,
              tableNumber: currentTable.tableNumber,
              status: currentTable.status
            });

            // FORCE table release if no other active orders exist
            if (otherActiveOrders.length === 0) {
              console.log(`🔓 FORCING table ${order.tableId} release - no active orders remaining`);
              console.log(`🔍 DEBUG: Table release attempt:`, {
                tableId: order.tableId,
                currentTableStatus: currentTable.status,
                targetStatus: "available",
                updateTimestamp: new Date().toISOString()
              });

              const [updatedTable] = await database
                .update(tables)
                .set({
                  status: "available",
                  updatedAt: new Date()
                })
                .where(eq(tables.id, order.tableId))
                .returning();

              console.log(`🔍 DEBUG: Table update query result:`, {
                updatedTableExists: !!updatedTable,
                updatedTableData: updatedTable ? {
                  id: updatedTable.id,
                  tableNumber: updatedTable.tableNumber,
                  status: updatedTable.status,
                  updatedAt: updatedTable.updatedAt
                } : null
              });

              if (updatedTable) {
                console.log(`✅ Table ${order.tableId} FORCEFULLY released:`, {
                  id: updatedTable.id,
                  tableNumber: updatedTable.tableNumber,
                  previousStatus: currentTable.status,
                  newStatus: updatedTable.status,
                  updateSuccess: true
                });

                console.log(`🔍 DEBUG: Verifying table status after update...`);
                const [verifyTable] = await database
                  .select()
                  .from(tables)
                  .where(eq(tables.id, order.tableId));

                console.log(`🔍 DEBUG: Table verification result:`, {
                  tableFound: !!verifyTable,
                  verifiedStatus: verifyTable?.status,
                  verifiedUpdatedAt: verifyTable?.updatedAt
                });

              } else {
                console.error(`❌ CRITICAL: Failed to release table ${order.tableId} - no table returned`);
                console.log(`🔍 DEBUG: Table update failed - investigating...`);

                // Debug: Check if table exists
                const [checkTable] = await database
                  .select()
                  .from(tables)
                  .where(eq(tables.id, order.tableId));

                console.log(`🔍 DEBUG: Table existence check:`, {
                  tableExists: !!checkTable,
                  tableData: checkTable ? {
                    id: checkTable.id,
                    tableNumber: checkTable.tableNumber,
                    status: checkTable.status
                  } : null
                });
              }
            } else {
              console.log(`🔒 Table ${order.tableId} remains occupied due to ${otherActiveOrders.length} active orders:`);
              console.log(`🔍 DEBUG: Active orders preventing table release:`, {
                tableId: order.tableId,
                activeOrdersCount: otherActiveOrders.length,
                activeOrdersDetails: otherActiveOrders.map(o => ({
                  id: o.id,
                  orderNumber: o.orderNumber,
                  status: o.status
                }))
              });

              otherActiveOrders.forEach((activeOrder, index) => {
                console.log(`   ${index + 1}. Order ${activeOrder.orderNumber} (${activeOrder.status}) - ID: ${activeOrder.id}`);
              });
            }
          }
        } catch (tableError) {
          console.error(`❌ CRITICAL: Error processing table status update for table ${order.tableId}:`, tableError);
          console.log(`🔍 DEBUG: Table update error details:`, {
            errorType: tableError?.constructor?.name,
            errorMessage: tableError?.message,
            errorStack: tableError?.stack,
            tableId: order.tableId,
            orderId: orderId
          });
        }
      } else {
        console.log(`🔍 DEBUG: Order status is not 'paid' or no tableId - skipping table update:`, {
          orderStatus: status,
          tableId: order.tableId,
          isPaidStatus: status === "paid",
          hasTableId: !!order.tableId
        });
      }

      console.log(`🔍 DEBUG: Final order state before return:`, {
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        tableId: order.tableId,
        paidAt: order.paidAt,
        updatedAt: order.updatedAt,
        updateSuccess: true
      });
      return order;
    } catch (error) {
      console.error(`❌ Error updating order status:`, error);
      console.log(`🔍 DEBUG: Storage layer error details:`, {
        errorType: error?.constructor?.name,
        errorMessage: error?.message,
        errorStack: error?.stack,
        orderId: orderId,
        requestedStatus: status,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  async addOrderItems(
    orderId: number,
    items: InsertOrderItem[],
  ): Promise<OrderItem[]> {
    if (!this.db) {
      console.error(`❌ Database is undefined in addOrderItems`);
      throw new Error(`Database connection is not available`);
    }
    const itemsWithOrderId = items.map((item) => ({ ...item, orderId }));
    return await this.db.insert(orderItemsTable).values(itemsWithOrderId).returning();
  }

  async removeOrderItem(itemId: number): Promise<boolean> {
    if (!this.db) {
      console.error(`❌ Database is undefined in removeOrderItem`);
      throw new Error(`Database connection is not available`);
    }
    const result = await this.db.delete(orderItemsTable).where(eq(orderItemsTable.id, itemId));
    return (result.rowCount ?? 0) > 0;
  }

  async deleteOrderItem(itemId: number, tenantDb?: any): Promise<boolean> {
    const database = tenantDb || this.db;
    if (!database) {
      console.error(`❌ Database is undefined in deleteOrderItem`);
      throw new Error(`Database connection is not available`);
    }
    const result = await database.delete(orderItemsTable).where(eq(orderItemsTable.id, itemId));
    return (result.rowCount ?? 0) > 0;
  }

  async getOrderItems(orderId: number, tenantDb?: any): Promise<OrderItem[]> {
    const database = tenantDb || this.db;
    if (!database) {
      console.error(`❌ Database is undefined in getOrderItems`);
      throw new Error(`Database connection is not available`);
    }

    try {
      console.log(`🔍 Storage: Fetching order items for order ID ${orderId}`);

      if (!orderId || isNaN(orderId)) {
        console.error(`❌ Invalid order ID: ${orderId}`);
        return [];
      }

      const items = await database
        .select({
          id: orderItemsTable.id,
          orderId: orderItemsTable.orderId,
          productId: orderItemsTable.productId,
          quantity: orderItemsTable.quantity,
          unitPrice: orderItemsTable.unitPrice,
          total: orderItemsTable.total,
          discount: orderItemsTable.discount,
          notes: orderItemsTable.notes,
          productName: sql<string>`COALESCE(${products.name}, 'Unknown Product')`,
          productSku: sql<string>`COALESCE(${products.sku}, '')`,
        })
        .from(orderItemsTable)
        .leftJoin(products, eq(orderItemsTable.productId, products.id))
        .where(eq(orderItemsTable.orderId, orderId));

      console.log(`✅ Storage: Found ${items.length} order items for order ${orderId}`);
      return Array.isArray(items) ? items : [];
    } catch (error) {
      console.error(`❌ Storage error fetching order items for order ${orderId}:`, error);
      console.error("Error details:", {
        message: error?.message || 'Unknown error',
        code: error?.code || 'No code',
        stack: error?.stack || 'No stack'
      });

      // Return empty array instead of throwing to prevent 500 errors
      return [];
    }
  }

  // Inventory Management
  async updateInventoryStock(
    productId: number,
    quantity: number,
    type: "add" | "subtract" | "set",
    notes?: string,
  ): Promise<Product | undefined> {
    if (!this.db) {
      console.error(`❌ Database is undefined in updateInventoryStock`);
      throw new Error(`Database connection is not available`);
    }
    const product = await this.getProduct(productId);
    if (!product) return undefined;

    let newStock: number;

    switch (type) {
      case "add":
        newStock = product.stock + quantity;
        break;
      case "subtract":
        newStock = Math.max(0, product.stock - quantity);
        break;
      case "set":
        newStock = quantity;
        break;
      default:
        return undefined;
    }

    const [updatedProduct] = await this.db
      .update(products)
      .set({ stock: newStock })
      .where(eq(products.id, productId))
      .returning();

    return updatedProduct || undefined;
  }

  // Store Settings
  async getStoreSettings(tenantDb?: any): Promise<StoreSettings> {
    const database = tenantDb || this.db;
    if (!database) {
      console.error(`❌ Database is undefined in getStoreSettings`);
      throw new Error(`Database connection is not available`);
    }
    const [settings] = await database.select().from(storeSettings).limit(1);

    // If no settings exist, create default settings
    if (!settings) {
      const [newSettings] = await database
        .insert(storeSettings)
        .values({
          storeName: "EDPOS 레스토랑",
          storeCode: "STORE001",
          businessType: "restaurant",
          openTime: "09:00",
          closeTime: "22:00",
        })
        .returning();
      return newSettings;
    }

    return settings;
  }

  async updateStoreSettings(
    settings: Partial<InsertStoreSettings>,
    tenantDb?: any,
  ): Promise<StoreSettings> {
    const database = tenantDb || this.db;
    if (!database) {
      console.error(`❌ Database is undefined in updateStoreSettings`);
      throw new Error(`Database connection is not available`);
    }
    const currentSettings = await this.getStoreSettings(tenantDb);

    const [updatedSettings] = await database
      .update(storeSettings)
      .set({ ...settings, updatedAt: new Date() })
      .where(eq(storeSettings.id, currentSettings.id))
      .returning();

    return updatedSettings;
  }

  // Suppliers
  async getSuppliers(): Promise<any> {
    if (!this.db) {
      console.error(`❌ Database is undefined in getSuppliers`);
      throw new Error(`Database connection is not available`);
    }
    return await this.db.select().from(suppliers).orderBy(suppliers.name);
  }

  async getSupplier(id: number): Promise<any> {
    if (!this.db) {
      console.error(`❌ Database is undefined in getSupplier`);
      throw new Error(`Database connection is not available`);
    }
    const [result] = await this.db
      .select()
      .from(suppliers)
      .where(eq(suppliers.id, id));
    return result;
  }

  async getSuppliersByStatus(status: string): Promise<any> {
    if (!this.db) {
      console.error(`❌ Database is undefined in getSuppliersByStatus`);
      throw new Error(`Database connection is not available`);
    }
    return await this.db
      .select()
      .from(suppliers)
      .where(eq(suppliers.status, status))
      .orderBy(suppliers.name);
  }

  async searchSuppliers(query: string): Promise<any> {
    if (!this.db) {
      console.error(`❌ Database is undefined in searchSuppliers`);
      throw new Error(`Database connection is not available`);
    }
    return await this.db
      .select()
      .from(suppliers)
      .where(
        or(
          ilike(suppliers.name, `%${query}%`),
          ilike(suppliers.code, `%${query}%`),
          ilike(suppliers.contactPerson, `%${query}%`),
        ),
      )
      .orderBy(suppliers.name);
  }

  async createSupplier(data: InsertSupplier): Promise<any> {
    if (!this.db) {
      console.error(`❌ Database is undefined in createSupplier`);
      throw new Error(`Database connection is not available`);
    }
    const [result] = await this.db.insert(suppliers).values(data).returning();
    return result;
  }

  async updateSupplier(
    id: number,
    data: Partial<InsertSupplier>,
  ): Promise<any> {
    if (!this.db) {
      console.error(`❌ Database is undefined in updateSupplier`);
      throw new Error(`Database connection is not available`);
    }
    const [result] = await this.db
      .update(suppliers)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(suppliers.id, id))
      .returning();

    return result;
  }

  async deleteSupplier(id: number): Promise<boolean> {
    if (!this.db) {
      console.error(`❌ Database is undefined in deleteSupplier`);
      throw new Error(`Database connection is not available`);
    }
    const result = await this.db
      .delete(suppliers)
      .where(eq(suppliers.id, id))
      .returning();
    return result.length > 0;
  }

  // Customers
  async getCustomers(tenantDb?: any): Promise<Customer[]> {
    const database = tenantDb || this.db;
    if (!database) {
      console.error(`❌ Database is undefined in getCustomers`);
      throw new Error(`Database connection is not available`);
    }

    // Get membership thresholds
    const thresholds = await this.getMembershipThresholds();

    // Get all customers
    const allCustomers = await database
      .select()
      .from(customers)
      .orderBy(customers.name);

    // Update membership levels based on spending
    const updatedCustomers = [];
    for (const customer of allCustomers) {
      const totalSpent = parseFloat(customer.totalSpent || "0");
      const calculatedLevel = this.calculateMembershipLevel(
        totalSpent,
        thresholds.GOLD,
        thresholds.VIP,
      );

      // Update if membership level has changed
      if (customer.membershipLevel !== calculatedLevel) {
        const [updatedCustomer] = await database
          .update(customers)
          .set({
            membershipLevel: calculatedLevel,
            updatedAt: new Date(),
          })
          .where(eq(customers.id, customer.id))
          .returning();
        updatedCustomers.push(updatedCustomer);
      } else {
        updatedCustomers.push(customer);
      }
    }

    return updatedCustomers;
  }

  async searchCustomers(query: string): Promise<Customer[]> {
    if (!this.db) {
      console.error(`❌ Database is undefined in searchCustomers`);
      throw new Error(`Database connection is not available`);
    }
    return await this.db
      .select()
      .from(customers)
      .where(
        or(
          ilike(customers.name, `%${query}%`),
          ilike(customers.customerId, `%${query}%`),
          ilike(customers.phone, `%${query}%`),
          ilike(customers.email, `%${query}%`),
        ),
      )
      .orderBy(customers.name);
  }

  async getCustomer(id: number): Promise<Customer | undefined> {
    if (!this.db) {
      console.error(`❌ Database is undefined in getCustomer`);
      throw new Error(`Database connection is not available`);
    }
    const [result] = await this.db
      .select()
      .from(customers)
      .where(eq(customers.id, id));
    return result || undefined;
  }

  async getCustomerByCustomerId(
    customerId: string,
  ): Promise<Customer | undefined> {
    if (!this.db) {
      console.error(`❌ Database is undefined in getCustomerByCustomerId`);
      throw new Error(`Database connection is not available`);
    }
    const [result] = await this.db
      .select()
      .from(customers)
      .where(eq(customers.customerId, customerId));
    return result || undefined;
  }

  async createCustomer(customerData: InsertCustomer): Promise<Customer> {
    if (!this.db) {
      console.error(`❌ Database is undefined in createCustomer`);
      throw new Error(`Database connection is not available`);
    }
    // Generate customer ID if not provided
    if (!customerData.customerId) {
      const count = await this.db
        .select({ count: sql<number>`count(*)` })
        .from(customers);
      const customerCount = count[0]?.count || 0;
      customerData.customerId = `CUST${String(customerCount + 1).padStart(3, "0")}`;
    }

    const [result] = await this.db
      .insert(customers)
      .values(customerData)
      .returning();
    return result;
  }

  async updateCustomer(
    id: number,
    customerData: Partial<InsertCustomer>,
  ): Promise<Customer | undefined> {
    if (!this.db) {
      console.error(`❌ Database is undefined in updateCustomer`);
      throw new Error(`Database connection is not available`);
    }
    const [result] = await this.db
      .update(customers)
      .set({ ...customerData, updatedAt: new Date() })
      .where(eq(customers.id, id))
      .returning();
    return result || undefined;
  }

  async deleteCustomer(id: number): Promise<boolean> {
    if (!this.db) {
      console.error(`❌ Database is undefined in deleteCustomer`);
      throw new Error(`Database connection is not available`);
    }
    const result = await this.db
      .delete(customers)
      .where(eq(customers.id, id))
      .returning();
    return result.length > 0;
  }

  async updateCustomerVisit(
    customerId: number,
    amount: number,
    points: number,
  ) {
    if (!this.db) {
      console.error(`❌ Database is undefined in updateCustomerVisit`);
      throw new Error(`Database connection is not available`);
    }
    const [customer] = await this.db
      .select()
      .from(customers)
      .where(eq(customers.id, customerId));

    if (!customer) {
      throw new Error("Customer not found");
    }

    const newTotalSpent = parseFloat(customer.totalSpent || "0") + amount;
    const newVisitCount = (customer.visitCount || 0) + 1;
    const newPoints = (customer.points || 0) + points;

    // Get membership thresholds and calculate new level
    const thresholds = await this.getMembershipThresholds();
    const newMembershipLevel = this.calculateMembershipLevel(
      newTotalSpent,
      thresholds.GOLD,
      thresholds.VIP,
    );

    const [updated] = await this.db
      .update(customers)
      .set({
        visitCount: newVisitCount,
        totalSpent: newTotalSpent.toString(),
        points: newPoints,
        membershipLevel: newMembershipLevel,
        updatedAt: new Date(),
      })
      .where(eq(customers.id, customerId))
      .returning();

    return updated;
  }

  // Point Management Methods
  async getCustomerPoints(
    customerId: number,
  ): Promise<{ points: number } | undefined> {
    if (!this.db) {
      console.error(`❌ Database is undefined in getCustomerPoints`);
      throw new Error(`Database connection is not available`);
    }
    const customer = await this.getCustomer(customerId);
    if (!customer) return undefined;
    return { points: customer.points || 0 };
  }

  async updateCustomerPoints(
    customerId: number,
    points: number,
    description: string,
    type: "earned" | "redeemed" | "adjusted",
    employeeId?: number,
    orderId?: number,
  ): Promise<PointTransaction> {
    if (!this.db) {
      console.error(`❌ Database is undefined in updateCustomerPoints`);
      throw new Error(`Database connection is not available`);
    }
    const customer = await this.getCustomer(customerId);
    if (!customer) throw new Error("Customer not found");

    const previousBalance = customer.points || 0;
    let pointChange = points;

    // For redeemed points, make sure it's negative
    if (type === "redeemed" && pointChange > 0) {
      pointChange = -pointChange;
    }

    const newBalance = previousBalance + pointChange;

    // Ensure customer doesn't go below 0 points for redemption
    if (newBalance < 0) {
      throw new Error("Insufficient points balance");
    }

    // Update customer points
    await this.db
      .update(customers)
      .set({
        points: newBalance,
        updatedAt: new Date(),
      })
      .where(eq(customers.id, customerId));

    // Create point transaction record
    const [pointTransaction] = await this.db
      .insert(pointTransactions)
      .values({
        customerId,
        type,
        points: pointChange,
        description,
        orderId,
        employeeId,
        previousBalance,
        newBalance,
      })
      .returning();

    return pointTransaction;
  }

  async getPointHistory(
    customerId: number,
    limit: number = 50,
  ): Promise<PointTransaction[]> {
    if (!this.db) {
      console.error(`❌ Database is undefined in getPointHistory`);
      throw new Error(`Database connection is not available`);
    }
    return await this.db
      .select()
      .from(pointTransactions)
      .where(eq(pointTransactions.customerId, customerId))
      .orderBy(sql`${pointTransactions.createdAt} DESC`)
      .limit(limit);
  }

  async getAllPointTransactions(
    limit: number = 100,
  ): Promise<PointTransaction[]> {
    if (!this.db) {
      console.error(`❌ Database is undefined in getAllPointTransactions`);
      throw new Error(`Database connection is not available`);
    }
    return await this.db
      .select()
      .from(pointTransactions)
      .orderBy(sql`${pointTransactions.createdAt} DESC`)
      .limit(limit);
  }

  // Get membership thresholds
  async getMembershipThresholds(): Promise<{ GOLD: number; VIP: number }> {
    if (!this.db) {
      console.error(`❌ Database is undefined in getMembershipThresholds`);
      throw new Error(`Database connection is not available`);
    }
    try {
      const [settings] = await this.db.select().from(storeSettings).limit(1);

      if (!settings) {
        // Return default values if no settings exist
        return { GOLD: 300000, VIP: 1000000 };
      }

      // Parse thresholds from settings or return defaults
      const goldThreshold =
        parseInt(settings.goldThreshold as string) || 300000;
      const vipThreshold = parseInt(settings.vipThreshold as string) || 1000000;

      return { GOLD: goldThreshold, VIP: vipThreshold };
    } catch (error) {
      console.error("Error fetching membership thresholds:", error);
      return { GOLD: 300000, VIP: 1000000 };
    }
  }

  // Calculate membership level based on total spent
  private calculateMembershipLevel(
    totalSpent: number,
    goldThreshold: number,
    vipThreshold: number,
  ): string {
    if (totalSpent >= vipThreshold) return "VIP";
    if (totalSpent >= goldThreshold) return "GOLD";
    return "SILVER";
  }

  async updateMembershipThresholds(thresholds: {
    GOLD: number;
    VIP: number;
  }): Promise<{ GOLD: number; VIP: number }> {
    if (!this.db) {
      console.error(`❌ Database is undefined in updateMembershipThresholds`);
      throw new Error(`Database connection is not available`);
    }
    try {
      // Update or insert store settings with thresholds
      const currentSettings = await this.getStoreSettings();

      await this.db
        .update(storeSettings)
        .set({
          goldThreshold: thresholds.GOLD.toString(),
          vipThreshold: thresholds.VIP.toString(),
          updatedAt: new Date(),
        })
        .where(eq(storeSettings.id, currentSettings.id));

      // Recalculate all customer membership levels with new thresholds
      await this.recalculateAllMembershipLevels(
        thresholds.GOLD,
        thresholds.VIP,
      );

      return thresholds;
    } catch (error) {
      console.error("Error updating membership thresholds:", error);
      throw error;
    }
  }

  // Recalculate membership levels for all customers
  async recalculateAllMembershipLevels(
    goldThreshold: number,
    vipThreshold: number,
  ) {
    if (!this.db) {
      console.error(`❌ Database is undefined in recalculateAllMembershipLevels`);
      throw new Error(`Database connection is not available`);
    }
    const allCustomers = await this.db.select().from(customers);

    for (const customer of allCustomers) {
      const totalSpent = parseFloat(customer.totalSpent || "0");
      const calculatedLevel = this.calculateMembershipLevel(
        totalSpent,
        goldThreshold,
        vipThreshold,
      );

      if (customer.membershipLevel !== calculatedLevel) {
        await this.db
          .update(customers)
          .set({
            membershipLevel: calculatedLevel,
            updatedAt: new Date(),
          })
          .where(eq(customers.id, customer.id));
      }
    }
  }

  async getAllProducts(includeInactive: boolean = false, tenantDb?: any): Promise<Product[]> {
    try {
      const database = this.getSafeDatabase(tenantDb, 'getAllProducts');
      let result;
      if (includeInactive) {
        result = await database.select().from(products).orderBy(products.name);
      } else {
        result = await database
          .select()
          .from(products)
          .where(eq(products.isActive, true))
          .orderBy(products.name);
      }

      // Ensure afterTaxPrice is properly returned
      return result.map((product) => ({
        ...product,
        afterTaxPrice: product.afterTaxPrice || null
      }));
    } catch (error) {
      console.error(`❌ Error in getAllProducts:`, error);
      return [];
    }
  }

  async getActiveProducts(tenantDb?: any): Promise<Product[]> {
    const database = tenantDb || this.db;
    if (!database) {
      console.error(`❌ Database is undefined in getActiveProducts`);
      throw new Error(`Database connection is not available`);
    }
    const result = await database
      .select()
      .from(products)
      .where(eq(products.isActive, true))
      .orderBy(products.name);

    // Ensure afterTaxPrice is properly returned
    return result.map((product) => ({
      ...product,
      afterTaxPrice: product.afterTaxPrice || null
    }));
  }

  // @ts-ignore
  async createProduct(productData: Omit<Product, "id">): Promise<Product> {
    if (!this.db) {
      console.error(`❌ Database is undefined in createProduct`);
      throw new Error(`Database connection is not available`);
    }
    const [product] = await this.db
      .insert(products)
      .values({
        ...productData,
        productType: productData.productType || 1,
      })
      .returning();
    return product;
  }

  // Invoice template methods
  async getInvoiceTemplates(tenantDb: any = null): Promise<any[]> {
    const database = tenantDb || db;
    try {
      const templates = await database
        .select()
        .from(invoiceTemplates)
        .orderBy(desc(invoiceTemplates.id));
      return templates;
    } catch (error) {
      console.error("Error fetching invoice templates:", error);
      return [];
    }
  }

  async getActiveInvoiceTemplates(tenantDb: any = null): Promise<any[]> {
    const database = tenantDb || db;
    try {
      const templates = await database
        .select()
        .from(invoiceTemplates)
        .where(eq(invoiceTemplates.isDefault, true))
        .orderBy(desc(invoiceTemplates.id));
      return templates;
    } catch (error) {
      console.error("Error fetching active invoice templates:", error);
      return [];
    }
  }

  async createInvoiceTemplate(templateData: any, tenantDb: any = null): Promise<any> {
    const database = tenantDb || db;
    try {
      const [template] = await database
        .insert(invoiceTemplates)
        .values({
          name: templateData.name,
          templateNumber: templateData.templateNumber,
          templateCode: templateData.templateCode || null,
          symbol: templateData.symbol,
          useCK: templateData.useCK !== false,
          notes: templateData.notes || null,
          isDefault: templateData.isDefault || false,
          createdAt: new Date(),
        })
        .returning();
      return template;
    } catch (error) {
      console.error("Error creating invoice template:", error);
      throw error;
    }
  }

  async updateInvoiceTemplate(id: number, templateData: any, tenantDb: any = null): Promise<any> {
    const database = tenantDb || db;
    try {
      const [template] = await database
        .update(invoiceTemplates)
        .set({
          name: templateData.name,
          templateNumber: templateData.templateNumber,
          templateCode: templateData.templateCode || null,
          symbol: templateData.symbol,
          useCK: templateData.useCK !== false,
          notes: templateData.notes || null,
          isDefault: templateData.isDefault || false,
          updatedAt: new Date(),
        })
        .where(eq(invoiceTemplates.id, id))
        .returning();
      return template;
    } catch (error) {
      console.error("Error updating invoice template:", error);
      throw error;
    }
  }

  async deleteInvoiceTemplate(id: number, tenantDb: any = null): Promise<boolean> {
    const database = tenantDb || db;
    try {
      const [deleted] = await database
        .delete(invoiceTemplates)
        .where(eq(invoiceTemplates.id, id))
        .returning();
      return !!deleted;
    } catch (error) {
      console.error("Error deleting invoice template:", error);
      throw error;
    }
  }

  // Invoice methods
  async getInvoices(tenantDb?: any): Promise<any[]> {
    const database = tenantDb || this.db;
    return await database.select().from(invoices).orderBy(desc(invoices.createdAt));
  }

  async getInvoice(id: number, tenantDb?: any): Promise<any> {
    const database = tenantDb || this.db;
    const [invoice] = await database.select().from(invoices).where(eq(invoices.id, id));

    if (!invoice) return null;

    // Get invoice items
    const items = await database.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, id));

    return {
      ...invoice,
      items: items
    };
  }

  async createInvoice(invoiceData: any, tenantDb?: any): Promise<any> {
    const database = tenantDb || this.db;

    console.log('💾 Creating invoice in database:', invoiceData);

    try {
      // Handle date conversion properly
      let invoiceDate = new Date();
      if (invoiceData.invoiceDate) {
        if (invoiceData.invoiceDate instanceof Date) {
          invoiceDate = invoiceData.invoiceDate;
        } else if (typeof invoiceData.invoiceDate === 'string') {
          invoiceDate = new Date(invoiceData.invoiceDate);
        }
      }

      // Insert invoice
      const [invoice] = await database.insert(invoices).values({
        invoiceNumber: invoiceData.invoiceNumber || null,
        templateNumber: invoiceData.templateNumber || null,
        symbol: invoiceData.symbol || null,
        customerName: invoiceData.customerName,
        customerTaxCode: invoiceData.customerTaxCode || null,
        customerAddress: invoiceData.customerAddress || null,
        customerPhone: invoiceData.customerPhone || null,
        customerEmail: invoiceData.customerEmail || null,
        subtotal: invoiceData.subtotal,
        tax: invoiceData.tax,
        total: invoiceData.total,
        paymentMethod: invoiceData.paymentMethod || 1,
        invoiceDate: invoiceDate,
        status: invoiceData.status || 'draft',
        einvoiceStatus: invoiceData.einvoiceStatus || 0,
        notes: invoiceData.notes || null
      }).returning();

      console.log('✅ Invoice created:', invoice);

      // Insert invoice items if provided
      if (invoiceData.items && Array.isArray(invoiceData.items) && invoiceData.items.length > 0) {
        const itemsToInsert = invoiceData.items.map((item: any) => ({
          invoiceId: invoice.id,
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.total,
          taxRate: item.taxRate || "0.00"
        }));

        await database.insert(invoiceItems).values(itemsToInsert);
        console.log(`✅ Inserted ${itemsToInsert.length} invoice items`);
      }

      return invoice;
    } catch (error) {
      console.error('❌ Error creating invoice:', error);
      throw error;
    }
  }

  async updateInvoice(id: number, updateData: any, tenantDb?: any): Promise<any> {
    const database = tenantDb || this.db;

    const [invoice] = await database.update(invoices)
      .set({
        ...updateData,
        updatedAt: new Date()
      })
      .where(eq(invoices.id, id))
      .returning();

    return invoice;
  }

  async deleteInvoice(id: number, tenantDb?: any): Promise<boolean> {
    const database = tenantDb || this.db;

    // Delete invoice items first
    await database.delete(invoiceItems).where(eq(invoiceItems.invoiceId, id));

    // Delete invoice
    const result = await database.delete(invoices).where(eq(invoices.id, id));

    return result.rowCount > 0;
  }

  // E-invoice connections methods
  async getEInvoiceConnections(): Promise<any[]> {
    if (!this.db) {
      console.error(`❌ Database is undefined in getEInvoiceConnections`);
      throw new Error(`Database connection is not available`);
    }
    try {
      const { eInvoiceConnections } = await import("@shared/schema");
      return await this.db
        .select()
        .from(eInvoiceConnections)
        .orderBy(eInvoiceConnections.symbol);
    } catch (error) {
      console.error("Error fetching e-invoice connections:", error);
      return [];
    }
  }

  async getEInvoiceConnection(id: number): Promise<any> {
    if (!this.db) {
      console.error(`❌ Database is undefined in getEInvoiceConnection`);
      throw new Error(`Database connection is not available`);
    }
    try {
      const { eInvoiceConnections } = await import("@shared/schema");
      const [result] = await this.db
        .select()
        .from(eInvoiceConnections)
        .where(eq(eInvoiceConnections.id, id));
      return result;
    } catch (error) {
      console.error("Error fetching e-invoice connection:", error);
      return null;
    }
  }

  async createEInvoiceConnection(data: any): Promise<any> {
    if (!this.db) {
      console.error(`❌ Database is undefined in createEInvoiceConnection`);
      throw new Error(`Database connection is not available`);
    }
    try {
      const { eInvoiceConnections } = await import("@shared/schema");

      // Generate next symbol number
      const existingConnections = await this.getEInvoiceConnections();
      const nextSymbol = (existingConnections.length + 1).toString();

      const [result] = await this.db
        .insert(eInvoiceConnections)
        .values({
          ...data,
          symbol: nextSymbol,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
      return result;
    } catch (error) {
      console.error("Error creating e-invoice connection:", error);
      throw error;
    }
  }

  async updateEInvoiceConnection(id: number, data: any): Promise<any> {
    if (!this.db) {
      console.error(`❌ Database is undefined in updateEInvoiceConnection`);
      throw new Error(`Database connection is not available`);
    }
    try {
      const { eInvoiceConnections } = await import("@shared/schema");
      const [result] = await this.db
        .update(eInvoiceConnections)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(eInvoiceConnections.id, id))
        .returning();
      return result;
    } catch (error) {
      console.error("Error updating e-invoice connection:", error);
      throw error;
    }
  }

  async deleteEInvoiceConnection(id: number): Promise<boolean> {
    if (!this.db) {
      console.error(`❌ Database is undefined in deleteEInvoiceConnection`);
      throw new Error(`Database connection is not available`);
    }
    try {
      const { eInvoiceConnections } = await import("@shared/schema");
      const result = await this.db
        .delete(eInvoiceConnections)
        .where(eq(eInvoiceConnections.id, id))
        .returning();
      return result.length > 0;
    } catch (error) {
      console.error("Error deleting e-invoice connection:", error);
      return false;
    }
  }

  async getEmployeeByEmail(email: string): Promise<Employee | undefined> {
    if (!this.db) {
      console.error(`❌ Database is undefined in getEmployeeByEmail`);
      throw new Error(`Database connection is not available`);
    }
    if (email && email.trim() !== "") {
      const [employee] = await this.db
        .select()
        .from(employees)
        .where(eq(employees.email, email));

      return employee || undefined;
    }
    return undefined;
  }

  // New function to get attendance records by date range
  async getAttendanceRecordsByRange(startDate: string, endDate: string, tenantDb?: any): Promise<AttendanceRecord[]> {
    const database = tenantDb || this.db;

    try {
      this.validateDatabase(database, 'getAttendanceRecordsByRange');
      console.log(`🔍 Getting attendance records for date range: ${startDate} to ${endDate}`);

      // Ensure dates are valid and set to start/end of day
      const startOfRange = new Date(startDate);
      if (isNaN(startOfRange.getTime())) {
        throw new Error(`Invalid start date provided: ${startDate}`);
      }
      startOfRange.setHours(0, 0, 0, 0);

      const endOfRange = new Date(endDate);
      if (isNaN(endOfRange.getTime())) {
        throw new Error(`Invalid end date provided: ${endDate}`);
      }
      endOfRange.setHours(23, 59, 59, 999);

      console.log(`🔍 Date range for query: ${startOfRange.toISOString()} to ${endOfRange.toISOString()}`);

      const records = await database.select()
        .from(attendanceRecords)
        .where(
          and(
            gte(attendanceRecords.clockIn, startOfRange),
            lte(attendanceRecords.clockIn, endOfRange)
          )
        )
        .orderBy(attendanceRecords.clockIn);

      console.log(`✅ Found ${records.length} attendance records in date range`);
      return records;
    } catch (error) {
      console.error('Error fetching attendance records by range:', error);
      // Re-throw the error to be handled by the caller
      throw error;
    }
  }

  // Printer configuration management
  async getPrinterConfigs(tenantDb?: any): Promise<PrinterConfig[]> {
    const database = tenantDb || db;
    console.log("🔍 Storage: Fetching all printer configs (active and inactive)");

    try {
      const configs = await database.select().from(printerConfigs).orderBy(printerConfigs.id);
      console.log(`✅ Storage: Found ${configs.length} printer configs`);
      return configs;
    } catch (error) {
      console.error("❌ Storage: Error fetching printer configs:", error);
      return [];
    }
  }

  async createPrinterConfig(configData: any, tenantDb?: any): Promise<PrinterConfig> {
    const database = tenantDb || db;
    const [config] = await database.insert(printerConfigs).values(configData).returning();
    return config;
  }

  async updatePrinterConfig(id: number, configData: any, tenantDb?: any): Promise<PrinterConfig | null> {
    const database = tenantDb || db;
    const [config] = await database
      .update(printerConfigs)
      .set({ ...configData, updatedAt: new Date() })
      .where(eq(printerConfigs.id, id))
      .returning();
    return config || null;
  }

  async deletePrinterConfig(id: number, tenantDb?: any): Promise<boolean> {
    const database = tenantDb || db;
    const result = await database
      .delete(printerConfigs)
      .where(eq(printerConfigs.id, id));
    return result.rowCount > 0;
  }
}

export const storage = new DatabaseStorage();