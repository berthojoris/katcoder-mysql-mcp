import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
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
                    enum: ['create', 'update', 'delete', 'execute'],
                  },
                  table: { type: 'string' },
                  data: { type: 'object' },
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
    ];
  }

  private async executeTool(name: string, args: any): Promise<any> {
    switch (name) {
      case 'list':
        return this.handleList(args);
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

  protected async handleUtility(args: any): Promise<any> {
    throw new Error('handleUtility not implemented');
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