import * as mysql from "mysql2/promise";
import { DatabaseConfig } from "./server.js";
import * as winston from "winston";

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple(),
      ),
    }),
  ],
});

export class DatabaseManager {
  private pool: mysql.Pool;
  private config: DatabaseConfig;
  private connectionLimit: number;

  constructor(config: DatabaseConfig) {
    this.config = config;
    this.connectionLimit = config.connectionLimit || 10;
    this.pool = mysql.createPool({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      connectionLimit: config.connectionLimit || 10,
      acquireTimeout: config.acquireTimeout || 60000,
      timeout: config.timeout || 60000,
      waitForConnections: true,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
      multipleStatements: false, // Security: prevent SQL injection
      supportBigNumbers: true,
      bigNumberStrings: true,
      dateStrings: true,
      trace: false, // Security: disable stack traces in production
      ssl: this.getSSLOptions(),
    } as mysql.PoolOptions);

    this.setupConnectionErrorHandling();
  }

  private getSSLOptions() {
    // For production, you might want to add SSL options
    // This is a basic implementation - adjust based on your security requirements
    return undefined;
  }

  private setupConnectionErrorHandling(): void {
    this.pool.on("connection", (connection) => {
      logger.debug("New database connection established");

      connection.on("error", (err) => {
        logger.error("Database connection error:", err);
      });

      connection.on("close", () => {
        logger.debug("Database connection closed");
      });
    });

    this.pool.on("acquire", (connection) => {
      logger.debug("Connection acquired from pool");
    });

    this.pool.on("release", (connection) => {
      logger.debug("Connection released to pool");
    });
  }

  async testConnection(): Promise<boolean> {
    try {
      const connection = await this.pool.getConnection();
      await connection.ping();
      connection.release();
      logger.info("Database connection test successful");
      return true;
    } catch (error) {
      logger.error("Database connection test failed:", error);
      return false;
    }
  }

  async query(sql: string, params?: any[]): Promise<any> {
    try {
      logger.debug(`Executing query: ${sql}`, { params });
      const [rows] = await this.pool.execute(sql, params);
      return rows;
    } catch (error) {
      logger.error(`Query execution failed: ${sql}`, { error, params });
      throw this.formatDatabaseError(error);
    }
  }

  async transaction(
    queries: Array<{ sql: string; params?: any[] }>,
  ): Promise<any[]> {
    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();
      logger.info("Transaction started");

      const results = [];
      for (const { sql, params } of queries) {
        logger.debug(`Transaction query: ${sql}`, { params });
        const [result] = await connection.execute(sql, params);
        results.push(result);
      }

      await connection.commit();
      logger.info("Transaction committed successfully");
      return results;
    } catch (error) {
      await connection.rollback();
      logger.error("Transaction rolled back due to error:", error);
      throw this.formatDatabaseError(error);
    } finally {
      connection.release();
      logger.debug("Transaction connection released");
    }
  }

  async schemaTransaction(
    operations: Array<{ sql: string; params?: any[]; description: string }>,
  ): Promise<any[]> {
    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();
      logger.info(
        `Schema transaction started with ${operations.length} operations`,
      );

      const results = [];
      for (const { sql, params, description } of operations) {
        logger.info(`Executing schema operation: ${description}`);
        logger.debug(`Schema SQL: ${sql}`, { params });

        const [result] = await connection.execute(sql, params);
        results.push({
          description,
          result,
          affectedRows: (result as any).affectedRows || 0,
        });
      }

      await connection.commit();
      logger.info("Schema transaction committed successfully");
      return results;
    } catch (error) {
      await connection.rollback();
      logger.error("Schema transaction rolled back due to error:", error);
      throw this.formatDatabaseError(error);
    } finally {
      connection.release();
      logger.debug("Schema transaction connection released");
    }
  }

  async getConnection(): Promise<mysql.PoolConnection> {
    return await this.pool.getConnection();
  }

  async releaseConnection(connection: mysql.PoolConnection): Promise<void> {
    connection.release();
  }

  async bulkInsert(table: string, data: any[]): Promise<any> {
    try {
      if (!data || !Array.isArray(data) || data.length === 0) {
        throw new Error("Data must be a non-empty array");
      }

      // Validate all records have the same structure
      const firstRecord = data[0];
      if (!firstRecord || typeof firstRecord !== "object") {
        throw new Error("Each record must be a valid object");
      }

      const columns = Object.keys(firstRecord);
      if (columns.length === 0) {
        throw new Error("Records must contain at least one column");
      }

      // Validate all records have the same columns
      for (let i = 1; i < data.length; i++) {
        const record = data[i];
        if (!record || typeof record !== "object") {
          throw new Error(`Record at index ${i} is not a valid object`);
        }

        const recordColumns = Object.keys(record);
        if (
          recordColumns.length !== columns.length ||
          !columns.every((col) => recordColumns.includes(col))
        ) {
          throw new Error(
            `Record at index ${i} has different structure than the first record`,
          );
        }
      }

      // Build SQL query using VALUES clause for bulk insert
      // Note: Column names should already be validated by the caller (implementation.ts)
      // But we still escape them with backticks for safety
      const columnNames = columns
        .map((col) => {
          // Basic sanitization - remove any backticks to prevent injection
          const sanitized = col.replace(/`/g, "");
          return `\`${sanitized}\``;
        })
        .join(", ");
      const placeholders = columns.map(() => "?").join(", ");
      const valuesPlaceholders = data.map(() => `(${placeholders})`).join(", ");

      const sql = `INSERT INTO \`${table}\` (${columnNames}) VALUES ${valuesPlaceholders}`;

      // Flatten all values
      const allValues: any[] = [];
      for (const record of data) {
        for (const column of columns) {
          allValues.push(record[column]);
        }
      }

      logger.debug(`Executing bulk insert: ${sql}`, {
        table,
        recordCount: data.length,
        columnCount: columns.length,
      });

      const [result] = await this.pool.execute(sql, allValues);

      return {
        affectedRows: (result as any).affectedRows,
        insertId: (result as any).insertId,
        recordCount: data.length,
        message: `Successfully inserted ${data.length} records into ${table}`,
      };
    } catch (error) {
      logger.error(`Bulk insert failed for table ${table}:`, error);
      throw this.formatDatabaseError(error);
    }
  }

  async close(): Promise<void> {
    try {
      await this.pool.end();
      logger.info("Database pool closed successfully");
    } catch (error) {
      logger.error("Error closing database pool:", error);
      throw error;
    }
  }

  private formatDatabaseError(error: any): Error {
    if (error.code === "ER_ACCESS_DENIED_ERROR") {
      return new Error("Database access denied. Check credentials.");
    } else if (error.code === "ER_BAD_DB_ERROR") {
      return new Error(`Database '${this.config.database}' does not exist.`);
    } else if (error.code === "ECONNREFUSED") {
      return new Error(
        `Connection refused to ${this.config.host}:${this.config.port}`,
      );
    } else if (error.code === "ER_NO_SUCH_TABLE") {
      return new Error("Table does not exist.");
    } else if (error.code === "ER_DUP_ENTRY") {
      return new Error("Duplicate entry. Record already exists.");
    } else if (error.code === "ER_PARSE_ERROR") {
      return new Error("SQL syntax error. Please check your query.");
    }

    return new Error(`Database error: ${error.message}`);
  }

  getPoolStatus(): { connections: number; busyConnections: number } {
    return {
      connections: this.connectionLimit,
      busyConnections: 0, // Simplified for now - MySQL2 doesn't expose this directly
    };
  }
}
