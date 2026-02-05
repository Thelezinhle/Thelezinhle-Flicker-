// Mock in-memory database for testing without PostgreSQL
const users = new Map();
const sessions = new Map();
const handshakes = new Map();

export const mockDB = {
  users,
  sessions,
  handshakes,
  
  generateId: () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  
  // User operations
  createUser: (data: any) => {
    const id = mockDB.generateId();
    const user = { id, ...data, createdAt: new Date(), updatedAt: new Date() };
    users.set(id, user);
    return user;
  },
  
  findUserByPk: (id: string) => users.get(id) || null,
  
  findUserByDeviceId: (deviceId: string) => {
    for (const user of users.values()) {
      if (user.deviceId === deviceId) return user;
    }
    return null;
  },
  
  updateUser: (id: string, data: any) => {
    const user = users.get(id);
    if (user) {
      Object.assign(user, data, { updatedAt: new Date() });
      return user;
    }
    return null;
  },
  
  // Session operations
  createSession: (data: any) => {
    const id = mockDB.generateId();
    const session = { id, ...data, createdAt: new Date() };
    sessions.set(id, session);
    return session;
  },
  
  findSessionByToken: (sessionToken: string) => {
    for (const session of sessions.values()) {
      if (session.sessionToken === sessionToken) return session;
    }
    return null;
  },
  
  findSessionByPk: (id: string) => sessions.get(id) || null,
  
  updateSession: (id: string, data: any) => {
    const session = sessions.get(id);
    if (session) {
      Object.assign(session, data);
      return session;
    }
    return null;
  },
  
  // Handshake operations
  createHandshake: (data: any) => {
    const id = mockDB.generateId();
    const handshake = { id, ...data, createdAt: new Date(), updatedAt: new Date() };
    handshakes.set(id, handshake);
    return handshake;
  },
  
  findHandshakeByPk: (id: string) => handshakes.get(id) || null,
  
  findHandshakeByCode: (handshakeCode: string) => {
    for (const handshake of handshakes.values()) {
      if (handshake.handshakeCode === handshakeCode) return handshake;
    }
    return null;
  },
  
  updateHandshake: (id: string, data: any) => {
    const handshake = handshakes.get(id);
    if (handshake) {
      Object.assign(handshake, data, { updatedAt: new Date() });
      return handshake;
    }
    return null;
  }
};
