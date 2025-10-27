# KatCoder MySQL MCP Server

A secure and feature-rich MySQL Model Context Protocol (MCP) server that enables AI agents and applications to interact with MySQL databases through a standardized interface.

## Features

### 🔒 Security First
- **SQL Injection Prevention**: Comprehensive input validation and sanitization
- **Identifier Validation**: Strict validation of table and column names
- **Query Whitelisting**: Read-only operations by default, write operations require explicit permission
- **Connection Pooling**: Secure connection management with timeout controls
- **Error Handling**: Secure error messages that don't expose sensitive information

### 🛠️ Database Operations
- **List**: Browse tables and view table structures
- **Read**: Query data with filtering, pagination, and sorting
- **Create**: Insert new records with validation
- **Add Column**: Add new columns to existing tables with full type and constraint support
- **Drop Column**: Remove columns from tables with safety checks
- **Modify Column**: Change column definitions (type, constraints, defaults)
- **Rename Column**: Rename existing columns while preserving data
- **Rename Table**: Rename tables with safety validation
- **Add Index**: Create indexes (BTREE, HASH, FULLTEXT, SPATIAL) with unique constraints
- **Drop Index**: Remove indexes from tables
- **Bulk Insert**: Efficiently insert multiple records in a single operation
- **Update**: Modify existing records safely
- **Delete**: Remove records with mandatory WHERE clauses
- **Execute**: Run custom SQL queries with security restrictions
- **DDL**: Execute Data Definition Language statements
- **Transaction**: Execute multiple operations atomically
- **Utility**: Database health checks and metadata operations

### 🔧 Configuration Options
- **Connection String**: Standard MySQL connection format
- **Tool Selection**: Enable only the tools you need
- **Connection Pooling**: Configurable pool settings
- **Timeout Controls**: Connection and query timeouts

## Tool Permissions & Security

### 🎯 Recommended Approach: Use "all" Tools

**For most use cases, we recommend enabling all tools** by using `"all"` as the tool parameter. This provides:

- **Full Functionality**: Access to all database operations including DDL, transactions, and advanced features
- **AI Agent Compatibility**: Ensures AI agents can see and use all available tools
- **Future-Proof**: Automatically includes new tools as they're added
- **Simplified Configuration**: No need to manually list specific tools

```bash
# Recommended: Enable all tools
npx katcoder-mysql-mcp "mysql://user:password@localhost:3306/mydb" "all"
```

### 🔒 Security-First Approach: Manual Tool Selection

**Use manual tool selection only when you need to restrict access** for security or compliance reasons:

#### Read-Only Access
Perfect for reporting, analytics, or read-only AI agents:
```bash
npx katcoder-mysql-mcp "mysql://readonly:password@localhost:3306/mydb" "list,read,utility"
```

**Available tools:** `list`, `read`, `utility`
- **list**: Browse tables and schema
- **read**: Query data with filtering and pagination
- **utility**: Database health checks and metadata

#### Basic Write Access
For applications that need to modify data but not schema:
```bash
npx katcoder-mysql-mcp "mysql://writer:password@localhost:3306/mydb" "list,read,create,update,delete,utility"
```

**Available tools:** `list`, `read`, `create`, `update`, `delete`, `utility`
- Includes all read-only tools plus:
- **create**: Insert new records
- **update**: Modify existing records
- **delete**: Remove records (with mandatory WHERE clauses)

#### Full Database Access
For database administrators and development environments:
```bash
npx katcoder-mysql-mcp "mysql://admin:password@localhost:3306/mydb" "all"
```

**All available tools:** `list`, `read`, `create`, `update`, `delete`, `execute`, `ddl`, `transaction`, `bulk_insert`, `utility`, `add_column`, `drop_column`, `modify_column`, `rename_column`, `rename_table`, `add_index`, `drop_index`, `show_table_data`

### 🛡️ Security Considerations

#### Database User Permissions
**Always use MySQL user accounts with appropriate privileges:**

```sql
-- Read-only user
CREATE USER 'readonly'@'%' IDENTIFIED BY 'secure_password';
GRANT SELECT ON mydb.* TO 'readonly'@'%';

-- Write user (no DDL)
CREATE USER 'writer'@'%' IDENTIFIED BY 'secure_password';
GRANT SELECT, INSERT, UPDATE, DELETE ON mydb.* TO 'writer'@'%';

-- Admin user (full access)
CREATE USER 'admin'@'%' IDENTIFIED BY 'secure_password';
GRANT ALL PRIVILEGES ON mydb.* TO 'admin'@'%';

FLUSH PRIVILEGES;
```

#### Tool-Level vs Database-Level Security
- **Tool-level restrictions** limit what operations the MCP server can perform
- **Database-level permissions** provide the ultimate security boundary
- **Best practice**: Use both layers for defense in depth

#### Production Recommendations
1. **Use specific database users** with minimal required privileges
2. **Enable only necessary tools** for production environments
3. **Use read-only connections** for reporting and analytics
4. **Monitor database access** and audit tool usage
5. **Use environment variables** for connection strings (never hardcode passwords)

### 📊 Tool Selection Quick Reference

| Use Case | Recommended Tools | Security Level |
|----------|------------------|----------------|
| **AI Development** | `"all"` | Medium (use dev database) |
| **Production AI** | `"all"` | High (restricted DB user) |
| **Reporting/Analytics** | `"list,read,utility"` | High |
| **Data Entry Apps** | `"list,read,create,update,delete,utility"` | Medium |
| **Database Admin** | `"all"` | Low (trusted environment) |
| **CI/CD Pipelines** | `"all"` | Medium (isolated environment) |

## Installation

> **Note**: This package is currently in development and not yet published to npm. Use the development installation method below.

### Development Installation (Recommended)
```bash
git clone https://github.com/katkoder/katcoder-mysql-mcp.git
cd katcoder-mysql-mcp
npm install
npm run build
```

### Future npm Installation (Coming Soon)
Once published to npm, you will be able to install globally:
```bash
# This will be available after publication
npm install -g katcoder-mysql-mcp
```

### Local npm Installation (Coming Soon)
```bash
# This will be available after publication
npm install katcoder-mysql-mcp
```

## Usage

### Command Line Interface

#### Current Development Usage
```bash
# After building the project (npm run build)
# Basic usage with all tools enabled
node dist/cli.js "mysql://user:password@localhost:3306/database_name"

# With all tools enabled (recommended)
node dist/cli.js "mysql://user:password@localhost:3306/database_name" "all"

# With specific tools enabled (if you need to limit access)
node dist/cli.js "mysql://user:password@localhost:3306/database_name" "list,read,utility"

# With verbose logging
node dist/cli.js "mysql://user:password@localhost:3306/database_name" "all" --verbose
```

#### Future npm Usage (After Publication)
```bash
# Basic usage with all tools enabled
npx katcoder-mysql-mcp "mysql://user:password@localhost:3306/database_name"

# With all tools enabled (recommended)
npx katcoder-mysql-mcp "mysql://user:password@localhost:3306/database_name" "all"

# With specific tools enabled (if you need to limit access)
npx katcoder-mysql-mcp "mysql://user:password@localhost:3306/database_name" "list,read,utility"

# With verbose logging
npx katcoder-mysql-mcp "mysql://user:password@localhost:3306/database_name" "all" --verbose
```

### Configuration for AI Agents

#### Current Development Configuration

**Claude Desktop Configuration:**
Add this configuration to your Claude Desktop configuration file:

```json
{
  "mcpServers": {
    "katkoder_mysql": {
      "command": "node",
      "args": [
        "/path/to/katcoder-mysql-mcp/dist/cli.js",
        "mysql://root:password@localhost:3306/production_db",
        "all"
      ],
      "cwd": "/path/to/katcoder-mysql-mcp"
    }
  }
}
```

**Cursor IDE Configuration:**
For Cursor IDE, add to your settings:

```json
{
  "mcp.servers": {
    "katkoder_mysql": {
      "command": "node",
      "args": [
        "/path/to/katcoder-mysql-mcp/dist/cli.js",
        "mysql://user:password@localhost:3306/development_db",
        "all"
      ],
      "cwd": "/path/to/katcoder-mysql-mcp"
    }
  }
}
```

#### Future npm Configuration (After Publication)

**Claude Desktop Configuration:**
```json
{
  "mcpServers": {
    "katkoder_mysql": {
      "command": "npx",
      "args": [
        "-y",
        "katcoder-mysql-mcp",
        "mysql://root:password@localhost:3306/production_db",
        "all"
      ]
    }
  }
}
```

**Cursor IDE Configuration:**
```json
{
  "mcp.servers": {
    "katkoder_mysql": {
      "command": "npx",
      "args": [
        "-y",
        "katcoder-mysql-mcp",
        "mysql://user:password@localhost:3306/development_db",
        "all"
      ]
    }
  }
}
```

### Connection String Format

```
mysql://[user[:password]@]host[:port]/database
```

#### Basic Examples:
- `mysql://root@localhost:3306/mydb` - Local database without password
- `mysql://user:password@localhost:3306/mydb` - Local database with password
- `mysql://user:password@192.168.1.100:3306/mydb` - Remote database

#### Advanced Examples:
- `mysql://user:password@db.example.com:3306/production?ssl=true` - Remote database with SSL
- `mysql://root:password@mysql-container:3306/docker_db` - Docker database
- `mysql://user:password@localhost:3307/alternative_port` - Different port

## Available Tools

### 1. List Tool
Browse database structure and table information.

**Parameters:**
- `table` (optional): Specific table name to get column information

**Examples:**
```json
{
  "name": "list",
  "arguments": {}
}

{
  "name": "list",
  "arguments": {
    "table": "users"
  }
}
```

**Practical Usage Scenarios:**
- **Database Discovery**: When connecting to a new database, use the list tool without parameters to see all available tables
- **Schema Exploration**: Use with a table name to understand the structure before writing queries
- **Data Modeling**: Examine relationships between tables by checking foreign key constraints
- **Migration Planning**: Understand existing schema before making changes

### 2. Read Tool
Query data from tables with filtering and pagination.

**Parameters:**
- `table` (required): Table name to query
- `columns` (optional): Array of specific columns to select
- `where` (optional): Object with filter conditions
- `limit` (optional): Maximum number of rows (max: 10,000)
- `offset` (optional): Number of rows to skip
- `orderBy` (optional): Order by clause

**Basic Examples:**
```json
{
  "name": "read",
  "arguments": {
    "table": "users",
    "columns": ["id", "name", "email"],
    "where": {"status": "active"},
    "limit": 10,
    "orderBy": "created_at DESC"
  }
}

{
  "name": "read",
  "arguments": {
    "table": "products",
    "where": {"category": "electronics", "price": {"$gt": 100}},
    "limit": 50
  }
}
```

**Advanced Filtering Examples:**
```json
{
  "name": "read",
  "arguments": {
    "table": "users",
    "columns": ["id", "email", "created_at"],
    "where": {"status": "active", "created_at": {"$gte": "2024-01-01"}},
    "limit": 25,
    "offset": 50,
    "orderBy": "last_login DESC"
  }
}
```

### 3. Bulk Insert Tool
Efficiently insert multiple records into a table in a single operation.

**Parameters:**
- `table` (required): Target table name
- `data` (required): Array of objects with identical column-value pairs

**Examples:**
```json
{
  "name": "bulk_insert",
  "arguments": {
    "table": "users",
    "data": [
      {
        "name": "John Doe",
        "email": "john@example.com",
        "age": 30,
        "status": "active"
      },
      {
        "name": "Jane Smith",
        "email": "jane@example.com",
        "age": 25,
        "status": "active"
      },
      {
        "name": "Bob Wilson",
        "email": "bob@example.com",
        "age": 35,
        "status": "inactive"
      }
    ]
  }
}
```

**Usage in Transactions:**
```json
{
  "name": "transaction",
  "arguments": {
    "operations": [
      {
        "type": "bulk_insert",
        "table": "users",
        "data": [
          {
            "name": "Alice Brown",
            "email": "alice@example.com",
            "age": 28,
            "status": "active"
          }
        ]
      },
      {
        "type": "update",
        "table": "user_stats",
        "data": { "total_users": 1 },
        "where": { "id": 1 }
      }
    ]
  }
}
```

**Response Format:**
```json
{
  "success": true,
  "table": "users",
  "recordCount": 3,
  "affectedRows": 3,
  "insertedId": 1,
  "message": "Successfully inserted 3 records into users"
}
```

### 4. Create Tool
Insert new records into tables.

**Parameters:**
- `table` (required): Target table name
- `data` (required): Object with column-value pairs

**Examples:**
```json
{
  "name": "create",
  "arguments": {
    "table": "users",
    "data": {
      "name": "John Doe",
      "email": "john@example.com",
      "status": "active"
    }
  }
}
```

### 4. Update Tool
Modify existing records safely.

**Parameters:**
- `table` (required): Target table name
- `data` (required): Object with column-value pairs to update
- `where` (required): Object with filter conditions

**Examples:**
```json
{
  "name": "update",
  "arguments": {
    "table": "users",
    "data": {
      "status": "inactive",
      "updated_at": "2024-01-01 12:00:00"
    },
    "where": {"id": 123}
  }
}
```

### 5. Delete Tool
Remove records with mandatory WHERE clauses.

**Parameters:**
- `table` (required): Target table name
- `where` (required): Object with filter conditions

**Examples:**
```json
{
  "name": "delete",
  "arguments": {
    "table": "sessions",
    "where": {"expired": true}
  }
}
```

### 6. Execute Tool
Run custom SQL queries with security restrictions.

**Parameters:**
- `query` (required): SQL query string
- `params` (optional): Array of query parameters
- `allowWrite` (optional): Boolean to allow write operations

**Basic Examples:**
```json
{
  "name": "execute",
  "arguments": {
    "query": "SELECT COUNT(*) as total FROM users WHERE created_at > ?",
    "params": ["2024-01-01"]
  }
}

{
  "name": "execute",
  "arguments": {
    "query": "UPDATE users SET last_login = NOW() WHERE id = ?",
    "params": [123],
    "allowWrite": true
  }
}
```

**Complex Query Examples:**
```json
{
  "name": "execute",
  "arguments": {
    "query": "SELECT u.email, COUNT(o.id) as order_count FROM users u LEFT JOIN orders o ON u.id = o.user_id GROUP BY u.id HAVING order_count > 5"
  }
}

{
  "name": "execute",
  "arguments": {
    "query": "SELECT DATE(created_at) as date, COUNT(*) as daily_signups FROM users WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) GROUP BY DATE(created_at) ORDER BY date",
    "params": []
  }
}
```

### 7. DDL Tool
Execute Data Definition Language statements.

**Parameters:**
- `statement` (required): DDL statement

**Examples:**
```json
{
  "name": "ddl",
  "arguments": {
    "statement": "CREATE INDEX idx_email ON users(email)"
  }
}

### 8. Add Column Tool
Add new columns to existing tables with comprehensive type and constraint support.

**Parameters:**
- `table` (required): Target table name
- `column` (required): Object with column definition
  - `name` (required): New column name
  - `type` (required): Column data type (e.g., VARCHAR(255), INT, DATETIME)
  - `nullable` (optional): Whether column can contain NULL values
  - `default` (optional): Default value for the column
  - `autoIncrement` (optional): Whether column should auto-increment
  - `comment` (optional): Column comment
- `position` (optional): Object specifying column position
  - `after` (optional): Place column after this existing column
  - `first` (optional): Place column as the first column

**Examples:**
```json
{
  "name": "add_column",
  "arguments": {
    "table": "users",
    "column": {
      "name": "email",
      "type": "VARCHAR(255)",
      "nullable": false,
      "default": "no-email@example.com"
    },
    "position": {
      "after": "name"
    }
  }
}
```

```json
{
  "name": "add_column",
  "arguments": {
    "table": "products",
    "column": {
      "name": "is_active",
      "type": "BOOLEAN",
      "default": true,
      "comment": "Product availability status"
    }
  }
}
```

### 9. Drop Column Tool
Remove columns from tables with safety validation.

**Parameters:**
- `table` (required): Table name to remove column from
- `column` (required): Column name to drop

**Examples:**
```json
{
  "name": "drop_column",
  "arguments": {
    "table": "users",
    "column": "old_field"
  }
}
```

### 10. Modify Column Tool
Change existing column definitions including type, constraints, and defaults.

**Parameters:**
- `table` (required): Table name containing the column
- `column` (required): Column name to modify
- `newDefinition` (required): Object with new column definition
  - `type` (required): New column data type
  - `nullable` (optional): Whether column can contain NULL values
  - `default` (optional): New default value
  - `comment` (optional): Column comment

**Examples:**
```json
{
  "name": "modify_column",
  "arguments": {
    "table": "users",
    "column": "age",
    "newDefinition": {
      "type": "INT",
      "nullable": true,
      "default": null
    }
  }
}
```

### 11. Rename Column Tool
Rename existing columns while preserving data.

**Parameters:**
- `table` (required): Table name containing the column
- `oldName` (required): Current column name
- `newName` (required): New column name
- `newDefinition` (optional): Column definition for the renamed column

**Examples:**
```json
{
  "name": "rename_column",
  "arguments": {
    "table": "users",
    "oldName": "user_name",
    "newName": "username"
  }
}
```

### 12. Rename Table Tool
Rename tables with safety validation.

**Parameters:**
- `oldName` (required): Current table name
- `newName` (required): New table name

**Examples:**
```json
{
  "name": "rename_table",
  "arguments": {
    "oldName": "user_profiles",
    "newName": "user_settings"
  }
}
```

### 13. Add Index Tool
Create indexes on tables for improved query performance.

**Parameters:**
- `table` (required): Table name to add index to
- `name` (required): Index name
- `columns` (required): Array of column names to include in the index
- `type` (optional): Index type (BTREE, HASH, FULLTEXT, SPATIAL)
- `unique` (optional): Whether the index should be unique

**Examples:**
```json
{
  "name": "add_index",
  "arguments": {
    "table": "users",
    "name": "idx_email",
    "columns": ["email"],
    "unique": true
  }
}
```

```json
{
  "name": "add_index",
  "arguments": {
    "table": "products",
    "name": "idx_category_price",
    "columns": ["category_id", "price"],
    "type": "BTREE"
  }
}
```

### 14. Drop Index Tool
Remove indexes from tables.

**Parameters:**
- `table` (required): Table name containing the index
- `name` (required): Index name to drop

**Examples:**
```json
{
  "name": "drop_index",
  "arguments": {
    "table": "users",
    "name": "idx_temp"
  }
}
```

### 15. Transaction Tool
Execute multiple operations atomically.

**Parameters:**
- `operations` (required): Array of operations to execute in transaction

**Basic Examples:**
```json
{
  "name": "transaction",
  "arguments": [
    {
      "type": "create",
      "table": "orders",
      "data": {"user_id": 123, "total": 99.99}
    },
    {
      "type": "update",
      "table": "users",
      "data": {"last_order_date": "2024-01-01"},
      "where": {"id": 123}
    }
  ]
}
```

**Advanced Transaction Examples with Schema Changes:**
```json
{
  "name": "transaction",
  "arguments": {
    "operations": [
      {
        "type": "add_column",
        "table": "users",
        "column": {
          "name": "phone",
          "type": "VARCHAR(20)",
          "nullable": true
        }
      },
      {
        "type": "add_index",
        "table": "users",
        "name": "idx_phone",
        "columns": ["phone"],
        "unique": true
      },
      {
        "type": "update",
        "table": "users",
        "data": {"phone": "+1234567890"},
        "where": {"id": 1}
      }
    ]
  }
}
```

**Response Format:**
```json
{
  "success": true,
  "operations": 3,
  "results": [
    {
      "description": "Add column 'phone' to table 'users'",
### v1.1.0 (Latest)
- **New Feature**: Added Comprehensive Schema Modification Tools
  - Implemented `add_column` tool for adding new columns with full type and constraint support
  - Implemented `drop_column` tool for safely removing columns from tables
  - Implemented `modify_column` tool for changing column definitions
  - Implemented `rename_column` tool for renaming existing columns
  - Implemented `rename_table` tool for renaming tables
  - Implemented `add_index` tool for creating various types of indexes
  - Implemented `drop_index` tool for removing indexes from tables
  - Added comprehensive schema validation and security measures
  - Enhanced transaction support for schema operations with rollback mechanisms
  - Added detailed documentation with examples and usage scenarios

### v1.0.1
- **New Feature**: Added Bulk Insert Tool for efficient multi-record insertion
  - Implemented `bulk_insert` tool for batch data imports
  - Supports inserting multiple records in a single database operation
  - Includes comprehensive validation and error handling
  - Can be used within transactions for atomic operations
  - Added detailed documentation with examples and usage scenarios

### v1.0.0
- Initial release
- All database operations implemented
- Comprehensive security features
- Full documentation
      "affectedRows": 0
    },
    {
      "description": "Create unique index 'idx_phone' on table 'users'",
      "affectedRows": 0
    },
    {
      "description": "Update user record with phone number",
      "affectedRows": 1
    }
  ]
}
```
{
  "name": "ddl",
  "arguments": {
    "statement": "ALTER TABLE users ADD COLUMN phone VARCHAR(20)"
  }
}
```

### 8. Transaction Tool
Execute multiple operations atomically.

**Parameters:**
- `operations` (required): Array of operations to execute

**Basic Examples:**
```json
{
  "name": "transaction",
  "arguments": {
    "operations": [
      {
        "type": "create",
        "table": "orders",
        "data": {"user_id": 123, "total": 99.99}
      },
      {
        "type": "update",
        "table": "users",
        "data": {"last_order_date": "2024-01-01"},
        "where": {"id": 123}
      }
    ]
  }
}
```

**Advanced Transaction Examples:**
```json
{
  "name": "transaction",
  "arguments": {
    "operations": [
      {
        "type": "create",
        "table": "orders",
        "data": {"user_id": 123, "total": 99.99, "status": "pending"}
      },
      {
        "type": "update",
        "table": "users",
        "data": {"last_order_date": "2024-01-01"},
        "where": {"id": 123}
      },
      {
        "type": "create",
        "table": "order_items",
        "data": {"order_id": "LAST_INSERT_ID()", "product_id": 456, "quantity": 2}
      }
    ]
  }
}
```

### 9. Utility Tool
Database health checks and metadata operations.

**Parameters:**
- `action` (required): Utility action (ping, version, stats, describe_table)
- `table` (optional): Table name (required for describe_table)

**Examples:**
```json
{
  "name": "utility",
  "arguments": {
    "action": "ping"
  }
}

{
  "name": "utility",
  "arguments": {
    "action": "stats"
  }
}

{
  "name": "utility",
  "arguments": {
    "action": "describe_table",
    "table": "users"
  }
}
```

### 10. Show Table Data Tool
Display table data with advanced formatting, pagination, and schema information.

**Parameters:**
- `table` (required): Table name to display data from
- `limit` (optional): Maximum number of rows to display (default: 50, max: 1000)
- `offset` (optional): Number of rows to skip for pagination (default: 0)
- `columns` (optional): Array of specific columns to display (default: all columns)
- `where` (optional): Object with filter conditions (same format as read tool)
- `orderBy` (optional): Column name to sort by (defaults to primary key or first column)
- `orderDirection` (optional): Sort direction - 'ASC' or 'DESC' (default: 'ASC')
- `showSchema` (optional): Include table schema information (default: true)
- `format` (optional): Output format - 'table', 'json', or 'csv' (default: 'table')

**Basic Examples:**
```json
{
  "name": "show_table_data",
  "arguments": {
    "table": "users"
  }
}

{
  "name": "show_table_data",
  "arguments": {
    "table": "products",
    "limit": 25,
    "columns": ["id", "name", "price", "category"],
    "orderBy": "price",
    "orderDirection": "DESC"
  }
}
```

**Advanced Examples:**
```json
{
  "name": "show_table_data",
  "arguments": {
    "table": "orders",
    "where": {"status": "pending", "created_at": {"$gte": "2024-01-01"}},
    "limit": 100,
    "offset": 50,
    "format": "csv",
    "showSchema": false
  }
}

{
  "name": "show_table_data",
  "arguments": {
    "table": "users",
    "columns": ["id", "email", "last_login"],
    "where": {"status": "active"},
    "orderBy": "last_login",
    "orderDirection": "DESC",
    "format": "json"
  }
}
```

**Response Format:**
```json
{
  "success": true,
  "table": "users",
  "format": "table",
  "pagination": {
    "currentPage": 1,
    "totalPages": 5,
    "limit": 50,
    "offset": 0,
    "totalRows": 247,
    "hasMore": true,
    "showing": "1-50 of 247"
  },
  "data": [...],
  "displayInfo": "formatted table string (for table format)",
  "count": 50,
  "schema": {
    "columns": [...],
    "totalColumns": 8
  }
}
```

**Practical Usage Scenarios:**
- **Data Exploration**: Quickly browse table contents with automatic formatting
- **Data Export**: Export table data in CSV format for external analysis
- **Debugging**: View specific rows with filtering and pagination
- **Schema Analysis**: Examine table structure alongside data
- **Report Generation**: Generate formatted data displays for documentation

## Security Features

### SQL Injection Prevention
- **Input Sanitization**: All table and column names are sanitized
- **Parameter Binding**: All queries use parameterized statements
- **Query Validation**: Dangerous SQL patterns are blocked
- **Write Operation Protection**: Write operations require explicit permission

### Identifier Validation
- **Table Names**: Only alphanumeric characters and underscores allowed
- **Column Names**: Validated against SQL injection patterns
- **Where Conditions**: Values are checked for dangerous content

### Connection Security
- **Connection Pooling**: Secure connection management
- **Timeout Controls**: Prevents hanging connections
- **Error Handling**: Secure error messages without sensitive data

## Security Best Practices

### 1. Recommended Setup: All Tools with Restricted Database User
**Best practice for production and AI agents:**

```sql
-- Create user with appropriate database-level permissions
CREATE USER 'mcp_ai_agent'@'localhost' IDENTIFIED BY 'secure_password';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, DROP ON myapp.* TO 'mcp_ai_agent'@'localhost';
FLUSH PRIVILEGES;
```

```bash
# Enable all tools - database permissions provide the security boundary
npx katcoder-mysql-mcp "mysql://mcp_ai_agent:secure_password@localhost:3306/myapp" "all"
```

**Why this approach works:**
- ✅ AI agents can see and use all available tools
- ✅ Database user permissions control actual access
- ✅ Future-proof as new tools are automatically available
- ✅ Simplified configuration management

### 2. Security-First Scenarios

#### Read-Only Analytics/Reporting
```sql
CREATE USER 'mcp_readonly'@'localhost' IDENTIFIED BY 'secure_password';
GRANT SELECT ON myapp.* TO 'mcp_readonly'@'localhost';
FLUSH PRIVILEGES;
```

```bash
# Restrict tools to read-only operations
npx katcoder-mysql-mcp "mysql://mcp_readonly:secure_password@localhost:3306/myapp" "list,read,utility"
```

#### Data Entry Applications (No Schema Changes)
```sql
CREATE USER 'mcp_writer'@'localhost' IDENTIFIED BY 'secure_password';
GRANT SELECT, INSERT, UPDATE, DELETE ON myapp.* TO 'mcp_writer'@'localhost';
FLUSH PRIVILEGES;
```

```bash
# Allow data operations but restrict DDL tools
npx katcoder-mysql-mcp "mysql://mcp_writer:secure_password@localhost:3306/myapp" "list,read,create,update,delete,bulk_insert,utility"
```

### 3. Development Environment
```bash
# Development: Use all tools with admin user
npx katcoder-mysql-mcp "mysql://root:password@localhost:3306/dev_db" "all"
```

### 4. Environment Variables (Recommended)
```bash
# Set connection string as environment variable
export MYSQL_URL="mysql://mcp_ai_agent:secure_password@localhost:3306/myapp"

# Use with all tools enabled
npx katcoder-mysql-mcp "$MYSQL_URL" "all"

# Or with specific tools for restricted access
npx katcoder-mysql-mcp "$MYSQL_URL" "list,read,utility"
```

### 5. Docker/Container Environments
```bash
# Using Docker secrets or environment variables
export MYSQL_URL="mysql://mcp_user:${DB_PASSWORD}@mysql-container:3306/production_db"
npx katcoder-mysql-mcp "$MYSQL_URL" "all"
```

## Quick Reference: Choosing the Right Permission Approach

| Use Case | Recommended Tools | Database Permissions | Security Level |
|----------|------------------|---------------------|----------------|
| **AI Development & Prototyping** | `"all"` | Full admin access | Low (dev only) |
| **Production AI Agent** | `"all"` | Limited to specific database/schema | High ⭐ |
| **Read-only Analytics** | `"list,read,utility"` | SELECT only | High |
| **Data Entry App** | `"list,read,create,update,delete,bulk_insert,utility"` | No DDL permissions | Medium |
| **Schema Migration Tool** | `"all"` | DDL permissions required | Medium |
| **Reporting Dashboard** | `"list,read,utility"` | SELECT only | High |

### 🎯 **Most Common Setup (Recommended)**
```bash
# 1. Create restricted database user
CREATE USER 'mcp_agent'@'localhost' IDENTIFIED BY 'secure_password';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, DROP ON your_app.* TO 'mcp_agent'@'localhost';

# 2. Use all tools - security handled by database permissions
npx katcoder-mysql-mcp "mysql://mcp_agent:secure_password@localhost:3306/your_app" "all"
```

**Why this works:** Database permissions provide the real security boundary, while "all" tools ensure AI agents can see and use all available functionality.

## Error Handling

The server provides detailed error messages while maintaining security:

```json
{
  "error": true,
  "message": "Table 'nonexistent_table' does not exist",
  "details": "Check the table name and try again"
}
```

## Development

### Building the Project
```bash
npm run build
```

### Running in Development Mode
```bash
npm run dev
```

### Testing
```bash
npm test
```

## Environment Variables

- `LOG_LEVEL`: Set logging level (debug, info, warn, error)
- `NODE_ENV`: Set environment (development, production)

## Troubleshooting

### Connection Issues
- Verify MySQL server is running
- Check connection string format
- Ensure database exists
- Verify user permissions

#### Test Connection
```bash
# Test with all tools enabled
npx katcoder-mysql-mcp "mysql://user:password@localhost:3306/mydb" "all"

# Then use: {"name": "utility", "arguments": {"action": "ping"}}
```

#### Check Database Version
```bash
npx katcoder-mysql-mcp "mysql://user:password@localhost:3306/mydb" "all"

# Then use: {"name": "utility", "arguments": {"action": "version"}}
```

### Permission Errors
- Check MySQL user privileges
- Ensure database access is granted
- Verify table-level permissions

### Performance Issues
- Monitor connection pool usage
- Check query execution times
- Optimize database indexes

#### Monitor Performance
```bash
npx katcoder-mysql-mcp "mysql://user:password@localhost:3306/mydb" "all"

# Then use: {"name": "utility", "arguments": {"action": "stats"}}
```

## Advanced Configuration

### Custom Connection Pool Settings
```bash
# Environment variables for connection tuning
export MYSQL_CONNECTION_LIMIT=20
export MYSQL_ACQUIRE_TIMEOUT=30000
export MYSQL_TIMEOUT=45000

npx katcoder-mysql-mcp "mysql://user:password@localhost:3306/mydb"
```

### Logging Configuration
```bash
# Enable debug logging
export LOG_LEVEL=debug

# Enable verbose output
npx katcoder-mysql-mcp "mysql://user:password@localhost:3306/mydb" "all" --verbose
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For issues and questions:
- GitHub Issues: https://github.com/katkoder/katcoder-mysql-mcp/issues
- Documentation: https://github.com/katkoder/katcoder-mysql-mcp/wiki

## Changelog

### v1.0.1 (Latest)
- **New Feature**: Added Bulk Insert Tool for efficient multi-record insertion
  - Implemented `bulk_insert` tool for batch data imports
  - Supports inserting multiple records in a single database operation
  - Includes comprehensive validation and error handling
  - Can be used within transactions for atomic operations
  - Added detailed documentation with examples and usage scenarios

### v1.0.0
- Initial release
- All database operations implemented
- Comprehensive security features
- Full documentation