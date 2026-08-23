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
            if (children[i].versionGroupId && children[i].versionGroupId === bestChild.versionGroupId) {
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
        
        // Deactivate all other siblings and their descendants
        for (const child of children) {
            if (child.id !== bestChild.id) {
                child.isActive = false;
                deactivateMessageTree(db, child.id);
            }
        }
        
        currentId = bestChild.id;
    }
}

function deleteVersionGroupAndDescendants(db, versionGroupId) {
    const versions = (db.messages || []).filter(m => m.versionGroupId === versionGroupId || m.id === versionGroupId);
    const idsToDelete = new Set(versions.map(v => v.id));

    const queue = Array.from(idsToDelete);
    while (queue.length > 0) {
        const currentId = queue.shift();
        const descendants = (db.messages || []).filter(m => m.parentMsgId != null && String(m.parentMsgId) === String(currentId));
        for (const child of descendants) {
            if (!idsToDelete.has(child.id)) {
                idsToDelete.add(child.id);
                queue.push(child.id);
            }
        }
    }

    db.messages = (db.messages || []).filter(m => !idsToDelete.has(m.id));
    return Array.from(idsToDelete);
}

function deleteMessageAndDescendants(db, msgId) {
    const targetMsg = (db.messages || []).find(m => m.id === msgId);
    if (!targetMsg) return [];

    const idsToDelete = new Set([targetMsg.id]);
    const queue = [targetMsg.id];
    while (queue.length > 0) {
        const currentId = queue.shift();
        const descendants = (db.messages || []).filter(m => m.parentMsgId != null && String(m.parentMsgId) === String(currentId));
        for (const child of descendants) {
            if (!idsToDelete.has(child.id)) {
                idsToDelete.add(child.id);
                queue.push(child.id);
            }
        }
    }
    let parentUser = null;
    if (targetMsg.role === 'assistant' && targetMsg.parentMsgId != null) {
        parentUser = (db.messages || []).find(m => m.id === targetMsg.parentMsgId && m.role === 'user');
        if (parentUser) {
            const userVGId = parentUser.versionGroupId || parentUser.id;
            const otherUserVersions = (db.messages || []).filter(m => m.role === 'user' && m.id !== parentUser.id && (m.versionGroupId === userVGId || m.id === userVGId) && !idsToDelete.has(m.id));
            if (otherUserVersions.length > 0) {
                const otherAssistants = (db.messages || []).filter(m => m.role === 'assistant' && String(m.parentMsgId) === String(parentUser.id) && !idsToDelete.has(m.id));
                if (otherAssistants.length === 0) {
                    idsToDelete.add(parentUser.id);
                }
            }
        }
    }
    const wasActive = targetMsg.isActive;
    db.messages = (db.messages || []).filter(m => !idsToDelete.has(m.id));

    if (wasActive) {
        let siblingVersions = [];
        if (targetMsg.role === 'assistant') {
            siblingVersions = (db.messages || []).filter(m => m.role === 'assistant' && (
                (targetMsg.parentMsgId != null && m.parentMsgId === targetMsg.parentMsgId) ||
                (targetMsg.versionGroupId && m.versionGroupId === targetMsg.versionGroupId)
            ));
        } else if (targetMsg.role === 'user') {
            const vgId = targetMsg.versionGroupId || targetMsg.id;
            siblingVersions = (db.messages || []).filter(m => m.role === 'user' && (
                (m.versionGroupId && m.versionGroupId === vgId) ||
                m.id === vgId
            ));
        }

        if (siblingVersions.length > 0) {
            siblingVersions.sort((a, b) => (b.version || 1) - (a.version || 1) || (b.timestamp || 0) - (a.timestamp || 0));
            const bestSibling = siblingVersions[0];
            bestSibling.isActive = true;
            showDescendants(db, bestSibling.id);
        } else if (parentUser) {
            const userVGId = parentUser.versionGroupId || parentUser.id;
            const siblingUsers = (db.messages || []).filter(m => m.role === 'user' && (
                (m.versionGroupId && m.versionGroupId === userVGId) ||
                m.id === userVGId
            )).sort((a, b) => (b.version || 1) - (a.version || 1) || (b.timestamp || 0) - (a.timestamp || 0));

            if (siblingUsers.length > 0) {
                const bestUser = siblingUsers[0];
                bestUser.isActive = true;
                showDescendants(db, bestUser.id);
            }
        }
    }
    return Array.from(idsToDelete);
}

module.exports = {
    deactivateMessageTree,
    deactivateVersionGroupAndDescendants,
    showDescendants,
    deleteVersionGroupAndDescendants,
    deleteMessageAndDescendants
};
