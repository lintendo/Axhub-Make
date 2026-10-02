import { copyFile, mkdir, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
const IDENTITY_KEYS = [
    "glass.lastSignedInAuthId",
    "adminSettings.cachedAuthId",
];
async function loadSqlite() {
    const specifier = "node:sqlite";
    const emitWarning = process.emitWarning;
    process.emitWarning = ((warning, ...args) => {
        if (String(warning).includes("SQLite is an experimental feature"))
            return;
        Reflect.apply(emitWarning, process, [warning, ...args]);
    });
    try {
        return await import(specifier);
    }
    finally {
        process.emitWarning = emitWarning;
    }
}
async function copyLocalState(sourceRoot, destinationRoot) {
    const source = join(sourceRoot, "Local State");
    const destination = join(destinationRoot, "Local State");
    const temporary = `${destination}.${process.pid}.tmp`;
    try {
        await copyFile(source, temporary);
        await rename(temporary, destination);
    }
    catch (error) {
        await rm(temporary, { force: true });
        if (error.code !== "ENOENT")
            throw error;
    }
}
async function readCursorAccountState(databasePath) {
    const { DatabaseSync } = await loadSqlite();
    const database = new DatabaseSync(databasePath, { readOnly: true });
    try {
        const itemTable = database.prepare("SELECT name AS key, name AS value FROM sqlite_master WHERE type = 'table' AND name = 'ItemTable'").all();
        if (itemTable.length === 0)
            return [];
        return database.prepare("SELECT key, value FROM ItemTable WHERE key LIKE 'cursorAuth/%' OR key IN (?, ?)").all(...IDENTITY_KEYS);
    }
    finally {
        database.close();
    }
}
async function writeCursorAccountState(databasePath, records) {
    const { DatabaseSync } = await loadSqlite();
    const temporary = `${databasePath}.${process.pid}.tmp`;
    await mkdir(dirname(databasePath), { recursive: true });
    const database = new DatabaseSync(temporary);
    try {
        database.exec("CREATE TABLE ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB)");
        database.exec("BEGIN");
        const insert = database.prepare("INSERT INTO ItemTable (key, value) VALUES (?, ?)");
        for (const record of records)
            insert.run(record.key, record.value);
        database.exec("COMMIT");
    }
    catch (error) {
        try {
            database.exec("ROLLBACK");
        }
        catch {
            // The transaction may not have started.
        }
        throw error;
    }
    finally {
        database.close();
    }
    try {
        await rename(temporary, databasePath);
    }
    catch (error) {
        await rm(temporary, { force: true });
        throw error;
    }
}
export async function prepareCursorUserDataDir(userDataDir, platform, environment = process.env) {
    if (platform !== "win32" || !environment.APPDATA)
        return false;
    const sourceRoot = join(environment.APPDATA, "Cursor");
    const relativeDatabasePath = join("User", "globalStorage", "state.vscdb");
    const sourceDatabasePath = join(sourceRoot, relativeDatabasePath);
    let records;
    try {
        records = await readCursorAccountState(sourceDatabasePath);
    }
    catch (error) {
        if (error.code === "ENOENT")
            return false;
        throw error;
    }
    const keys = new Set(records.map((record) => record.key));
    if (!keys.has("cursorAuth/accessToken") || !keys.has("cursorAuth/refreshToken"))
        return false;
    await writeCursorAccountState(join(userDataDir, relativeDatabasePath), records);
    await copyLocalState(sourceRoot, userDataDir);
    return true;
}
//# sourceMappingURL=profile.js.map