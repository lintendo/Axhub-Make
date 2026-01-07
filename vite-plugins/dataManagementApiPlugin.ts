import type { Plugin } from 'vite';
import { lowdbService } from './lowdbService';
import { 
  ValidationError,
  validateRequired,
  validateFileName,
  validateRecordForInsert,
  validateRecordForUpdate
} from './validation';
import Papa from 'papaparse';

/**
 * Error response interface
 */
interface ErrorResponse {
  error: string;
  code: string;
  details?: any;
  timestamp: string;
}

/**
 * Custom error class for API errors
 */
class APIError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'APIError';
  }
}

/**
 * Data Management API Plugin
 * Provides RESTful API endpoints for managing data tables
 */
export function dataManagementApiPlugin(): Plugin {
  return {
    name: 'data-management-api',
    
    async configureServer(server) {
      // Initialize the database
      await lowdbService.initialize();
      
      // Helper function to parse JSON body
      const parseBody = (req: any): Promise<any> => {
        return new Promise((resolve, reject) => {
          let body = '';
          req.on('data', (chunk: any) => body += chunk);
          req.on('end', () => {
            try {
              resolve(body ? JSON.parse(body) : {});
            } catch (e) {
              reject(new APIError(400, 'INVALID_JSON', 'Invalid JSON in request body'));
            }
          });
          req.on('error', reject);
        });
      };

      // Helper function to send JSON response
      const sendJSON = (res: any, statusCode: number, data: any) => {
        res.statusCode = statusCode;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(data));
      };

      // Helper function to send error response
      const sendError = (res: any, statusCode: number, message: string, code?: string, details?: any) => {
        const errorResponse: ErrorResponse = {
          error: message,
          code: code || 'ERROR',
          timestamp: new Date().toISOString()
        };
        
        if (details) {
          errorResponse.details = details;
        }
        
        sendJSON(res, statusCode, errorResponse);
      };

      // Error logging function
      const logError = (error: Error | APIError, context: string) => {
        const timestamp = new Date().toISOString();
        
        if (error instanceof APIError) {
          console.error(`[${timestamp}] [Data Management API] ${context}:`, {
            statusCode: error.statusCode,
            code: error.code,
            message: error.message,
            details: error.details
          });
        } else {
          console.error(`[${timestamp}] [Data Management API] ${context}:`, {
            name: error.name,
            message: error.message,
            stack: error.stack
          });
        }
      };

      // Validation helper functions
      const validateRequiredField = (value: any, fieldName: string) => {
        try {
          validateRequired(value, fieldName);
        } catch (e: any) {
          throw new APIError(400, 'VALIDATION_ERROR', e.message);
        }
      };

      const validateFileNameParam = (fileName: string) => {
        try {
          validateFileName(fileName);
        } catch (e: any) {
          throw new APIError(400, 'VALIDATION_ERROR', e.message);
        }
      };

      const validateRecordDataForInsert = (data: any) => {
        try {
          validateRecordForInsert(data);
        } catch (e: any) {
          if (e instanceof ValidationError) {
            throw new APIError(400, 'VALIDATION_ERROR', e.message, e.details);
          }
          throw new APIError(400, 'VALIDATION_ERROR', e.message);
        }
      };

      const validateRecordDataForUpdate = (data: any) => {
        try {
          validateRecordForUpdate(data);
        } catch (e: any) {
          if (e instanceof ValidationError) {
            throw new APIError(400, 'VALIDATION_ERROR', e.message, e.details);
          }
          throw new APIError(400, 'VALIDATION_ERROR', e.message);
        }
      };

      // Main middleware for data management API
      server.middlewares.use(async (req: any, res: any, next: any) => {
        // Only handle /api/data/* routes
        if (!req.url.startsWith('/api/data')) {
          return next();
        }

        try {
          // Parse URL
          const url = new URL(req.url, `http://${req.headers.host}`);
          const pathname = url.pathname;

          // Route: GET /api/data/tables - Get all tables
          if (pathname === '/api/data/tables' && req.method === 'GET') {
            const tables = await lowdbService.getAllTables();
            sendJSON(res, 200, tables);
            return;
          }

          // Route: POST /api/data/tables - Create new table
          if (pathname === '/api/data/tables' && req.method === 'POST') {
            const body = await parseBody(req);
            const { tableName } = body;

            validateRequiredField(tableName, 'tableName');

            // Generate fileName from tableName if not provided
            // Use tableName directly as fileName (supports Chinese)
            const fileName = tableName.trim();
            validateFileNameParam(fileName);

            // Check if table already exists
            const exists = await lowdbService.tableExists(fileName);
            if (exists) {
              throw new APIError(400, 'TABLE_EXISTS', `Table '${tableName}' already exists`);
            }

            await lowdbService.createTable(fileName, tableName);
            sendJSON(res, 201, { success: true, fileName, tableName });
            return;
          }

          // Route: PUT /api/data/tables/:fileName - Update table info (e.g., tableName)
          const updateTableMatch = pathname.match(/^\/api\/data\/tables\/([^/]+)$/);
          if (updateTableMatch && req.method === 'PUT') {
            const fileName = decodeURIComponent(updateTableMatch[1]);
            validateFileNameParam(fileName);

            const exists = await lowdbService.tableExists(fileName);
            if (!exists) {
              throw new APIError(404, 'NOT_FOUND', `Table '${fileName}' not found`);
            }

            const body = await parseBody(req);
            const { tableName } = body;

            if (tableName !== undefined) {
              await lowdbService.updateTableName(fileName, tableName);
            }

            sendJSON(res, 200, { success: true, fileName, tableName });
            return;
          }

          // Route: DELETE /api/data/tables/:fileName - Delete table
          const deleteTableMatch = pathname.match(/^\/api\/data\/tables\/([^/]+)$/);
          if (deleteTableMatch && req.method === 'DELETE') {
            const fileName = decodeURIComponent(deleteTableMatch[1]);
            validateFileNameParam(fileName);

            const exists = await lowdbService.tableExists(fileName);
            if (!exists) {
              throw new APIError(404, 'NOT_FOUND', `Table '${fileName}' not found`);
            }

            await lowdbService.deleteTable(fileName);
            sendJSON(res, 200, { success: true });
            return;
          }

          // Route: GET /api/data/:fileName/export - CSV Export (must be before :id route)
          const exportMatch = pathname.match(/^\/api\/data\/([^/]+)\/export$/);
          if (exportMatch && req.method === 'GET') {
            const fileName = decodeURIComponent(exportMatch[1]);
            validateFileNameParam(fileName);

            const exists = await lowdbService.tableExists(fileName);
            if (!exists) {
              throw new APIError(404, 'NOT_FOUND', `Table '${fileName}' not found`);
            }

            // Get all records
            const records = await lowdbService.getTable(fileName);

            // Convert to CSV
            const csv = Papa.unparse(records, {
              quotes: true,
              header: true
            });

            // Send CSV response
            res.statusCode = 200;
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${fileName}.csv"`);
            res.end(csv);
            return;
          }

          // Route: GET /api/data/:fileName - Get all data from table
          const getTableMatch = pathname.match(/^\/api\/data\/([^/]+)$/);
          if (getTableMatch && req.method === 'GET') {
            const fileName = decodeURIComponent(getTableMatch[1]);
            validateFileNameParam(fileName);

            const exists = await lowdbService.tableExists(fileName);
            if (!exists) {
              throw new APIError(404, 'NOT_FOUND', `Table '${fileName}' not found`);
            }

            const records = await lowdbService.getTable(fileName);
            sendJSON(res, 200, records);
            return;
          }

          // Route: GET /api/data/:fileName/:id - Get single record
          const getRecordMatch = pathname.match(/^\/api\/data\/([^/]+)\/([^/]+)$/);
          if (getRecordMatch && req.method === 'GET') {
            const fileName = decodeURIComponent(getRecordMatch[1]);
            const id = decodeURIComponent(getRecordMatch[2]);
            validateFileNameParam(fileName);

            const exists = await lowdbService.tableExists(fileName);
            if (!exists) {
              throw new APIError(404, 'NOT_FOUND', `Table '${fileName}' not found`);
            }

            const record = await lowdbService.getRecord(fileName, id);
            if (!record) {
              throw new APIError(404, 'NOT_FOUND', `Record with id '${id}' not found`);
            }

            sendJSON(res, 200, record);
            return;
          }

          // Route: POST /api/data/:fileName - Insert new record
          const insertMatch = pathname.match(/^\/api\/data\/([^/]+)$/);
          if (insertMatch && req.method === 'POST') {
            const fileName = decodeURIComponent(insertMatch[1]);
            validateFileNameParam(fileName);

            const exists = await lowdbService.tableExists(fileName);
            if (!exists) {
              throw new APIError(404, 'NOT_FOUND', `Table '${fileName}' not found`);
            }

            const body = await parseBody(req);
            validateRecordDataForInsert(body);
            
            const newRecord = await lowdbService.insertData(fileName, body);
            sendJSON(res, 201, newRecord);
            return;
          }

          // Route: PUT /api/data/:fileName/:id - Update record
          const updateMatch = pathname.match(/^\/api\/data\/([^/]+)\/([^/]+)$/);
          if (updateMatch && req.method === 'PUT') {
            const fileName = decodeURIComponent(updateMatch[1]);
            const id = decodeURIComponent(updateMatch[2]);
            validateFileNameParam(fileName);

            const exists = await lowdbService.tableExists(fileName);
            if (!exists) {
              throw new APIError(404, 'NOT_FOUND', `Table '${fileName}' not found`);
            }

            const body = await parseBody(req);
            validateRecordDataForUpdate(body);
            
            try {
              const updatedRecord = await lowdbService.updateData(fileName, id, body);
              sendJSON(res, 200, updatedRecord);
            } catch (e: any) {
              if (e.message.includes('not found')) {
                throw new APIError(404, 'NOT_FOUND', `Record with id '${id}' not found`);
              }
              throw e;
            }
            return;
          }

          // Route: DELETE /api/data/:fileName/:id - Delete record
          const deleteMatch = pathname.match(/^\/api\/data\/([^/]+)\/([^/]+)$/);
          if (deleteMatch && req.method === 'DELETE') {
            const fileName = decodeURIComponent(deleteMatch[1]);
            const id = decodeURIComponent(deleteMatch[2]);
            validateFileNameParam(fileName);

            const exists = await lowdbService.tableExists(fileName);
            if (!exists) {
              throw new APIError(404, 'NOT_FOUND', `Table '${fileName}' not found`);
            }

            try {
              await lowdbService.deleteData(fileName, id);
              sendJSON(res, 200, { success: true });
            } catch (e: any) {
              if (e.message.includes('not found')) {
                throw new APIError(404, 'NOT_FOUND', `Record with id '${id}' not found`);
              }
              throw e;
            }
            return;
          }

          // Route: POST /api/data/:fileName/import - CSV Import
          const importMatch = pathname.match(/^\/api\/data\/([^/]+)\/import$/);
          if (importMatch && req.method === 'POST') {
            const fileName = decodeURIComponent(importMatch[1]);
            validateFileNameParam(fileName);

            const exists = await lowdbService.tableExists(fileName);
            if (!exists) {
              throw new APIError(404, 'NOT_FOUND', `Table '${fileName}' not found`);
            }

            const body = await parseBody(req);
            const { csvData } = body;

            if (!csvData || typeof csvData !== 'string') {
              throw new APIError(400, 'VALIDATION_ERROR', 'Missing or invalid csvData parameter');
            }

            // Parse CSV
            const parseResult = Papa.parse(csvData, {
              header: true,
              dynamicTyping: true,
              skipEmptyLines: true,
              transformHeader: (header) => header.trim()
            });

            if (parseResult.errors.length > 0) {
              throw new APIError(
                400, 
                'CSV_PARSE_ERROR', 
                'Failed to parse CSV file',
                { errors: parseResult.errors }
              );
            }

            // Import data with upsert logic
            const importedRecords = await lowdbService.importCSV(fileName, parseResult.data);
            sendJSON(res, 200, { 
              success: true, 
              recordCount: importedRecords.length,
              records: importedRecords
            });
            return;
          }

          // No route matched
          throw new APIError(404, 'NOT_FOUND', 'API endpoint not found');
          
        } catch (e: any) {
          // Error handling middleware
          if (e instanceof APIError) {
            // Known API error
            logError(e, `${req.method} ${req.url}`);
            sendError(res, e.statusCode, e.message, e.code, e.details);
          } else if (e instanceof ValidationError) {
            // Validation error from lowdbService
            logError(e, `${req.method} ${req.url}`);
            sendError(res, 400, e.message, 'VALIDATION_ERROR', e.details);
          } else if (e.code === 'ENOENT') {
            // File not found error
            logError(e, `${req.method} ${req.url}`);
            sendError(res, 404, 'Resource not found', 'NOT_FOUND');
          } else if (e.code === 'EACCES') {
            // Permission error
            logError(e, `${req.method} ${req.url}`);
            sendError(res, 500, 'Permission denied', 'PERMISSION_ERROR');
          } else {
            // Unknown error
            logError(e, `${req.method} ${req.url}`);
            sendError(res, 500, 'Internal server error', 'SERVER_ERROR', {
              message: e.message
            });
          }
        }
      });
    }
  };
}
