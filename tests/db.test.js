const test = require('node:test');
const assert = require('node:assert');
const { readDb, writeDb, mutateDb } = require('../src/server/db');

test.describe('Database Concurrency & Serialized Mutations (src/server/db.js)', () => {

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
});
