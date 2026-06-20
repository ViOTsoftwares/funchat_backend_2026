const state = {
  chatQueue: [],
  videoQueue: [],
  socketMode: new Map(),
  pairedWith: new Map(),
  conversationIdBySocket: new Map(),
  conversationSockets: new Map(),
  pendingConversationClear: new Map(),
  pendingDisconnectCleanups: new Map(),
  reports: [],
  banned: new Set()
};

export default state;
