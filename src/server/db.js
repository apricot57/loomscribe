const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const ROOT = path.resolve(__dirname, '../../');
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

let cachedDb = null;
let writeQueue = Promise.resolve();

function createDefaultDb() {
    return { conversations: [], messages: [], prompts: [], settings: {} };
}

function readDb() {
    try {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        if (!fs.existsSync(DB_FILE)) {
            fs.writeFileSync(DB_FILE, JSON.stringify(createDefaultDb(), null, 4));
        }
        const data = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(data);
        if (!parsed.conversations) parsed.conversations = [];
        if (!parsed.messages) parsed.messages = [];
        if (!parsed.prompts) parsed.prompts = [];
        if (!parsed.settings) parsed.settings = {};
        cachedDb = parsed;
        return parsed;
    } catch (e) {
        logger.error('db_read_error', { file: DB_FILE, message: e.message });
        return cachedDb || createDefaultDb();
    }
}

function writeDb(data) {
    const tempFile = path.join(
        DATA_DIR,
        `db.${Date.now()}_${process.pid}_${Math.random().toString(36).slice(2)}.tmp`
    );
    try {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        fs.writeFileSync(tempFile, JSON.stringify(data, null, 4), 'utf-8');
        fs.renameSync(tempFile, DB_FILE);
        cachedDb = JSON.parse(JSON.stringify(data)); // Refresh cache with clone
        return true;
    } catch (e) {
        try {
            if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
        } catch (_) {}
        logger.error('db_write_error', { file: DB_FILE, message: e.message });
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
                const db = readDb();
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
    readDb,
    writeDb,
    mutateDb
};
