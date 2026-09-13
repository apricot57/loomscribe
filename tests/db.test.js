const test = require('node:test');
const assert = require('node:assert');
const { getDbFile, readDb, writeDb, mutateDb } = require('../src/server/db');

test.describe('Database Concurrency & Serialized Mutations (src/server/db.js)', () => {

    test('getDbFile returns isolated db.test.json during testing to protect db.json', () => {
        const file = getDbFile();
        assert.ok(file.endsWith('db.test.json'), `Expected test database path, got ${file}`);
    });

    test('readDb returns valid object with required tables', () => {
        const db = readDb();
        assert.ok(db && typeof db === 'object');
        assert.ok(Array.isArray(db.conversations));
        assert.ok(Array.isArray(db.messages));
    });

    test('mutateDb handles multiple concurrent writes sequentially without lost updates', async () => {
        const testKey = `test_concurrent_${Date.now()}`;
        
        // Initialize an empty test array in DB
        await mutateDb((db) => {
            db[testKey] = [];
        });

        // Launch 25 concurrent mutation promises simultaneously
        const count = 25;
        const promises = [];
        for (let i = 0; i < count; i++) {
            promises.push(mutateDb((db) => {
                db[testKey].push(i);
            }));
        }

        await Promise.all(promises);

        const finalDb = readDb();
        assert.strictEqual(finalDb[testKey].length, count);

        // Cleanup
        await mutateDb((db) => {
            delete db[testKey];
        });
    });

    test('mutateDb gracefully handles errors in mutator function without stalling the queue', async () => {
        const errorPromise = mutateDb(() => {
            throw new Error('Simulated mutator error');
        });

        await assert.rejects(errorPromise, /Simulated mutator error/);

        // Subsequent mutateDb calls must still proceed smoothly
        const result = await mutateDb((db) => {
            return 'recovered';
        });

        assert.strictEqual(result, 'recovered');
    });

    test('writeDb persists data and updates cache', () => {
        const db = readDb();
        const originalVal = db._testWriteVal;
        db._testWriteVal = 42;
        const writeSuccess = writeDb(db);
        assert.strictEqual(writeSuccess, true);

        const readBack = readDb();
        assert.strictEqual(readBack._testWriteVal, 42);

        // Cleanup
        if (originalVal === undefined) {
            delete readBack._testWriteVal;
        } else {
            readBack._testWriteVal = originalVal;
        }
        writeDb(readBack);
    });

    test('mutateDb rejects and quarantines a corrupted database file without overwriting it', async () => {
        const fs = require('fs');
        const path = require('path');
        const dbPath = getDbFile();
        const dataDir = path.dirname(dbPath);
        const corruptContent = '{"conversations": [broken json';

        // Plain read path: falls back (cached or default) but must not throw
        const snapshot = readDb();
        assert.ok(snapshot && Array.isArray(snapshot.messages));

        fs.writeFileSync(dbPath, corruptContent, 'utf-8');

        await assert.rejects(
            mutateDb((db) => {
                db._corruptMarker = true;
            }),
            /Database file is corrupted/
        );

        // The corrupt file was quarantined with its original bytes intact
        const quarantineFiles = fs.readdirSync(dataDir).filter(f => f.startsWith('db.corrupt.') && f.endsWith('.json'));
        assert.ok(quarantineFiles.length > 0, 'expected a db.corrupt.<timestamp>.json quarantine file');
        const quarantinedBytes = fs.readFileSync(path.join(dataDir, quarantineFiles[quarantineFiles.length - 1]), 'utf-8');
        assert.strictEqual(quarantinedBytes, corruptContent);

        // No valid database was written over the corrupt file
        if (fs.existsSync(dbPath)) {
            assert.strictEqual(fs.readFileSync(dbPath, 'utf-8'), corruptContent);
        }

        // Cleanup: remove quarantine copies and restore a clean test database
        for (const f of quarantineFiles) {
            fs.unlinkSync(path.join(dataDir, f));
        }
        writeDb({ conversations: [], messages: [], prompts: [], settings: {} });
    });

});
