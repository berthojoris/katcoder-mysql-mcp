import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import * as winston from 'winston';

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

export interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  connectionLimit?: number;
  acquireTimeout?: number;
  timeout?: number;
}

export interface MCPServerConfig {
  connectionString: string;
  enabledTools: string[];
}

export class MySQLMCPServer {
  private server: Server;
  private config: MCPServerConfig;
  private dbConfig: DatabaseConfig;

  constructor(config: MCPServerConfig) {
    this.config = config;
    this.dbConfig = this.parseConnectionString(config.connectionString);
    this.server = new Server(
      {
        name: 'katcoder-mysql-mcp',
        version: '1.0.0',
      }
    );

    this.setupToolHandlers();
    this.setupErrorHandling();
  }

  private parseConnectionString(connectionString: string): DatabaseConfig {
    try {
      const url = new URL(connectionString);
      
      if (url.protocol !== 'mysql:' && url.protocol !== 'mysql2:') {
        throw new Error('Invalid connection string protocol. Must be mysql:// or mysql2://');
      }

      return {
        host: url.hostname || 'localhost',
        port: parseInt(url.port) || 3306,
        user: decodeURIComponent(url.username) || 'root',
        password: decodeURIComponent(url.password) || '',
        database: url.pathname.slice(1) || '',
        connectionLimit: 10,
        acquireTimeout: 60000,
        timeout: 60000,
      };
    } catch (error) {
      logger.error('Failed to parse connection string:', error);
      throw new Error(`Invalid connection string: ${connectionString}`);
    }
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => {
      logger.error('MCP Server error:', error);
    };

    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception:', error);
      this.cleanup();
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled rejection at:', promise, 'reason:', reason);
      this.cleanup();
      process.exit(1);
    });
  }

  private setupToolHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools = this.getEnabledTools();
      logger.info(`Listing ${tools.length} available tools`);
      return { tools };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      logger.info(`Tool called: ${name}`, { args });
      
      try {
        const result = await this.executeTool(name, args);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        logger.error(`Tool execution failed: ${name}`, error);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: true,
                message: error instanceof Error ? error.message : 'Unknown error occurred',
                details: error instanceof Error ? error.stack : undefined,
              }, null, 2),
            },
          ],
          isError: true,
        };
      }
    });
  }

  private getEnabledTools(): Tool[] {
    const allTools = this.getAllTools();
    return allTools.filter(tool => 
      this.config.enabledTools.includes(tool.name)
    );
  }

  private getAllTools(): Tool[] {
    return [
      {
        name: 'list',
        description: 'List tables in the database or columns in a specific table',
        inputSchema: {
          type: 'object',
          properties: {
            table: {
              type: 'string',
              description: 'Optional table name to list columns for',
            },
          },
        },
      },
      {
        name: 'describe_table',
        description: 'Get detailed schema information for a specific table including columns, types, keys, and constraints',
        inputSchema: {
          type: 'object',
          properties: {
            table: {
              type: 'string',
              description: 'Table name to describe',
            },
          },
          required: ['table'],
        },
      },
      {
        name: 'read',
        description: 'Read data from a table with optional filtering and pagination',
        inputSchema: {
          type: 'object',
          properties: {
            table: {
              type: 'string',
              description: 'Table name to read from',
            },
            columns: {
              type: 'array',
              items: { type: 'string' },
              description: 'Columns to select (default: all)',
            },
            where: {
              type: 'object',
              description: 'Where conditions as key-value pairs',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of rows to return',
            },
            offset: {
              type: 'number',
              description: 'Number of rows to skip',
            },
            orderBy: {
              type: 'string',
              description: 'Order by clause',
            },
          },
          required: ['table'],
        },
      },
      {
        name: 'create',
        description: 'Insert data into a table',
        inputSchema: {
          type: 'object',
          properties: {
            table: {
              type: 'string',
              description: 'Table name to insert into',
            },
            data: {
              type: 'object',
              description: 'Data to insert as key-value pairs',
            },
          },
          required: ['table', 'data'],
        },
      },
      {
        name: 'update',
        description: 'Update data in a table',
        inputSchema: {
          type: 'object',
          properties: {
            table: {
              type: 'string',
              description: 'Table name to update',
            },
            data: {
              type: 'object',
              description: 'Data to update as key-value pairs',
            },
            where: {
              type: 'object',
              description: 'Where conditions as key-value pairs',
            },
          },
          required: ['table', 'data'],
        },
      },
      {
        name: 'delete',
        description: 'Delete data from a table',
        inputSchema: {
          type: 'object',
          properties: {
            table: {
              type: 'string',
              description: 'Table name to delete from',
            },
            where: {
              type: 'object',
              description: 'Where conditions as key-value pairs',
            },
          },
          required: ['table', 'where'],
        },
      },
      {
        name: 'execute',
        description: 'Execute a custom SQL query (READ-ONLY by default)',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'SQL query to execute',
            },
            params: {
              type: 'array',
              items: { type: 'string' },
              description: 'Query parameters',
            },
            allowWrite: {
              type: 'boolean',
              description: 'Allow write operations (default: false)',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'ddl',
        description: 'Execute DDL (Data Definition Language) statements',
        inputSchema: {
          type: 'object',
          properties: {
            statement: {
              type: 'string',
              description: 'DDL statement to execute',
            },
          },
          required: ['statement'],
        },
      },
      {
        name: 'transaction',
        description: 'Execute multiple operations in a transaction',
        inputSchema: {
          type: 'object',
          properties: {
            operations: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: {
                    type: 'string',
                    enum: ['create', 'update', 'delete', 'execute', 'bulk_insert'],
                  },
                  table: { type: 'string' },
                  data: {
                    type: 'object',
                    description: 'Data for create operation or single record for bulk_insert',
                  },
                  bulkData: {
                    type: 'array',
                    items: { type: 'object' },
                    description: 'Array of records for bulk insert operation',
                  },
                  where: { type: 'object' },
                  query: { type: 'string' },
                  params: { type: 'array' },
                },
                required: ['type'],
              },
              description: 'Operations to execute in transaction',
            },
          },
          required: ['operations'],
        },
      },
      {
        name: 'bulk_insert',
        description: 'Insert multiple records into a table efficiently',
        inputSchema: {
          type: 'object',
          properties: {
            table: {
              type: 'string',
              description: 'Table name to insert data into',
            },
            data: {
              type: 'array',
              items: {
                type: 'object',
                description: 'Each record must have the same structure with column names as keys',
              },
              description: 'Array of records to insert. All records must have identical structure.',
            },
          },
          required: ['table', 'data'],
        },
      },
      {
        name: 'add_column',
        description: 'Add a new column to an existing table',
        inputSchema: {
          type: 'object',
          properties: {
            table: {
              type: 'string',
              description: 'Table name to add column to',
            },
            column: {
              type: 'object',
              properties: {
                name: {
                  type: 'string',
                  description: 'New column name',
                },
                type: {
                  type: 'string',
                  description: 'Column data type (e.g., VARCHAR(255), INT, DATETIME)',
                },
                nullable: {
                  type: 'boolean',
                  description: 'Whether the column can contain NULL values',
                },
                default: {
                  type: ['string', 'number', 'null'],
                  description: 'Default value for the column',
                },
                autoIncrement: {
                  type: 'boolean',
                  description: 'Whether the column should auto-increment',
                },
                comment: {
                  type: 'string',
                  description: 'Column comment',
                },
              },
              required: ['name', 'type'],
              description: 'Column definition',
            },
            position: {
              type: 'object',
              properties: {
                after: {
                  type: 'string',
                  description: 'Place column after this existing column',
                },
                first: {
                  type: 'boolean',
                  description: 'Place column as the first column',
                },
              },
              description: 'Column position in the table',
            },
          },
          required: ['table', 'column'],
        },
      },
      {
        name: 'drop_column',
        description: 'Remove a column from a table',
        inputSchema: {
          type: 'object',
          properties: {
            table: {
              type: 'string',
              description: 'Table name to remove column from',
            },
            column: {
              type: 'string',
              description: 'Column name to drop',
            },
          },
          required: ['table', 'column'],
        },
      },
      {
        name: 'modify_column',
        description: 'Modify an existing column definition',
        inputSchema: {
          type: 'object',
          properties: {
            table: {
              type: 'string',
              description: 'Table name containing the column',
            },
            column: {
              type: 'string',
              description: 'Column name to modify',
            },
            newDefinition: {
              type: 'object',
              properties: {
                type: {
                  type: 'string',
                  description: 'New column data type',
                },
                nullable: {
                  type: 'boolean',
                  description: 'Whether the column can contain NULL values',
                },
                default: {
                  type: ['string', 'number', 'null'],
                  description: 'New default value',
                },
                comment: {
                  type: 'string',
                  description: 'Column comment',
                },
              },
              required: ['type'],
              description: 'New column definition',
            },
          },
          required: ['table', 'column', 'newDefinition'],
        },
      },
      {
        name: 'rename_column',
        description: 'Rename an existing column',
        inputSchema: {
          type: 'object',
          properties: {
            table: {
              type: 'string',
              description: 'Table name containing the column',
            },
            oldName: {
              type: 'string',
              description: 'Current column name',
            },
            newName: {
              type: 'string',
              description: 'New column name',
            },
            newDefinition: {
              type: 'string',
              description: 'Column definition for the renamed column (optional, defaults to old definition)',
            },
          },
          required: ['table', 'oldName', 'newName'],
        },
      },
      {
        name: 'rename_table',
        description: 'Rename a table',
        inputSchema: {
          type: 'object',
          properties: {
            oldName: {
              type: 'string',
              description: 'Current table name',
            },
            newName: {
              type: 'string',
              description: 'New table name',
            },
          },
          required: ['oldName', 'newName'],
        },
      },
      {
        name: 'add_index',
        description: 'Add an index to a table',
        inputSchema: {
          type: 'object',
          properties: {
            table: {
              type: 'string',
              description: 'Table name to add index to',
            },
            name: {
              type: 'string',
              description: 'Index name',
            },
            columns: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: 'Array of column names to include in the index',
            },
            type: {
              type: 'string',
              enum: ['BTREE', 'HASH', 'FULLTEXT', 'SPATIAL'],
              description: 'Index type',
            },
            unique: {
              type: 'boolean',
              description: 'Whether the index should be unique',
            },
          },
          required: ['table', 'name', 'columns'],
        },
      },
      {
        name: 'drop_index',
        description: 'Remove an index from a table',
        inputSchema: {
          type: 'object',
          properties: {
            table: {
              type: 'string',
              description: 'Table name containing the index',
            },
            name: {
              type: 'string',
              description: 'Index name to drop',
            },
          },
          required: ['table', 'name'],
        },
      },
      {
        name: 'utility',
        description: 'Utility functions for database management',
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['ping', 'version', 'stats', 'describe_table'],
              description: 'Utility action to perform',
            },
            table: {
              type: 'string',
              description: 'Table name (required for describe_table)',
            },
          },
          required: ['action'],
        },
      },
      {
        name: 'show_table_data',
        description: 'Display table data in a formatted, user-friendly way with automatic pagination and column information',
        inputSchema: {
          type: 'object',
          properties: {
            table: {
              type: 'string',
              description: 'Table name to display data from',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of rows to display (default: 50, max: 1000)',
              minimum: 1,
              maximum: 1000,
            },
            offset: {
              type: 'number',
              description: 'Number of rows to skip (default: 0)',
              minimum: 0,
            },
            columns: {
              type: 'array',
              items: { type: 'string' },
              description: 'Specific columns to display (default: all columns)',
            },
            where: {
              type: 'object',
              description: 'Filter conditions as key-value pairs',
            },
            orderBy: {
              type: 'string',
              description: 'Column to sort by (default: primary key or first column)',
            },
            orderDirection: {
              type: 'string',
              enum: ['ASC', 'DESC'],
              description: 'Sort direction (default: ASC)',
            },
            showSchema: {
              type: 'boolean',
              description: 'Include table schema information in the output (default: true)',
            },
            format: {
              type: 'string',
              enum: ['table', 'json', 'csv'],
              description: 'Output format (default: table)',
            },
          },
          required: ['table'],
        },
      },
    ];
  }

  protected async handleBulkInsert(args: any): Promise<any> {
    throw new Error('handleBulkInsert not implemented');
  }

  protected async handleAddColumn(args: any): Promise<any> {
    throw new Error('handleAddColumn not implemented');
  }

  protected async handleDropColumn(args: any): Promise<any> {
    throw new Error('handleDropColumn not implemented');
  }

  protected async handleModifyColumn(args: any): Promise<any> {
    throw new Error('handleModifyColumn not implemented');
  }

  protected async handleRenameColumn(args: any): Promise<any> {
    throw new Error('handleRenameColumn not implemented');
  }

  protected async handleRenameTable(args: any): Promise<any> {
    throw new Error('handleRenameTable not implemented');
  }

  protected async handleAddIndex(args: any): Promise<any> {
    throw new Error('handleAddIndex not implemented');
  }

  protected async handleDropIndex(args: any): Promise<any> {
    throw new Error('handleDropIndex not implemented');
  }

  protected async handleShowTableData(args: any): Promise<any> {
    throw new Error('handleShowTableData not implemented');
  }

  protected async handleUtility(args: any): Promise<any> {
    throw new Error('handleUtility not implemented');
  }

  protected async handleDescribeTable(args: any): Promise<any> {
    throw new Error('handleDescribeTable not implemented');
  }

  private async executeTool(name: string, args: any): Promise<any> {
    switch (name) {
      case 'list':
        return this.handleList(args);
      case 'describe_table':
        return this.handleDescribeTable(args);
      case 'read':
        return this.handleRead(args);
      case 'create':
        return this.handleCreate(args);
      case 'update':
        return this.handleUpdate(args);
      case 'delete':
        return this.handleDelete(args);
      case 'execute':
        return this.handleExecute(args);
      case 'ddl':
        return this.handleDDL(args);
      case 'transaction':
        return this.handleTransaction(args);
      case 'bulk_insert':
        return this.handleBulkInsert(args);
      case 'add_column':
        return this.handleAddColumn(args);
      case 'drop_column':
        return this.handleDropColumn(args);
      case 'modify_column':
        return this.handleModifyColumn(args);
      case 'rename_column':
        return this.handleRenameColumn(args);
      case 'rename_table':
        return this.handleRenameTable(args);
      case 'add_index':
        return this.handleAddIndex(args);
      case 'drop_index':
        return this.handleDropIndex(args);
      case 'show_table_data':
        return this.handleShowTableData(args);
      case 'utility':
        return this.handleUtility(args);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  protected async handleList(args: any): Promise<any> {
    throw new Error('handleList not implemented');
  }

  protected async handleRead(args: any): Promise<any> {
    throw new Error('handleRead not implemented');
  }

  protected async handleCreate(args: any): Promise<any> {
    throw new Error('handleCreate not implemented');
  }

  protected async handleUpdate(args: any): Promise<any> {
    throw new Error('handleUpdate not implemented');
  }

  protected async handleDelete(args: any): Promise<any> {
    throw new Error('handleDelete not implemented');
  }

  protected async handleExecute(args: any): Promise<any> {
    throw new Error('handleExecute not implemented');
  }

  protected async handleDDL(args: any): Promise<any> {
    throw new Error('handleDDL not implemented');
  }

  protected async handleTransaction(args: any): Promise<any> {
    throw new Error('handleTransaction not implemented');
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info('MySQL MCP Server started and connected via stdio');
  }

  protected cleanup(): void {
    logger.info('Cleaning up MySQL MCP Server');
  }

  getDatabaseConfig(): DatabaseConfig {
    return this.dbConfig;
  }
}