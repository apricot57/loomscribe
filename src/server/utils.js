function generateUniqueId(db, table) {
    while (true) {
        const id = Date.now() * 1000 + Math.floor(Math.random() * 1000);
        const exists = (db[table] || []).some(item => item.id === id);
        if (!exists) return id;
    }
}

module.exports = {
    generateUniqueId
};
