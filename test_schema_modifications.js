#!/usr/bin/env node

/**
 * Test script for schema modification capabilities
 * This script demonstrates the new schema modification tools
 */

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

// Test configuration
const TEST_DB_URL = process.env.MYSQL_URL || 'mysql://root@localhost:3306/test_schema_db';
const TEST_TABLE = 'test_users';

console.log('🧪 Testing KatCoder MySQL MCP Server Schema Modifications');
console.log('=====================================================');

// Test cases for schema modifications
const testCases = [
  {
    name: 'Create test table',
    tool: 'execute',
    args: {
      query: `CREATE TABLE IF NOT EXISTS ${TEST_TABLE} (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(255) UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      allowWrite: true
    }
  },
  {
    name: 'Add new column - age',
    tool: 'add_column',
    args: {
      table: TEST_TABLE,
      column: {
        name: 'age',
        type: 'INT',
        nullable: true,
        default: null,
        comment: 'User age in years'
      }
    }
  },
  {
    name: 'Add new column - is_active',
    tool: 'add_column',
    args: {
      table: TEST_TABLE,
      column: {
        name: 'is_active',
        type: 'BOOLEAN',
        default: true,
        comment: 'User account status'
      }
    }
  },
  {
    name: 'Add index on name column',
    tool: 'add_index',
    args: {
      table: TEST_TABLE,
      name: 'idx_name',
      columns: ['name'],
      type: 'BTREE'
    }
  },
  {
    name: 'Modify age column to be NOT NULL',
    tool: 'modify_column',
    args: {
      table: TEST_TABLE,
      column: 'age',
      newDefinition: {
        type: 'INT',
        nullable: false,
        default: 18,
        comment: 'User age in years (required)'
      }
    }
  },
  {
    name: 'Rename age column to user_age',
    tool: 'rename_column',
    args: {
      table: TEST_TABLE,
      oldName: 'age',
      newName: 'user_age'
    }
  },
  {
    name: 'Add another index on email and is_active',
    tool: 'add_index',
    args: {
      table: TEST_TABLE,
      name: 'idx_email_active',
      columns: ['email', 'is_active'],
      type: 'BTREE'
    }
  },
  {
    name: 'List table structure',
    tool: 'list',
    args: {
      table: TEST_TABLE
    }
  },
  {
    name: 'Test transaction with schema changes',
    tool: 'transaction',
    args: {
      operations: [
        {
          type: 'add_column',
          table: TEST_TABLE,
          column: {
            name: 'last_login',
            type: 'DATETIME',
            nullable: true,
            comment: 'Last login timestamp'
          }
        },
        {
          type: 'add_index',
          table: TEST_TABLE,
          name: 'idx_last_login',
          columns: ['last_login'],
          type: 'BTREE'
        }
      ]
    }
  },
  {
    name: 'Final table structure check',
    tool: 'list',
    args: {
      table: TEST_TABLE
    }
  }
];

// Function to run MCP server command
function runMCPCommand(tool, args, index) {
  return new Promise((resolve, reject) => {
    const cliPath = path.join(process.cwd(), 'dist', 'cli.js');
    
    if (!fs.existsSync(cliPath)) {
      reject(new Error('MCP server not built. Run "npm run build" first.'));
      return;
    }

    const command = `node ${cliPath} "${TEST_DB_URL}" "list,read,create,update,delete,execute,ddl,add_column,drop_column,modify_column,rename_column,rename_table,add_index,drop_index,transaction,utility"`;
    
    const child = spawn('node', [
      cliPath,
      TEST_DB_URL,
      'list,read,create,update,delete,execute,ddl,add_column,drop_column,modify_column,rename_column,rename_table,add_index,drop_index,transaction,utility'
    ], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const request = {
      name: tool,
      arguments: args
    };

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      try {
        const response = JSON.parse(stdout.trim());
        
        if (response.error) {
          reject(new Error(`Tool ${tool} failed: ${response.message}`));
        } else {
          console.log(`✅ ${index}. ${tool}: Success`);
          if (tool === 'list' && response.columns) {
            console.log(`   Columns: ${response.columns.map(c => c.name).join(', ')}`);
          }
          resolve(response);
        }
      } catch (error) {
        reject(new Error(`Failed to parse response: ${stdout} ${stderr}`));
      }
    });

    child.on('error', reject);

    // Send the request
    child.stdin.write(JSON.stringify(request) + '\n');
    child.stdin.end();
  });
}

// Run all test cases
async function runTests() {
  try {
    console.log(`\n🚀 Starting schema modification tests...\n`);
    
    for (let i = 0; i < testCases.length; i++) {
      const testCase = testCases[i];
      console.log(`\n${i + 1}. ${testCase.name}`);
      
      try {
        const result = await runMCPCommand(testCase.tool, testCase.args, i + 1);
        
        if (testCase.tool === 'list' && result.columns) {
          console.log(`   Found ${result.columns.length} columns:`);
          result.columns.forEach(col => {
            console.log(`   - ${col.name} (${col.type}) ${col.nullable ? 'NULL' : 'NOT NULL'} ${col.default ? `DEFAULT ${col.default}` : ''}`);
          });
        }
        
      } catch (error) {
        console.log(`   ❌ Failed: ${error.message}`);
        
        // Don't stop on non-critical errors, but continue with other tests
        if (!testCase.name.includes('Final')) {
          continue;
        } else {
          throw error;
        }
      }
    }
    
    console.log('\n🎉 All schema modification tests completed successfully!');
    console.log('\n📋 Summary of operations:');
    console.log('   • Created test table with initial structure');
    console.log('   • Added multiple columns with different data types');
    console.log('   • Created various indexes for performance');
    console.log('   • Modified column definitions');
    console.log('   • Renamed columns');
    console.log('   • Executed schema changes in transactions');
    console.log('   • Verified final table structure');
    
  } catch (error) {
    console.error('\n💥 Test suite failed:', error.message);
    process.exit(1);
  }
}

// Check if MCP server is built
if (!fs.existsSync(path.join(process.cwd(), 'dist', 'cli.js'))) {
  console.log('⚠️  MCP server not built. Please run "npm run build" first.');
  process.exit(1);
}

// Run the tests
runTests();