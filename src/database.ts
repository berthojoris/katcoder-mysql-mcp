import mysql from 'mysql2/promise';
import { DatabaseConfig } from './server.js';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
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
    this.pool.on('connection', (connection) => {
      logger.debug('New database connection established');
      
      connection.on('error', (err) => {
        logger.error('Database connection error:', err);
      });

      connection.on('close', () => {
        logger.debug('Database connection closed');
      });
    });

    this.pool.on('acquire', (connection) => {
      logger.debug('Connection acquired from pool');
    });

    this.pool.on('release', (connection) => {
      logger.debug('Connection released to pool');
    });
  }

  async testConnection(): Promise<boolean> {
    try {
      const connection = await this.pool.getConnection();
      await connection.ping();
      connection.release();
      logger.info('Database connection test successful');
      return true;
    } catch (error) {
      logger.error('Database connection test failed:', error);
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

  async transaction(queries: Array<{sql: string, params?: any[]}>): Promise<any[]> {
    const connection = await this.pool.getConnection();
    
    try {
      await connection.beginTransaction();
      logger.info('Transaction started');

      const results = [];
      for (const {sql, params} of queries) {
        logger.debug(`Transaction query: ${sql}`, { params });
        const [result] = await connection.execute(sql, params);
        results.push(result);
      }

      await connection.commit();
      logger.info('Transaction committed successfully');
      return results;

    } catch (error) {
      await connection.rollback();
      logger.error('Transaction rolled back due to error:', error);
      throw this.formatDatabaseError(error);
    } finally {
      connection.release();
      logger.debug('Transaction connection released');
    }
  }

  async getConnection(): Promise<mysql.PoolConnection> {
    return await this.pool.getConnection();
  }

  async releaseConnection(connection: mysql.PoolConnection): Promise<void> {
    connection.release();
  }

  async close(): Promise<void> {
    try {
      await this.pool.end();
      logger.info('Database pool closed successfully');
    } catch (error) {
      logger.error('Error closing database pool:', error);
      throw error;
    }
  }

  private formatDatabaseError(error: any): Error {
    if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      return new Error('Database access denied. Check credentials.');
    } else if (error.code === 'ER_BAD_DB_ERROR') {
      return new Error(`Database '${this.config.database}' does not exist.`);
    } else if (error.code === 'ECONNREFUSED') {
      return new Error(`Connection refused to ${this.config.host}:${this.config.port}`);
    } else if (error.code === 'ER_NO_SUCH_TABLE') {
      return new Error('Table does not exist.');
    } else if (error.code === 'ER_DUP_ENTRY') {
      return new Error('Duplicate entry. Record already exists.');
    } else if (error.code === 'ER_PARSE_ERROR') {
      return new Error('SQL syntax error. Please check your query.');
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