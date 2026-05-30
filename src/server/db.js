const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../');
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

let cachedDb = null;

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
        cachedDb = parsed;
        return parsed;
    } catch (e) {
        console.error("DB Read Error:", e);
        return cachedDb || createDefaultDb();
    }
}

function writeDb(data) {
    try {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        const tempFile = DB_FILE + '.tmp';
        fs.writeFileSync(tempFile, JSON.stringify(data, null, 4), 'utf-8');
        fs.renameSync(tempFile, DB_FILE);
        cachedDb = data; // Refresh the in-memory cache only after the file write succeeds.
        return true;
    } catch (e) {
        console.error("DB Write Error:", e);
        return false;
    }
}

module.exports = {
    readDb,
    writeDb
};
