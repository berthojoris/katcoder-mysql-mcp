import { MySQLMCPServer, MCPServerConfig } from './server.js';
import { DatabaseManager } from './database.js';
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

export class MySQLMCPImplementation extends MySQLMCPServer {
  private dbManager: DatabaseManager;

  constructor(config: MCPServerConfig) {
    super(config);
    this.dbManager = new DatabaseManager(this.getDatabaseConfig());
  }

  // SQL Injection Prevention Utilities
  private sanitizeIdentifier(identifier: string): string {
    // Remove any characters that aren't alphanumeric or underscore
    return identifier.replace(/[^a-zA-Z0-9_]/g, '');
  }

  private validateTableName(table: string): void {
    if (!table || typeof table !== 'string') {
      throw new Error('Invalid table name');
    }
    
    const sanitized = this.sanitizeIdentifier(table);
    if (sanitized !== table) {
      throw new Error('Invalid table name: contains illegal characters');
    }
  }

  private validateColumnName(column: string): void {
    if (!column || typeof column !== 'string') {
      throw new Error('Invalid column name');
    }
    
    const sanitized = this.sanitizeIdentifier(column);
    if (sanitized !== column) {
      throw new Error('Invalid column name: contains illegal characters');
    }
  }

  private validateWhereConditions(where: any): void {
    if (!where || typeof where !== 'object') {
      throw new Error('Invalid where conditions');
    }

    // Check for SQL injection patterns in values
    for (const [key, value] of Object.entries(where)) {
      this.validateColumnName(key);
      
      if (typeof value === 'string') {
        // Basic SQL injection pattern detection
        const dangerousPatterns = [
          /(\b(union|select|insert|update|delete|drop|create|alter|exec|execute|script|declare|truncate)\b)/i,
          /(--|\/\*|\*\/)/,
          /(\b(or|and)\b.*=.*\b(or|and)\b)/i,
        ];

        for (const pattern of dangerousPatterns) {
          if (pattern.test(value)) {
            throw new Error(`Potential SQL injection detected in where condition for column '${key}'`);
          }
        }
      }
    }
  }

  private validateData(data: any): void {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid data object');
    }

    for (const key of Object.keys(data)) {
      this.validateColumnName(key);
    }
  }

  private buildWhereClause(where: any): { clause: string; params: any[] } {
    this.validateWhereConditions(where);
    
    const conditions: string[] = [];
    const params: any[] = [];

    for (const [key, value] of Object.entries(where)) {
      const sanitizedKey = this.sanitizeIdentifier(key);
      
      if (value === null) {
        conditions.push(`\`${sanitizedKey}\` IS NULL`);
      } else if (Array.isArray(value)) {
        const placeholders = value.map(() => '?').join(',');
        conditions.push(`\`${sanitizedKey}\` IN (${placeholders})`);
        params.push(...value);
      } else {
        conditions.push(`\`${sanitizedKey}\` = ?`);
        params.push(value);
      }
    }

    return {
      clause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
      params,
    };
  }

  // Tool Implementations
  protected async handleList(args: any): Promise<any> {
    try {
      const databaseName = this.getDatabaseConfig().database;
      if (!databaseName) {
        throw new Error('Database name is not configured');
      }

      if (args.table) {
        this.validateTableName(args.table);
        
        // List columns for specific table
        const query = `
          SELECT 
            COLUMN_NAME as name,
            DATA_TYPE as type,
            IS_NULLABLE as nullable,
            COLUMN_DEFAULT as default_value,
            COLUMN_KEY as key_type,
            EXTRA as extra
          FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
          ORDER BY ORDINAL_POSITION
        `;
        
        const columns = await this.dbManager.query(query, [databaseName, args.table]);
        
        return {
          success: true,
          table: args.table,
          columns: columns.map((col: any) => ({
            name: col.name,
            type: col.type,
            nullable: col.nullable === 'YES',
            default: col.default_value,
            key: col.key_type,
            extra: col.extra,
          })),
        };
      } else {
        // List all tables
        const query = `
          SELECT TABLE_NAME as name, TABLE_ROWS as \`rows\`, TABLE_COMMENT as comment
          FROM INFORMATION_SCHEMA.TABLES 
          WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
          ORDER BY TABLE_NAME
        `;
        
        const tables = await this.dbManager.query(query, [databaseName]);
        
        return {
          success: true,
          tables: tables.map((table: any) => ({
            name: table.name,
            rows: table.rows,
            comment: table.comment,
          })),
        };
      }
    } catch (error) {
      logger.error('List operation failed:', error);
      throw error;
    }
  }

  protected async handleRead(args: any): Promise<any> {
    try {
      this.validateTableName(args.table);
      
      let columns = '*';
      if (args.columns && Array.isArray(args.columns) && args.columns.length > 0) {
        // Validate all column names
        args.columns.forEach((col: string) => this.validateColumnName(col));
        columns = args.columns.map((col: string) => `\`${col}\``).join(', ');
      }

      let sql = `SELECT ${columns} FROM \`${args.table}\``;
      const params: any[] = [];

      // Add WHERE clause
      if (args.where) {
        const { clause, params: whereParams } = this.buildWhereClause(args.where);
        if (clause) {
          sql += ` ${clause}`;
          params.push(...whereParams);
        }
      }

      // Add ORDER BY clause
      if (args.orderBy) {
        // Basic validation for order by
        const orderBy = args.orderBy.replace(/[^a-zA-Z0-9_,\s]/g, '');
        sql += ` ORDER BY ${orderBy}`;
      }

      // Add LIMIT and OFFSET
      if (args.limit) {
        const limit = parseInt(args.limit);
        if (limit > 0 && limit <= 10000) { // Security: max limit
          sql += ` LIMIT ${limit}`;
        } else {
          throw new Error('Invalid limit value. Must be between 1 and 10000.');
        }
      }

      if (args.offset) {
        const offset = parseInt(args.offset);
        if (offset >= 0) {
          sql += ` OFFSET ${offset}`;
        } else {
          throw new Error('Invalid offset value. Must be non-negative.');
        }
      }

      const results = await this.dbManager.query(sql, params);
      
      return {
        success: true,
        table: args.table,
        count: results.length,
        data: results,
      };
    } catch (error) {
      logger.error('Read operation failed:', error);
      throw error;
    }
  }

  protected async handleCreate(args: any): Promise<any> {
    try {
      this.validateTableName(args.table);
      this.validateData(args.data);

      const columns = Object.keys(args.data);
      const values = Object.values(args.data);
      const placeholders = columns.map(() => '?').join(', ');
      const columnNames = columns.map(col => `\`${col}\``).join(', ');

      const sql = `INSERT INTO \`${args.table}\` (${columnNames}) VALUES (${placeholders})`;
      
      const result = await this.dbManager.query(sql, values);
      
      return {
        success: true,
        table: args.table,
        insertedId: result.insertId,
        affectedRows: result.affectedRows,
      };
    } catch (error) {
      logger.error('Create operation failed:', error);
      throw error;
    }
  }

  protected async handleUpdate(args: any): Promise<any> {
    try {
      this.validateTableName(args.table);
      this.validateData(args.data);

      if (!args.where) {
        throw new Error('WHERE clause is required for UPDATE operations to prevent accidental updates');
      }

      const setClause = Object.keys(args.data)
        .map(col => `\`${col}\` = ?`)
        .join(', ');
      
      const values = Object.values(args.data);
      
      const { clause: whereClause, params: whereParams } = this.buildWhereClause(args.where);
      
      const sql = `UPDATE \`${args.table}\` SET ${setClause} ${whereClause}`;
      const params = [...values, ...whereParams];
      
      const result = await this.dbManager.query(sql, params);
      
      return {
        success: true,
        table: args.table,
        affectedRows: result.affectedRows,
        changedRows: result.changedRows,
      };
    } catch (error) {
      logger.error('Update operation failed:', error);
      throw error;
    }
  }

  protected async handleDelete(args: any): Promise<any> {
    try {
      this.validateTableName(args.table);

      if (!args.where) {
        throw new Error('WHERE clause is required for DELETE operations to prevent accidental deletions');
      }

      const { clause: whereClause, params: whereParams } = this.buildWhereClause(args.where);
      
      const sql = `DELETE FROM \`${args.table}\` ${whereClause}`;
      
      const result = await this.dbManager.query(sql, whereParams);
      
      return {
        success: true,
        table: args.table,
        affectedRows: result.affectedRows,
      };
    } catch (error) {
      logger.error('Delete operation failed:', error);
      throw error;
    }
  }

  protected async handleExecute(args: any): Promise<any> {
    try {
      // Security: Only allow read operations by default
      if (!args.allowWrite) {
        const writeKeywords = /\b(insert|update|delete|drop|create|alter|truncate|exec|execute)\b/i;
        if (writeKeywords.test(args.query)) {
          throw new Error('Write operations are not allowed. Set allowWrite: true to enable.');
        }
      }

      // Additional SQL injection prevention for raw queries
      const dangerousPatterns = [
        /(;\s*drop\s+|;\s*delete\s+|;\s*update\s+|;\s*insert\s+)/i,
        /(\/\*|\*\/|--)/,
        /(union\s+select|select\s+\*\s+from\s+information_schema)/i,
      ];

      for (const pattern of dangerousPatterns) {
        if (pattern.test(args.query)) {
          throw new Error('Potentially dangerous SQL patterns detected in query.');
        }
      }

      const results = await this.dbManager.query(args.query, args.params || []);
      
      return {
        success: true,
        query: args.query,
        results: results,
        count: Array.isArray(results) ? results.length : 0,
      };
    } catch (error) {
      logger.error('Execute operation failed:', error);
      throw error;
    }
  }

  protected async handleDDL(args: any): Promise<any> {
    try {
      // Validate DDL statement
      const ddlKeywords = /\b(create|alter|drop|truncate)\s+(table|index|view|procedure|function|trigger)\b/i;
      if (!ddlKeywords.test(args.statement)) {
        throw new Error('Invalid DDL statement. Only CREATE, ALTER, DROP, TRUNCATE operations are allowed.');
      }

      const result = await this.dbManager.query(args.statement);
      
      return {
        success: true,
        statement: args.statement,
        affectedRows: result.affectedRows || 0,
      };
    } catch (error) {
      logger.error('DDL operation failed:', error);
      throw error;
    }
  }

  protected async handleTransaction(args: any): Promise<any> {
    try {
      if (!args.operations || !Array.isArray(args.operations) || args.operations.length === 0) {
        throw new Error('Transaction must contain at least one operation');
      }

      const queries: Array<{sql: string, params?: any[]}> = [];

      for (const operation of args.operations) {
        switch (operation.type) {
          case 'create':
            this.validateTableName(operation.table);
            this.validateData(operation.data);
            
            const createColumns = Object.keys(operation.data);
            const createValues = Object.values(operation.data);
            const createPlaceholders = createColumns.map(() => '?').join(', ');
            const createColumnNames = createColumns.map(col => `\`${col}\``).join(', ');
            
            queries.push({
              sql: `INSERT INTO \`${operation.table}\` (${createColumnNames}) VALUES (${createPlaceholders})`,
              params: createValues,
            });
            break;

          case 'bulk_insert':
            this.validateTableName(operation.table);
            
            if (!operation.data || !Array.isArray(operation.data) || operation.data.length === 0) {
              throw new Error('Bulk insert data must be a non-empty array');
            }

            // Validate each record in the bulk data
            for (let i = 0; i < operation.data.length; i++) {
              const record = operation.data[i];
              if (!record || typeof record !== 'object') {
                throw new Error(`Record at index ${i} is not a valid object`);
              }
              this.validateData(record);
            }

            const bulkColumns = Object.keys(operation.data[0]);
            const bulkColumnNames = bulkColumns.map(col => `\`${col}\``).join(', ');
            const placeholders = bulkColumns.map(() => '?').join(', ');
            const valuesPlaceholders = operation.data.map(() => `(${placeholders})`).join(', ');
            
            const sql = `INSERT INTO \`${operation.table}\` (${bulkColumnNames}) VALUES ${valuesPlaceholders}`;
            
            // Flatten all values
            const allValues: any[] = [];
            for (const record of operation.data) {
              for (const column of bulkColumns) {
                allValues.push(record[column]);
              }
            }
            
            queries.push({
              sql,
              params: allValues,
            });
            break;

          case 'update':
            this.validateTableName(operation.table);
            this.validateData(operation.data);
            
            if (!operation.where) {
              throw new Error('WHERE clause required for UPDATE in transaction');
            }
            
            const setClause = Object.keys(operation.data)
              .map(col => `\`${col}\` = ?`)
              .join(', ');

            const updateValues = Object.values(operation.data);
            const { clause: updateWhereClause, params: updateWhereParams } = this.buildWhereClause(operation.where);
            
            queries.push({
              sql: `UPDATE \`${operation.table}\` SET ${setClause} ${updateWhereClause}`,
              params: [...updateValues, ...updateWhereParams],
            });
            break;

          case 'delete':
            this.validateTableName(operation.table);
            
            if (!operation.where) {
              throw new Error('WHERE clause required for DELETE in transaction');
            }
            
            const { clause: deleteWhereClause, params: deleteWhereParams } = this.buildWhereClause(operation.where);
            
            queries.push({
              sql: `DELETE FROM \`${operation.table}\` ${deleteWhereClause}`,
              params: deleteWhereParams,
            });
            break;

          case 'execute':
            // Additional validation for execute in transaction
            if (!operation.query) {
              throw new Error('Query required for EXECUTE in transaction');
            }
            
            queries.push({
              sql: operation.query,
              params: operation.params || [],
            });
            break;

          default:
            throw new Error(`Unsupported operation type: ${operation.type}`);
        }
      }

      const results = await this.dbManager.transaction(queries);
      
      return {
        success: true,
        operations: args.operations.length,
        results: results,
      };
    } catch (error) {
      logger.error('Transaction operation failed:', error);
      throw error;
    }
  }

  protected async handleBulkInsert(args: any): Promise<any> {
    try {
      this.validateTableName(args.table);
      
      if (!args.data || !Array.isArray(args.data) || args.data.length === 0) {
        throw new Error('Bulk insert data must be a non-empty array');
      }

      // Validate each record
      for (let i = 0; i < args.data.length; i++) {
        const record = args.data[i];
        if (!record || typeof record !== 'object') {
          throw new Error(`Record at index ${i} is not a valid object`);
        }
        this.validateData(record);
      }

      const result = await this.dbManager.bulkInsert(args.table, args.data);
      
      return {
        success: true,
        table: args.table,
        recordCount: result.recordCount,
        affectedRows: result.affectedRows,
        insertedId: result.insertId,
        message: result.message,
      };
    } catch (error) {
      logger.error('Bulk insert operation failed:', error);
      throw error;
    }
  }

  protected async handleUtility(args: any): Promise<any> {
    try {
      switch (args.action) {
        case 'ping':
          const isConnected = await this.dbManager.testConnection();
          return {
            success: true,
            action: 'ping',
            connected: isConnected,
            timestamp: new Date().toISOString(),
          };

        case 'version':
          const versionResult = await this.dbManager.query('SELECT VERSION() as version');
          return {
            success: true,
            action: 'version',
            version: versionResult[0]?.version || 'Unknown',
          };

        case 'stats':
          const databaseName = this.getDatabaseConfig().database;
          if (!databaseName) {
            throw new Error('Database name is not configured');
          }

          const stats = await this.dbManager.query(`
            SELECT 
              COUNT(*) as total_tables,
              SUM(TABLE_ROWS) as total_rows
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_SCHEMA = ?
          `, [databaseName]);
          
          const poolStatus = this.dbManager.getPoolStatus();
          
          return {
            success: true,
            action: 'stats',
            database: databaseName,
            tables: stats[0]?.total_tables || 0,
            rows: stats[0]?.total_rows || 0,
            pool: poolStatus,
          };

        case 'describe_table':
          if (!args.table) {
            throw new Error('Table name required for describe_table');
          }
          
          this.validateTableName(args.table);
          
          const describeResult = await this.dbManager.query(`DESCRIBE \`${args.table}\``);
          return {
            success: true,
            action: 'describe_table',
            table: args.table,
            structure: describeResult,
          };

        default:
          throw new Error(`Unknown utility action: ${args.action}`);
      }
    } catch (error) {
      logger.error('Utility operation failed:', error);
      throw error;
    }
  }

  protected async cleanup(): Promise<void> {
    await this.dbManager.close();
  }
}