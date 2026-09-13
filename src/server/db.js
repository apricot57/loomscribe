const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const ROOT = path.resolve(__dirname, '../../');
const DATA_DIR = path.join(ROOT, 'data');

function getDbFile() {
    if (process.env.DB_FILE) {
        return path.resolve(process.env.DB_FILE);
    }
    const isTest = process.env.NODE_ENV === 'test' ||
        Boolean(process.env.NODE_TEST_CONTEXT) ||
        (Array.isArray(process.execArgv) && process.execArgv.some(arg => arg.includes('--test'))) ||
        (Array.isArray(process.argv) && process.argv.some(arg => arg.includes('--test') || arg.endsWith('.test.js') || arg.includes('tests/')));

    return isTest ? path.join(DATA_DIR, 'db.test.json') : path.join(DATA_DIR, 'db.json');
}

let cachedDb = null;
let writeQueue = Promise.resolve();

function createDefaultDb() {
    return { conversations: [], messages: [], prompts: [], settings: {} };
}

function loadDb() {
    const dbFile = getDbFile();
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(dbFile)) {
        fs.writeFileSync(dbFile, JSON.stringify(createDefaultDb(), null, 4));
    }
    const data = fs.readFileSync(dbFile, 'utf-8');
    let parsed;
    try {
        parsed = JSON.parse(data);
    } catch (e) {
        throw new Error(`Database file is corrupted: ${dbFile}`);
    }
    if (!parsed.conversations) parsed.conversations = [];
    if (!parsed.messages) parsed.messages = [];
    if (!parsed.prompts) parsed.prompts = [];
    if (!parsed.settings) parsed.settings = {};
    return parsed;
}

/**
 * Best-effort quarantine of a corrupted database file: renames it to
 * db.corrupt.<timestamp>.json in the same directory so a later write can
 * never silently overwrite the unreadable (but possibly recoverable) data.
 */
function quarantineCorruptDb(dbFile) {
    const backupFile = path.join(path.dirname(dbFile), `db.corrupt.${Date.now()}.json`);
    try {
        fs.renameSync(dbFile, backupFile);
        logger.warn('db_corrupt_quarantined', { file: dbFile, backup: backupFile });
    } catch (e) {
        logger.error('db_corrupt_quarantine_failed', { file: dbFile, message: e.message });
    }
}

function readDb() {
    const dbFile = getDbFile();
    try {
        const parsed = loadDb();
        cachedDb = parsed;
        return parsed;
    } catch (e) {
        if (e.message && e.message.startsWith('Database file is corrupted')) {
            logger.error('db_read_corrupt', { file: dbFile, message: e.message });
        } else {
            logger.error('db_read_error', { file: dbFile, message: e.message });
        }
        // Fall back to last known good cache (or an empty shell for reads).
        // Never assign the fallback to cachedDb: it must not be persisted
        // over the real file. Mutations go through loadDb() and refuse to
        // write when the file cannot be parsed.
        return cachedDb || createDefaultDb();
    }
}

function writeDb(data) {
    const dbFile = getDbFile();
    const tempFile = path.join(
        DATA_DIR,
        `db.${Date.now()}_${process.pid}_${Math.random().toString(36).slice(2)}.tmp`
    );
    try {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        fs.writeFileSync(tempFile, JSON.stringify(data, null, 4), 'utf-8');
        fs.renameSync(tempFile, dbFile);
        cachedDb = structuredClone(data); // Refresh cache with clone
        return true;
    } catch (e) {
        try {
            if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
        } catch (_) {}
        logger.error('db_write_error', { file: dbFile, message: e.message });
        return false;
    }
}

/**
 * Executes a serialized mutation on the database file.
 * Prevents race conditions and lost updates by sequencing read -> mutate -> write operations
 * through an internal Promise FIFO queue.
 *
 * @param {Function} mutatorFn - Synchronous or asynchronous function taking current DB object (db)
 * @returns {Promise<any>} Resolves with the return value of mutatorFn or updated DB
 */
function mutateDb(mutatorFn) {
    return new Promise((resolve, reject) => {
        writeQueue = writeQueue.then(async () => {
            try {
                let db;
                try {
                    db = loadDb();
                } catch (e) {
                    // Never persist a degraded object over the real file.
                    // Quarantine the corrupt file and reject instead.
                    quarantineCorruptDb(getDbFile());
                    throw e;
                }
                cachedDb = db;
                const result = await mutatorFn(db);
                const success = writeDb(db);
                if (!success) {
                    throw new Error('Failed to persist database changes');
                }
                resolve(result !== undefined ? result : db);
            } catch (err) {
                reject(err);
            }
        }).catch((err) => {
            logger.error('db_mutate_queue_error', { message: err.message });
        });
    });
}

module.exports = {
    getDbFile,
    readDb,
    writeDb,
    mutateDb
};
