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
  private maxRetries: number;
  private retryDelay: number;

  constructor(config: DatabaseConfig) {
    this.config = config;
    this.connectionLimit = config.connectionLimit || 20;
    this.maxRetries = config.maxRetries || 3;
    this.retryDelay = config.retryDelay || 1000;

    this.pool = mysql.createPool({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      connectionLimit: config.connectionLimit || 20,
      acquireTimeout: config.acquireTimeout || 120000,
      timeout: config.timeout || 120000,
      connectTimeout: config.connectTimeout || 30000,
      waitForConnections: true,
      queueLimit: config.queueLimit !== undefined ? config.queueLimit : 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
      multipleStatements: false, // Security: prevent SQL injection
      supportBigNumbers: true,
      bigNumberStrings: true,
      dateStrings: true,
      trace: false, // Security: disable stack traces in production
      ssl: this.getSSLOptions(),
      // Additional settings for AI agents
      idleTimeout: 60000, // 60 seconds idle timeout
      maxIdle: 10, // Maximum idle connections
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
    let lastError: any;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const connection = await this.pool.getConnection();
        await connection.ping();
        connection.release();
        logger.info(
          `Database connection test successful (attempt ${attempt}/3)`,
        );
        return true;
      } catch (error: any) {
        lastError = error;
        logger.warn(`Database connection test failed (attempt ${attempt}/3):`, {
          error: error.message,
          code: error.code,
        });

        if (attempt < 3) {
          await this.sleep(1000 * attempt);
        }
      }
    }

    logger.error(
      "Database connection test failed after 3 attempts:",
      lastError,
    );
    return false;
  }

  async warmupPool(): Promise<void> {
    // Pre-warm the connection pool for better initial performance
    const warmupCount = Math.min(5, this.connectionLimit);
    logger.info(
      `Warming up connection pool with ${warmupCount} connections...`,
    );

    const connections: mysql.PoolConnection[] = [];
    try {
      for (let i = 0; i < warmupCount; i++) {
        const conn = await this.pool.getConnection();
        connections.push(conn);
      }
      logger.info(`Connection pool warmed up with ${warmupCount} connections`);
    } catch (error) {
      logger.warn("Failed to warm up connection pool:", error);
    } finally {
      // Release all connections back to the pool
      connections.forEach((conn) => conn.release());
    }
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private isRetryableError(error: any): boolean {
    // Errors that can be retried
    const retryableErrorCodes = [
      "ECONNREFUSED",
      "ETIMEDOUT",
      "ENOTFOUND",
      "ECONNRESET",
      "EPIPE",
      "ER_LOCK_WAIT_TIMEOUT",
      "ER_LOCK_DEADLOCK",
      "PROTOCOL_CONNECTION_LOST",
      "PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR",
    ];

    return (
      retryableErrorCodes.includes(error.code) ||
      error.errno === "ETIMEDOUT" ||
      error.message?.includes("timeout") ||
      error.message?.includes("Connection lost")
    );
  }

  async query(sql: string, params?: any[]): Promise<any> {
    let lastError: any;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        logger.debug(
          `Executing query (attempt ${attempt}/${this.maxRetries}): ${sql}`,
          { params },
        );
        const [rows] = await this.pool.execute(sql, params);

        if (attempt > 1) {
          logger.info(
            `Query succeeded on attempt ${attempt}/${this.maxRetries}`,
          );
        }

        return rows;
      } catch (error: any) {
        lastError = error;

        if (attempt < this.maxRetries && this.isRetryableError(error)) {
          const delay = this.retryDelay * attempt; // Exponential backoff
          logger.warn(
            `Query failed (attempt ${attempt}/${this.maxRetries}), retrying in ${delay}ms...`,
            {
              error: error.message,
              code: error.code,
            },
          );
          await this.sleep(delay);
        } else {
          logger.error(
            `Query execution failed after ${attempt} attempts: ${sql}`,
            {
              error,
              params,
              finalAttempt: attempt === this.maxRetries,
            },
          );
          break;
        }
      }
    }

    throw this.formatDatabaseError(lastError);
  }

  async transaction(
    queries: Array<{ sql: string; params?: any[] }>,
  ): Promise<any[]> {
    let lastError: any;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      const connection = await this.pool.getConnection();

      try {
        await connection.beginTransaction();
        logger.info(
          `Transaction started (attempt ${attempt}/${this.maxRetries})`,
        );

        const results = [];
        for (const { sql, params } of queries) {
          logger.debug(`Transaction query: ${sql}`, { params });
          const [result] = await connection.execute(sql, params);
          results.push(result);
        }

        await connection.commit();
        logger.info("Transaction committed successfully");

        if (attempt > 1) {
          logger.info(
            `Transaction succeeded on attempt ${attempt}/${this.maxRetries}`,
          );
        }

        return results;
      } catch (error: any) {
        lastError = error;

        try {
          await connection.rollback();
          logger.warn("Transaction rolled back");
        } catch (rollbackError) {
          logger.error("Failed to rollback transaction:", rollbackError);
        }

        if (attempt < this.maxRetries && this.isRetryableError(error)) {
          const delay = this.retryDelay * attempt;
          logger.warn(
            `Transaction failed (attempt ${attempt}/${this.maxRetries}), retrying in ${delay}ms...`,
            {
              error: error.message,
              code: error.code,
            },
          );
          await this.sleep(delay);
        } else {
          logger.error(`Transaction failed after ${attempt} attempts`, {
            error,
            finalAttempt: attempt === this.maxRetries,
          });
          break;
        }
      } finally {
        connection.release();
        logger.debug("Transaction connection released");
      }
    }

    throw this.formatDatabaseError(lastError);
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
    // Provide clear, actionable error messages for AI agents
    if (error.code === "ER_ACCESS_DENIED_ERROR") {
      return new Error(
        `Database access denied. Check your MySQL credentials (user: ${this.config.user}, host: ${this.config.host}:${this.config.port}). Verify the user has proper permissions.`,
      );
    } else if (error.code === "ER_BAD_DB_ERROR") {
      return new Error(
        `Database '${this.config.database}' does not exist on ${this.config.host}:${this.config.port}. Create the database or verify the connection string.`,
      );
    } else if (error.code === "ECONNREFUSED") {
      return new Error(
        `Connection refused to MySQL server at ${this.config.host}:${this.config.port}. Ensure MySQL is running and accessible at this address.`,
      );
    } else if (error.code === "ETIMEDOUT" || error.errno === "ETIMEDOUT") {
      return new Error(
        `Connection timeout to MySQL server at ${this.config.host}:${this.config.port}. Check network connectivity and firewall settings.`,
      );
    } else if (error.code === "ER_NO_SUCH_TABLE") {
      return new Error(
        `Table does not exist in database '${this.config.database}'. Use the 'list' tool to see available tables.`,
      );
    } else if (error.code === "ER_DUP_ENTRY") {
      const match = error.message?.match(
        /Duplicate entry '([^']+)' for key '([^']+)'/,
      );
      if (match) {
        return new Error(
          `Duplicate entry '${match[1]}' for key '${match[2]}'. A record with this unique value already exists.`,
        );
      }
      return new Error(
        "Duplicate entry. A record with this unique value already exists.",
      );
    } else if (error.code === "ER_PARSE_ERROR") {
      return new Error(
        `SQL syntax error: ${error.message}. Check your SQL syntax.`,
      );
    } else if (error.code === "ER_BAD_FIELD_ERROR") {
      return new Error(
        `Unknown column in query: ${error.message}. Use 'describe_table' to see available columns.`,
      );
    } else if (error.code === "ER_LOCK_WAIT_TIMEOUT") {
      return new Error(
        "Lock wait timeout exceeded. The table is locked by another transaction. Operation was retried but still failed.",
      );
    } else if (error.code === "ER_LOCK_DEADLOCK") {
      return new Error(
        "Deadlock detected. The transaction was rolled back. You can retry the operation.",
      );
    } else if (error.code === "PROTOCOL_CONNECTION_LOST") {
      return new Error(
        "MySQL connection was lost. This may be due to network issues or MySQL server restart. The operation has been retried.",
      );
    } else if (error.code === "ENOTFOUND") {
      return new Error(
        `MySQL host '${this.config.host}' not found. Check the hostname in your connection string.`,
      );
    }

    // Include error code for debugging
    const errorCode = error.code ? ` (Error code: ${error.code})` : "";
    return new Error(`Database error: ${error.message}${errorCode}`);
  }

  getPoolStatus(): { connections: number; busyConnections: number } {
    return {
      connections: this.connectionLimit,
      busyConnections: 0, // Simplified for now - MySQL2 doesn't expose this directly
    };
  }
}
