import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs/promises';
import * as path from 'path';
import { 
  validateIdField, 
  validateDataTypes, 
  checkDuplicateId,
  validateRecordForInsert,
  validateRecordForUpdate,
  validateCSVData
} from './validation';

/**
 * Data record interface - all records must have an id field
 * ID can be either string or number to support both UUID and integer IDs
 */
export interface DataRecord {
  id: string | number;
  [key: string]: any;
}

/**
 * Table metadata structure stored in JSON files
 */
export interface TableMetadata {
  tableName: string;
  records: DataRecord[];
}

/**
 * LowDB Service for managing data tables
 */
export class LowDBService {
  private dbPath: string;
  private dbCache: Map<string, Low<TableMetadata>> = new Map();
  private locks: Map<string, Promise<void>> = new Map();

  constructor(dbPath: string = 'assets/database') {
    this.dbPath = dbPath;
  }

  /**
   * Acquire a lock for a specific file to ensure atomic operations
   * This prevents concurrent write conflicts by serializing operations on the same file
   */
  private async acquireLock(fileName: string): Promise<() => void> {
    // Wait for any existing lock to be released
    while (this.locks.has(fileName)) {
      await this.locks.get(fileName);
    }

    // Create a new lock
    let releaseLock: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    this.locks.set(fileName, lockPromise);

    // Return the release function
    return () => {
      this.locks.delete(fileName);
      releaseLock!();
    };
  }

  /**
   * Execute an operation with file locking to ensure concurrent safety
   */
  private async withLock<T>(fileName: string, operation: () => Promise<T>): Promise<T> {
    const release = await this.acquireLock(fileName);
    try {
      return await operation();
    } finally {
      release();
    }
  }

  /**
   * Initialize the database directory
   */
  async initialize(): Promise<void> {
    try {
      await fs.access(this.dbPath);
    } catch {
      // Directory doesn't exist, create it
      await fs.mkdir(this.dbPath, { recursive: true });
    }
  }

  /**
   * Get database instance for a table
   */
  private async getDB(fileName: string): Promise<Low<TableMetadata>> {
    if (this.dbCache.has(fileName)) {
      const db = this.dbCache.get(fileName)!;
      await db.read();
      return db;
    }

    const filePath = path.join(this.dbPath, `${fileName}.json`);
    const adapter = new JSONFile<TableMetadata>(filePath);
    const defaultData: TableMetadata = {
      tableName: fileName,
      records: []
    };
    
    const db = new Low(adapter, defaultData);
    await db.read();
    
    this.dbCache.set(fileName, db);
    return db;
  }

  /**
   * Get all table names (file names without .json extension)
   */
  async getAllTables(): Promise<Array<{ fileName: string; tableName: string }>> {
    await this.initialize();
    
    const files = await fs.readdir(this.dbPath);
    const jsonFiles = files.filter(file => file.endsWith('.json'));
    
    const tables = await Promise.all(
      jsonFiles.map(async (file) => {
        const fileName = file.replace('.json', '');
        const db = await this.getDB(fileName);
        return {
          fileName,
          tableName: db.data.tableName
        };
      })
    );
    
    return tables;
  }

  /**
   * Get all records from a table
   */
  async getTable(fileName: string): Promise<DataRecord[]> {
    const db = await this.getDB(fileName);
    return db.data.records;
  }

  /**
   * Get a single record by id
   */
  async getRecord(fileName: string, id: string | number): Promise<DataRecord | undefined> {
    const db = await this.getDB(fileName);
    // Support both string and number comparison
    return db.data.records.find(record => record.id == id);
  }

  /**
   * Create a new table with a sample record
   */
  async createTable(fileName: string, tableName?: string): Promise<void> {
    return this.withLock(fileName, async () => {
      const db = await this.getDB(fileName);
      
      // Create a sample record to demonstrate the format
      const sampleRecord: DataRecord = {
        id: uuidv4(),
        name: '示例数据',
        description: '这是一条示例数据，用于演示数据格式',
        createdAt: new Date().toISOString()
      };
      
      db.data = {
        tableName: tableName || fileName,
        records: [sampleRecord]
      };
      await db.write();
    });
  }

  /**
   * Update table name
   */
  async updateTableName(fileName: string, newTableName: string): Promise<void> {
    return this.withLock(fileName, async () => {
      const db = await this.getDB(fileName);
      db.data.tableName = newTableName;
      await db.write();
    });
  }

  /**
   * Delete a table
   */
  async deleteTable(fileName: string): Promise<void> {
    return this.withLock(fileName, async () => {
      const filePath = path.join(this.dbPath, `${fileName}.json`);
      await fs.unlink(filePath);
      this.dbCache.delete(fileName);
    });
  }

  /**
   * Insert a new record
   */
  async insertData(fileName: string, data: Omit<DataRecord, 'id'>): Promise<DataRecord> {
    return this.withLock(fileName, async () => {
      const db = await this.getDB(fileName);
      
      // Validate data before insertion
      validateRecordForInsert(data);
      
      // Generate ID if not provided, or validate if provided
      let recordId: string;
      if ('id' in data && data.id) {
        // ID provided - validate and check for duplicates
        validateIdField(data.id);
        checkDuplicateId(data.id, db.data.records);
        recordId = data.id;
      } else {
        // No ID - generate new UUID
        recordId = uuidv4();
      }
      
      const newRecord: DataRecord = {
        ...data,
        id: recordId
      };
      
      db.data.records.push(newRecord);
      await db.write();
      
      return newRecord;
    });
  }

  /**
   * Update an existing record
   */
  async updateData(fileName: string, id: string | number, data: Partial<DataRecord>): Promise<DataRecord> {
    return this.withLock(fileName, async () => {
      const db = await this.getDB(fileName);
      
      // Validate the update data
      validateRecordForUpdate(data);
      
      // If trying to change ID, validate and check for duplicates
      if (data.id && data.id != id) {
        validateIdField(data.id);
        checkDuplicateId(data.id, db.data.records, id);
      }
      
      const index = db.data.records.findIndex(record => record.id == id);
      if (index === -1) {
        throw new Error(`Record with id ${id} not found`);
      }
      
      // Merge the update data with existing record
      db.data.records[index] = {
        ...db.data.records[index],
        ...data,
        id // Ensure id cannot be changed (keep original)
      };
      
      await db.write();
      
      return db.data.records[index];
    });
  }

  /**
   * Delete a record
   */
  async deleteData(fileName: string, id: string | number): Promise<void> {
    return this.withLock(fileName, async () => {
      const db = await this.getDB(fileName);
      
      const index = db.data.records.findIndex(record => record.id == id);
      if (index === -1) {
        throw new Error(`Record with id ${id} not found`);
      }
      
      db.data.records.splice(index, 1);
      await db.write();
    });
  }

  /**
   * Batch insert records
   */
  async batchInsert(fileName: string, dataList: Array<Omit<DataRecord, 'id'>>): Promise<DataRecord[]> {
    return this.withLock(fileName, async () => {
      const db = await this.getDB(fileName);
      
      // Validate all records first
      dataList.forEach((data, index) => {
        try {
          validateRecordForInsert(data);
        } catch (e: any) {
          throw new Error(`Validation failed for record ${index}: ${e.message}`);
        }
      });
      
      const newRecords: DataRecord[] = dataList.map((data, index) => {
        let recordId: string;
        
        if ('id' in data && data.id) {
          // ID provided - validate and check for duplicates
          validateIdField(data.id);
          // Check against existing records and previously processed records
          const allRecords = [...db.data.records, ...newRecords.slice(0, index)];
          checkDuplicateId(data.id, allRecords);
          recordId = data.id;
        } else {
          // No ID - generate new UUID
          recordId = uuidv4();
        }
        
        return {
          ...data,
          id: recordId
        };
      });
      
      db.data.records.push(...newRecords);
      await db.write();
      
      return newRecords;
    });
  }

  /**
   * Replace all table data (used for CSV import)
   */
  async replaceTableData(fileName: string, records: DataRecord[]): Promise<void> {
    return this.withLock(fileName, async () => {
      const db = await this.getDB(fileName);
      db.data.records = records;
      await db.write();
    });
  }

  /**
   * Import CSV data with upsert logic
   * - Records with id: update if exists, create if not
   * - Records without id: generate new UUID and create
   * - Replace mode: completely replace all table data with imported data
   */
  async importCSV(fileName: string, csvData: any[]): Promise<DataRecord[]> {
    return this.withLock(fileName, async () => {
      const db = await this.getDB(fileName);
      
      // Validate CSV data
      validateCSVData(csvData);
      
      // Track IDs to detect duplicates within the CSV
      const seenIds = new Set<string>();
      
      // Process each row from CSV
      const records: DataRecord[] = csvData.map((row, index) => {
        // Check if row has a valid ID (string or number)
        const hasValidId = row.id !== undefined && 
                          row.id !== null && 
                          row.id !== '' &&
                          (typeof row.id === 'string' || typeof row.id === 'number');
        
        if (hasValidId) {
          // Has ID - validate it
          validateIdField(row.id);
          
          // Convert ID to string for comparison to avoid type issues
          const idStr = String(row.id);
          
          // Check for duplicate within CSV
          if (seenIds.has(idStr)) {
            throw new Error(`Duplicate id '${row.id}' found in CSV at row ${index + 1}`);
          }
          seenIds.add(idStr);
          
          return {
            ...row,
            id: row.id // Keep original type (string or number)
          };
        } else {
          // No ID or empty ID - generate new UUID
          const { id, ...rest } = row; // Remove empty id field if exists
          const newId = uuidv4();
          seenIds.add(newId);
          
          return {
            id: newId,
            ...rest
          };
        }
      });
      
      // Replace entire table with imported data (覆盖模式)
      db.data.records = records;
      await db.write();
      
      return records;
    });
  }

  /**
   * Check if a table exists
   */
  async tableExists(fileName: string): Promise<boolean> {
    const filePath = path.join(this.dbPath, `${fileName}.json`);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

// Export a singleton instance
export const lowdbService = new LowDBService();
