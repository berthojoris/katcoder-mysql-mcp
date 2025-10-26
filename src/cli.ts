#!/usr/bin/env node

import { Command } from 'commander';
import winston from 'winston';
import { MySQLMCPImplementation } from './implementation';
import { MCPServerConfig } from './server';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `[${timestamp}] ${level}: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console()
  ]
});

const program = new Command();

program
  .name('katcoder-mysql-mcp')
  .description('KatCoder MySQL Model Context Protocol Server')
  .version('1.0.0')
  .argument('<connectionString>', 'MySQL connection string (mysql://user:password@host:port/database)')
  .argument('[enabledTools]', 'Comma-separated list of enabled tools (default: all)', 'all')
  .option('-v, --verbose', 'Enable verbose logging')
  .action(async (connectionString: string, enabledTools: string, options: { verbose?: boolean }) => {
    try {
      if (options.verbose) {
        logger.level = 'debug';
      }

      logger.info('Starting KatCoder MySQL MCP Server');
      logger.info(`Connection: ${connectionString.replace(/:([^@]+)@/, ':***@')}`);
      logger.info(`Enabled tools: ${enabledTools}`);

      // Parse enabled tools
      const tools = enabledTools === 'all'
        ? ['list', 'read', 'create', 'update', 'delete', 'execute', 'ddl', 'transaction', 'bulk_insert', 'utility']
        : enabledTools.split(',').map(tool => tool.trim());

      // Validate connection string
      if (!connectionString.startsWith('mysql://')) {
        throw new Error('Connection string must start with mysql://');
      }

      // Create and start server
      const config: MCPServerConfig = {
        connectionString,
        enabledTools: tools
      };
      const server = new MySQLMCPImplementation(config);
      await server.run();

      logger.info('MySQL MCP Server started successfully');
      logger.info('Server is ready to handle requests');

      // Handle graceful shutdown
      const shutdown = async () => {
        logger.info('Shutting down MySQL MCP Server...');
        logger.info('Server shut down successfully');
        process.exit(0);
      };

      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);

    } catch (error) {
      logger.error(`Failed to start server: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });

program.parse();