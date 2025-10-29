import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";

interface TenantConfig {
  subdomain: string;
  databaseUrl: string;
  storeName: string;
  isActive: boolean;
}

class TenantManager {
  private tenants: Map<string, TenantConfig> = new Map();
  private dbConnections: Map<string, any> = new Map();

  constructor() {
    this.loadTenants();
  }

  private loadTenants() {
    // Load tenant configurations from environment or main database
    const tenantsConfig = [
      {
        subdomain: "demo",
        databaseUrl: process.env.EXTERNAL_DB_URL || process.env.DATABASE_URL!,
        storeName: "Demo Store - Cửa hàng demo",
        isActive: true,
      },
      {
        subdomain: "hazkitchen",
        databaseUrl: process.env.DATABASE_URL_hazkitchen || process.env.EXTERNAL_DB_URL_hazkitchen!,
        storeName: "Store hazkitchen - Cửa hàng số hazkitchen",
        isActive: true,
      },
      {
        subdomain: "0318225421",
        databaseUrl: process.env.DATABASE_URL_0318225421 || process.env.EXTERNAL_DB_URL_0318225421!,
        storeName: "Store 0318225421 - Cửa hàng số 0318225421",
        isActive: true,
      },
      // Add more tenants as needed
    ];

    tenantsConfig.forEach((config) => {
      this.tenants.set(config.subdomain, config);
    });
  }

  getTenantBySubdomain(subdomain: string): TenantConfig | null {
    return this.tenants.get(subdomain) || null;
  }

  async getDatabaseConnection(subdomain: string) {
    if (this.dbConnections.has(subdomain)) {
      return this.dbConnections.get(subdomain);
    }

    const tenant = this.getTenantBySubdomain(subdomain);
    if (!tenant) {
      throw new Error(`Tenant not found: ${subdomain}`);
    }

    const pool = new Pool({
      connectionString: tenant.databaseUrl,
      max: 10,
      idleTimeoutMillis: 60000,
      connectionTimeoutMillis: 10000,
      ssl: tenant.databaseUrl?.includes("1.55.212.135")
        ? false // Disable SSL for external server
        : tenant.databaseUrl?.includes("neon")
          ? { rejectUnauthorized: false }
          : undefined,
    });

    const db = drizzle({ client: pool, schema });
    this.dbConnections.set(subdomain, db);

    return db;
  }

  getAllTenants(): TenantConfig[] {
    return Array.from(this.tenants.values());
  }

  addTenant(config: TenantConfig) {
    this.tenants.set(config.subdomain, config);
  }

  removeTenant(subdomain: string) {
    this.tenants.delete(subdomain);
    this.dbConnections.delete(subdomain);
  }
}

export const tenantManager = new TenantManager();
