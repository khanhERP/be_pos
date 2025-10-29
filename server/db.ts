import * as schema from "@shared/schema";
import {
  customers
} from "@shared/schema";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

// Load environment variables from .env file with higher priority
import { config } from "dotenv";
import path from "path";

// Load .env.local first, then override with .env to ensure .env has priority
config({ path: path.resolve(".env.local") });
config({ path: path.resolve(".env") });

// Use EXTERNAL_DB_URL first, then fallback to CUSTOM_DATABASE_URL, then DATABASE_URL
let DATABASE_URL = process.env.EXTERNAL_DB_URL || process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Ensure we're using the correct database and SSL settings for external server
if (DATABASE_URL?.includes("1.55.212.135")) {
  if (!DATABASE_URL.includes("sslmode=disable")) {
    DATABASE_URL += DATABASE_URL.includes("?")
      ? "&sslmode=disable"
      : "?sslmode=disable";
  }
}

export const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  ssl: DATABASE_URL?.includes("1.55.212.135")
    ? false // Disable SSL for external server
    : DATABASE_URL?.includes("neon")
      ? { rejectUnauthorized: false }
      : undefined,
});

// Log database connection info with detailed debugging
console.log("🔍 Environment check:");
console.log("  - NODE_ENV:", process.env.NODE_ENV);
console.log(
  "  - CUSTOM_DATABASE_URL exists:",
  !!process.env.CUSTOM_DATABASE_URL,
);
console.log("  - DATABASE_URL exists:", !!process.env.DATABASE_URL);
console.log("  - EXTERNAL_DB_URL exists:", !!process.env.EXTERNAL_DB_URL);
console.log(
  "  - Using URL:",
  process.env.EXTERNAL_DB_URL
    ? "EXTERNAL_DB_URL"
    : process.env.CUSTOM_DATABASE_URL
      ? "CUSTOM_DATABASE_URL"
      : "DATABASE_URL",
);
console.log(
  "  - DATABASE_URL preview:",
  DATABASE_URL?.substring(0, 50) + "...",
);
console.log(
  "  - DATABASE_URL full (masked):",
  DATABASE_URL?.replace(/:[^:@]*@/, ":****@"),
);
console.log(
  "  - Contains 1.55.212.135:",
  DATABASE_URL?.includes("1.55.212.135"),
);
console.log("  - Contains neon:", DATABASE_URL?.includes("neon"));
console.log(
  "🔗 Database connection string:",
  DATABASE_URL?.replace(/:[^:@]*@/, ":****@"),
);

// Test database connection immediately
console.log("🔍 Testing database connection...");
pool.query("SELECT current_database(), current_user, version()", (err, res) => {
  if (err) {
    console.error("❌ Database connection failed:", err.message);
  } else {
    console.log("✅ Database connection successful:");
    console.log("  - Database:", res.rows[0]?.current_database);
    console.log("  - User:", res.rows[0]?.current_user);
    console.log("  - Version:", res.rows[0]?.version?.substring(0, 50) + "...");
  }
});

export const db = drizzle(pool, { schema });

// Initialize sample data function
export async function initializeSampleData() {
  try {
    console.log("Running database migrations...");

    // Run migration for membership thresholds
    try {
      await db.execute(sql`
        ALTER TABLE store_settings 
        ADD COLUMN IF NOT EXISTS gold_threshold TEXT DEFAULT '300000'
      `);
      await db.execute(sql`
        ALTER TABLE store_settings 
        ADD COLUMN IF NOT EXISTS vip_threshold TEXT DEFAULT '1000000'
      `);

      // Update existing records
      await db.execute(sql`
        UPDATE store_settings 
        SET gold_threshold = COALESCE(gold_threshold, '300000'), 
            vip_threshold = COALESCE(vip_threshold, '1000000')
      `);

      console.log(
        "Migration for membership thresholds completed successfully.",
      );
    } catch (migrationError) {
      console.log("Migration already applied or error:", migrationError);
    }

    // Run migration for product_type column
    try {
      await db.execute(sql`
        ALTER TABLE products ADD COLUMN IF NOT EXISTS product_type INTEGER DEFAULT 1
      `);
      await db.execute(sql`
        UPDATE products SET product_type = 1 WHERE product_type IS NULL
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_products_product_type ON products(product_type)
      `);

      console.log("Migration for product_type column completed successfully.");
    } catch (migrationError) {
      console.log(
        "Product type migration already applied or error:",
        migrationError,
      );
    }

    // Run migration for tax_rate column
    try {
      await db.execute(sql`
        ALTER TABLE products ADD COLUMN IF NOT EXISTS tax_rate DECIMAL(5,2) DEFAULT 0.00
      `);
      await db.execute(sql`
        UPDATE products SET tax_rate = 0.00 WHERE tax_rate IS NULL
      `);

      console.log("Migration for tax_rate column completed successfully.");
    } catch (migrationError) {
      console.log(
        "Tax rate migration already applied or error:",
        migrationError,
      );
    }

    // Run migration for price_includes_tax column
    try {
      await db.execute(sql`
        ALTER TABLE products ADD COLUMN IF NOT EXISTS price_includes_tax BOOLEAN DEFAULT false
      `);
      await db.execute(sql`
        UPDATE products SET price_includes_tax = false WHERE price_includes_tax IS NULL
      `);

      console.log(
        "Migration for price_includes_tax column completed successfully.",
      );
    } catch (migrationError) {
      console.log(
        "Price includes tax migration already applied or error:",
        migrationError,
      );
    }

    // Run migration for after_tax_price column
    try {
      await db.execute(sql`
        ALTER TABLE products ADD COLUMN IF NOT EXISTS after_tax_price DECIMAL(10,2)
      `);

      console.log(
        "Migration for after_tax_price column completed successfully.",
      );
    } catch (migrationError) {
      console.log(
        "After tax price migration already applied or error:",
        migrationError,
      );
    }

    // Run migration for pinCode column in store_settings
    try {
      await db.execute(sql`
        ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS pin_code TEXT
      `);

      console.log("Migration for pinCode column completed successfully.");
    } catch (migrationError) {
      console.log(
        "PinCode migration already applied or error:",
        migrationError,
      );
    }

    // Add templateCode column to invoice_templates table
    try {
      await db.execute(sql`
        ALTER TABLE invoice_templates 
        ADD COLUMN IF NOT EXISTS template_code VARCHAR(50)
      `);
      console.log("Migration for templateCode column completed successfully.");
    } catch (error) {
      console.log(
        "TemplateCode migration failed or column already exists:",
        error,
      );
    }

    // Add trade_number column to invoices table and migrate data
    try {
      await db.execute(sql`
        ALTER TABLE invoices ADD COLUMN IF NOT EXISTS trade_number VARCHAR(50)
      `);

      // Copy data from invoice_number to trade_number
      await db.execute(sql`
        UPDATE invoices SET trade_number = invoice_number WHERE trade_number IS NULL OR trade_number = ''
      `);

      // Clear invoice_number column
      await db.execute(sql`
        UPDATE invoices SET invoice_number = NULL
      `);

      // Create index for trade_number
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_invoices_trade_number ON invoices(trade_number)
      `);

      console.log("Migration for trade_number column completed successfully.");
    } catch (error) {
      console.log("Trade number migration failed or already applied:", error);
    }

    // Add invoice_status column to invoices table
    try {
      await db.execute(sql`
        ALTER TABLE invoices ADD COLUMN IF NOT EXISTS invoice_status INTEGER NOT NULL DEFAULT 1
      `);

      // Create index for invoice_status
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_invoices_invoice_status ON invoices(invoice_status)
      `);

      console.log(
        "Migration for invoice_status column in invoices completed successfully.",
      );
    } catch (error) {
      console.log("Invoice status migration for invoices failed or already applied:", error);
    }

    // Add invoice_status column to orders table
    try {
      await db.execute(sql`
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_status INTEGER NOT NULL DEFAULT 1
      `);

      // Create index for invoice_status
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_orders_invoice_status ON orders(invoice_status)
      `);

      console.log(
        "Migration for invoice_status column in orders completed successfully.",
      );
    } catch (error) {
      console.log("Invoice status migration for orders failed or already applied:", error);
    }

    // Add template_number and symbol columns to orders table
    try {
      await db.execute(sql`
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS template_number VARCHAR(50)
      `);
      await db.execute(sql`
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS symbol VARCHAR(20)
      `);

      // Create indexes for template_number and symbol
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_orders_template_number ON orders(template_number)
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_orders_symbol ON orders(symbol)
      `);

      console.log(
        "Migration for template_number and symbol columns in orders table completed successfully.",
      );
    } catch (error) {
      console.log(
        "Template number and symbol migration failed or already applied:",
        error,
      );
    }

    // Add invoice_number column to orders table
    try {
      await db.execute(sql`
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(50)
      `);

      // Create index for invoice_number
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_orders_invoice_number ON orders(invoice_number)
      `);

      console.log(
        "Migration for invoice_number column in orders table completed successfully.",
      );
    } catch (error) {
      console.log("Invoice number migration failed or already applied:", error);
    }

    // Add discount column to orders table
    try {
      await db.execute(sql`
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount DECIMAL(10,2) NOT NULL DEFAULT 0.00
      `);

      // Create index for discount
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_orders_discount ON orders(discount)
      `);

      // Update existing orders to set discount to 0 if null
      await db.execute(sql`
        UPDATE orders SET discount = 0.00 WHERE discount IS NULL
      `);

      console.log(
        "Migration for discount column in orders table completed successfully.",
      );
    } catch (error) {
      console.log("Discount column migration failed or already applied:", error);
    }

    // Add discount column to order_items table
    try {
      await db.execute(sql`
        ALTER TABLE order_items ADD COLUMN IF NOT EXISTS discount DECIMAL(10,2) NOT NULL DEFAULT 0.00
      `);

      // Create index for discount
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_order_items_discount ON order_items(discount)
      `);

      // Update existing order items to set discount to 0 if null
      await db.execute(sql`
        UPDATE order_items SET discount = 0.00 WHERE discount IS NULL
      `);

      console.log(
        "Migration for discount column in order_items table completed successfully.",
      );
    } catch (error) {
      console.log("Order items discount column migration failed or already applied:", error);
    }

    // Run migration for email constraint in employees table
    try {
      await db.execute(sql`
        ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_email_unique
      `);

      await db.execute(sql`
        CREATE UNIQUE INDEX IF NOT EXISTS employees_email_unique_idx 
        ON employees (email) 
        WHERE email IS NOT NULL AND email != ''
      `);

      await db.execute(sql`
        UPDATE employees SET email = NULL WHERE email = ''
      `);

      console.log(
        "Migration for employees email constraint completed successfully.",
      );
    } catch (migrationError) {
      console.log(
        "Email constraint migration already applied or error:",
        migrationError,
      );
    }

    // Skip sample data initialization - using external database
    console.log("🔍 Checking customer table data...");
    const customerCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(customers);
    console.log(
      `📊 Found ${customerCount[0]?.count || 0} customers in database`,
    );

    // Note: Sample data insertion disabled for external database
    console.log("ℹ️ Sample data insertion skipped - using external database");

    // Add notes column to transactions table if it doesn't exist
    try {
      await db.execute(sql`
        ALTER TABLE transactions ADD COLUMN IF NOT EXISTS notes TEXT
      `);
      console.log("Migration for notes column in transactions table completed successfully.");
    } catch (migrationError) {
      console.log("Notes column migration already applied or error:", migrationError);
    }

    // Add invoice_id and invoice_number columns to transactions table if they don't exist
    try {
      await db.execute(sql`
        ALTER TABLE transactions ADD COLUMN IF NOT EXISTS invoice_id INTEGER REFERENCES invoices(id)
      `);
      await db.execute(sql`
        ALTER TABLE transactions ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(50)
      `);
      console.log("Migration for invoice_id and invoice_number columns in transactions table completed successfully.");
    } catch (migrationError) {
      console.log("Invoice columns migration already applied or error:", migrationError);
    }

    // Initialize inventory_transactions table if it doesn't exist
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
      console.log("Inventory transactions table initialized");
    } catch (error) {
      console.log(
        "Inventory transactions table already exists or initialization failed:",
        error,
      );
    }

    // Initialize einvoice_connections table if it doesn't exist
    try {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS einvoice_connections (
          id SERIAL PRIMARY KEY,
          symbol VARCHAR(10) NOT NULL,
          tax_code VARCHAR(20) NOT NULL,
          login_id VARCHAR(50) NOT NULL,
          password TEXT NOT NULL,
          software_name VARCHAR(50) NOT NULL,
          login_url TEXT,
          sign_method VARCHAR(20) NOT NULL DEFAULT 'Ký server',
          cqt_code VARCHAR(20) NOT NULL DEFAULT 'Cấp nhật',
          notes TEXT,
          is_default BOOLEAN NOT NULL DEFAULT false,
          is_active BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMP DEFAULT NOW() NOT NULL,
          updated_at TIMESTAMP DEFAULT NOW() NOT NULL
        )
      `);

      // Create indexes for better performance
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_einvoice_connections_symbol ON einvoice_connections(symbol)
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_einvoice_connections_active ON einvoice_connections(is_active)
      `);

      console.log("E-invoice connections table initialized");
    } catch (error) {
      console.log(
        "E-invoice connections table already exists or initialization failed:",
        error,
      );
    }

    // Initialize invoice_templates table if it doesn't exist
    try {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS invoice_templates (
          id SERIAL PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          template_number VARCHAR(50) NOT NULL,
          template_code VARCHAR(50),
          symbol VARCHAR(20) NOT NULL,
          use_ck BOOLEAN NOT NULL DEFAULT true,
          notes TEXT,
          is_default BOOLEAN NOT NULL DEFAULT false,
          is_active BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMP DEFAULT NOW() NOT NULL,
          updated_at TIMESTAMP DEFAULT NOW() NOT NULL
        )
      `);

      // Create indexes for better performance
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_invoice_templates_symbol ON invoice_templates(symbol)
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_invoice_templates_default ON invoice_templates(is_default)
      `);

      console.log("Invoice templates table initialized");
    } catch (error) {
      console.log(
        "Invoice templates table already exists or initialization failed:",
        error,
      );
    }

    // Initialize invoices table if it doesn't exist
    try {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS invoices (
          id SERIAL PRIMARY KEY,
          invoice_number VARCHAR(50) UNIQUE NOT NULL,
          customer_id INTEGER,
          customer_name VARCHAR(100) NOT NULL,
          customer_tax_code VARCHAR(20),
          customer_address TEXT,
          customer_phone VARCHAR(20),
          customer_email VARCHAR(100),
          subtotal DECIMAL(10, 2) NOT NULL,
          tax DECIMAL(10, 2) NOT NULL,
          total DECIMAL(10, 2) NOT NULL,
          payment_method VARCHAR(50) NOT NULL,
          invoice_date TIMESTAMP NOT NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'draft',
          einvoice_status INTEGER NOT NULL DEFAULT 0,
          notes TEXT,
          created_at TIMESTAMP DEFAULT NOW() NOT NULL,
          updated_at TIMESTAMP DEFAULT NOW() NOT NULL
        )
      `);

      // Create indexes for better performance
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_invoices_invoice_number ON invoices(invoice_number)
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_invoices_customer_id ON invoices(customer_id)
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status)
      `);

      console.log("Invoices table initialized");
    } catch (error) {
      console.log(
        "Invoices table already exists or initialization failed:",
        error,
      );
    }

    // Initialize printer_configs table if it doesn't exist
    try {
      // Check if table exists first
      const tableExists = await db.execute(sql`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'printer_configs'
        )
      `);

      if (!tableExists.rows[0]?.exists) {
        await db.execute(sql`
          CREATE TABLE printer_configs (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            printer_type VARCHAR(50) NOT NULL DEFAULT 'thermal',
            connection_type VARCHAR(50) NOT NULL DEFAULT 'usb',
            ip_address VARCHAR(45),
            port INTEGER DEFAULT 9100,
            mac_address VARCHAR(17),
            paper_width INTEGER NOT NULL DEFAULT 80,
            print_speed INTEGER DEFAULT 100,
            is_primary BOOLEAN NOT NULL DEFAULT false,
            is_secondary BOOLEAN NOT NULL DEFAULT false,
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMP DEFAULT NOW() NOT NULL,
            updated_at TIMESTAMP DEFAULT NOW() NOT NULL
          )
        `);

        // Create indexes for better performance
        await db.execute(sql`
          CREATE INDEX idx_printer_configs_primary ON printer_configs(is_primary)
        `);
        await db.execute(sql`
          CREATE INDEX idx_printer_configs_active ON printer_configs(is_active)
        `);

        console.log("Printer configs table created successfully");
      } else {
        // Add missing columns if table exists
        try {
          await db.execute(sql`
            ALTER TABLE printer_configs ADD COLUMN IF NOT EXISTS is_primary BOOLEAN DEFAULT false
          `);
          await db.execute(sql`
            ALTER TABLE printer_configs ADD COLUMN IF NOT EXISTS is_secondary BOOLEAN DEFAULT false
          `);
          console.log("Printer configs table columns updated");
        } catch (columnError) {
          console.log("Printer configs columns already exist:", columnError.message);
        }
      }
    } catch (error) {
      console.log(
        "Printer configs table initialization error:",
        error.message,
      );
    }

    // Initialize invoice_items table if it doesn't exist
    try {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS invoice_items (
          id SERIAL PRIMARY KEY,
          invoice_id INTEGER REFERENCES invoices(id) NOT NULL,
          product_id INTEGER,
          product_name VARCHAR(200) NOT NULL,
          quantity INTEGER NOT NULL,
          unit_price DECIMAL(10, 2) NOT NULL,
          total DECIMAL(10, 2) NOT NULL,
          tax_rate DECIMAL(5, 2) NOT NULL DEFAULT 10.00
        )
      `);

      // Create indexes for better performance
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON invoice_items(invoice_id)
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_invoice_items_product_id ON invoice_items(product_id)
      `);

      console.log("Invoice items table initialized");
    } catch (error) {
      console.log(
        "Invoice items table already exists or initialization failed:",
        error,
      );
    }
  } catch (error) {
    console.log("⚠️ Sample data initialization skipped:", error);
  }
}