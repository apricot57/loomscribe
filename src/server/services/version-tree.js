function deactivateMessageTree(db, msgId) {
    const queue = [msgId];
    while (queue.length > 0) {
        const currentId = queue.shift();
        const descendants = (db.messages || []).filter(m => m.parentMsgId != null && String(m.parentMsgId) === String(currentId));
        for (const child of descendants) {
            child.isActive = false;
            queue.push(child.id);
        }
    }
}

function deactivateVersionGroupAndDescendants(db, versionGroupId) {
    const versions = (db.messages || []).filter(m => m.versionGroupId === versionGroupId || m.id === versionGroupId);
    for (const v of versions) {
        v.isActive = false;
        deactivateMessageTree(db, v.id);
    }
}

function showDescendants(db, msgId) {
    let currentId = msgId;
    while (true) {
        const children = (db.messages || []).filter(m => m.parentMsgId != null && String(m.parentMsgId) === String(currentId));
        if (children.length === 0) break;
        
        let bestChild = children[0];
        for (let i = 1; i < children.length; i++) {
            if (children[i].versionGroupId === bestChild.versionGroupId) {
                if ((children[i].version || 1) > (bestChild.version || 1)) {
                    bestChild = children[i];
                }
            } else {
                if (children[i].id > bestChild.id) {
                    bestChild = children[i];
                }
            }
        }
        
        bestChild.isActive = true;
        currentId = bestChild.id;
    }
}

module.exports = {
    deactivateMessageTree,
    deactivateVersionGroupAndDescendants,
    showDescendants
};
