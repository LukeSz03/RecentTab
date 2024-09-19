const MRULists = new Map();
const MRUTimers = new Map();  

var handleCommand = function(command) {
    if (command === "quick_switch") {
        chrome.windows.getCurrent({ populate: true }, (window) => {
            const windowId = window.id;
            const orderedSet = MRULists.get(windowId);
            if (!orderedSet) return;

            orderedSet.previous();  
            const currentTabId = orderedSet.currentNode ? orderedSet.currentNode.key : null;
            if (currentTabId !== null) {
                chrome.tabs.update(currentTabId, { active: true, highlighted: true });
            }
        });
    } 
};

chrome.action.onClicked.addListener(function(tab) {
    handleCommand ('quick_switch');
});

chrome.commands.onCommand.addListener(handleCommand);

class Node {
    constructor(key) {
        this.key = key;
        this.prev = null;
        this.next = null;
    }
}

class OrderedSet {
    constructor() {
        this.head = null;
        this.tail = null;
        this.map = new Map();  
        this.currentNode = null;  
    }

    add(key) {
        if (this.map.has(key)) {
            this._removeNode(this.map.get(key));  
        }
        const newNode = new Node(key);
        this._appendNode(newNode);
        this.map.set(key, newNode);  
        this.currentNode = this.tail;
    }

    delete(key) {
        if (this.map.has(key)) {
            const node = this.map.get(key);
            if (this.currentNode === node) {
                this.currentNode = node.prev;  
            }
            this._removeNode(node);
            this.map.delete(key);
        }
    }

    previous() {
        if (this.currentNode === null) {
            return null; 
        }

        const result = this.currentNode.key;
        this.currentNode = this.currentNode.prev;
        return result;
    }

    _appendNode(node) {
        if (this.tail === null) {
            this.head = node;
            this.tail = node;
        } else {
            node.prev = this.tail;
            this.tail.next = node;
            this.tail = node;
        }
    }

    _removeNode(node) {
        if (node.prev !== null) {
            node.prev.next = node.next;
        } else {
            this.head = node.next;
        }

        if (node.next !== null) {
            node.next.prev = node.prev;
        } else {
            this.tail = node.prev;
        }
    }
}

const initializeWindowTabs = (windowId) => {
    chrome.tabs.query({ windowId: windowId }, (tabs) => {
        const orderedSet = new OrderedSet();
        tabs.forEach(tab => orderedSet.add(tab.id));
        
        chrome.tabs.query({ windowId: windowId, active: true, currentWindow: true }, (activeTabs) => {
            if (activeTabs.length > 0) {
                const activeTab = activeTabs[0];
                orderedSet.add(activeTab.id);
            }
            MRULists.set(windowId, orderedSet);
        });
    });
};

const handleTabUpdate = (tabId, windowId, changeInfo) => {
    const orderedSet = MRULists.get(windowId);
    if (orderedSet) {
        if (changeInfo.status === 'complete') {
            orderedSet.add(tabId);  
        }
    }
};

const handleTabRemoval = (tabId, removeInfo) => {
    const orderedSet = MRULists.get(removeInfo.windowId);
    if (orderedSet) {
        orderedSet.delete(tabId);
    }
};

chrome.runtime.onInstalled.addListener(function () {
    chrome.windows.getAll({ populate: true }, (windows) => {
        windows.forEach(window => initializeWindowTabs(window.id));
    });    
});

chrome.windows.onCreated.addListener((window) => {
    initializeWindowTabs(window.id)
});

chrome.windows.onRemoved.addListener((window) => {
    MRULists.delete(window.id);
    if (MRUTimers.has(window.id)) {
        clearTimeout(MRUTimers.get(window.id));
        MRUTimers.delete(window.id);
    }
});

chrome.tabs.onUpdated.addListener(handleTabUpdate);
chrome.tabs.onRemoved.addListener(handleTabRemoval);

chrome.windows.getAll({ populate: true }, (windows) => {
    windows.forEach(window => initializeWindowTabs(window.id));
});

chrome.tabs.onActivated.addListener(function(tab) {
    const windowId = tab.windowId;
    const orderedSet = MRULists.get(windowId);

    if (orderedSet) {
        if (MRUTimers.has(windowId)) {
            clearTimeout(MRUTimers.get(windowId));
        }

        const timerId = setTimeout(() => {
            orderedSet.add(tab.tabId);
        }, 200);  

        MRUTimers.set(windowId, timerId);
    }
});

/*
 Mechanism to keep service worker alive
*/
 const keepAliveInterval = setInterval(() => {
    chrome.runtime.sendMessage({ type: 'KEEPALIVE_REQUEST' });
}, 15000);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'KEEPALIVE_REQUEST') {
        sendResponse({ status: 'alive' });
    }
});
