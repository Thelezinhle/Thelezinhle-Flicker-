import { Sequelize, DataTypes, Model } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

const sequelize = new Sequelize(
  process.env.DB_NAME!,
  process.env.DB_USER!,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    dialect: 'postgres',
    logging: false,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  }
);

// User Model
export class User extends Model {
  public id!: string;
  public email!: string;
  public password!: string;
  public name!: string;
  public role!: 'client' | 'driver';
  public publicKey!: string;
  public deviceId!: string;
  public isVerified!: boolean;
}

User.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  email: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: false,
    validate: {
      isEmail: true
    }
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  role: {
    type: DataTypes.ENUM('client', 'driver'),
    allowNull: false,
    defaultValue: 'client'
  },
  publicKey: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  deviceId: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: true
  },
  isVerified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  sequelize,
  tableName: 'users',
  timestamps: true
});

// Session Model
export class Session extends Model {
  public id!: string;
  public userId!: string;
  public sessionToken!: string;
  public expiresAt!: Date;
  public status!: 'active' | 'expired' | 'revoked';
}

Session.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  userId: {
    type: DataTypes.UUID,
    references: {
      model: User,
      key: 'id'
    }
  },
  sessionToken: {
    type: DataTypes.STRING(512),
    unique: true
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('active', 'expired', 'revoked'),
    defaultValue: 'active'
  }
}, {
  sequelize,
  tableName: 'sessions',
  timestamps: true
});

// Proximity Handshake Model
export class ProximityHandshake extends Model {
  public id!: string;
  public initiatorId!: string;
  public receiverId!: string;
  public handshakeCode!: string;
  public encryptedPayload!: string;
  public latitude!: number;
  public longitude!: number;
  public status!: 'pending' | 'active' | 'completed' | 'failed';
  public phase!: 'gps' | 'bluetooth' | 'uwb' | 'nfc' | 'complete';
}

ProximityHandshake.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  initiatorId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  receiverId: {
    type: DataTypes.UUID,
    allowNull: true
  },
  handshakeCode: {
    type: DataTypes.STRING(6),
    unique: true,
    allowNull: false
  },
  encryptedPayload: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  latitude: {
    type: DataTypes.DECIMAL(10, 8),
    allowNull: false
  },
  longitude: {
    type: DataTypes.DECIMAL(11, 8),
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('pending', 'active', 'completed', 'failed'),
    defaultValue: 'pending'
  },
  phase: {
    type: DataTypes.ENUM('gps', 'bluetooth', 'uwb', 'nfc', 'complete'),
    defaultValue: 'gps'
  }
}, {
  sequelize,
  tableName: 'proximity_handshakes',
  timestamps: true,
  indexes: [
    {
      fields: ['handshakeCode']
    },
    {
      fields: ['status']
    }
  ]
});

// Venue Model (matching Go struct)
export class Venue extends Model {
  public id!: string;
  public name!: string;
  public category!: string;
  public latitude!: number;
  public longitude!: number;
  public radius!: number;
  public address!: string;
  public phone!: string;
}

Venue.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  category: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  latitude: {
    type: DataTypes.DECIMAL(10, 8),
    allowNull: false
  },
  longitude: {
    type: DataTypes.DECIMAL(11, 8),
    allowNull: false
  },
  radius: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 50.0
  },
  address: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  phone: {
    type: DataTypes.STRING(20),
    allowNull: true
  }
}, {
  sequelize,
  tableName: 'venues',
  timestamps: true,
  indexes: [
    {
      fields: ['category']
    },
    {
      fields: ['latitude', 'longitude']
    }
  ]
});

// Delivery Model (matching Go struct)
export class Delivery extends Model {
  public id!: string;
  public orderId!: string;
  public driverId!: string;
  public recipientId!: string;
  public venueId!: string;
  public content!: string;
  public status!: 'pending' | 'assigned' | 'picked_up' | 'in_transit' | 'nearby' | 'arrived' | 'delivered' | 'cancelled';
  public wrongPerson!: boolean;
  public latitude!: number | null;
  public longitude!: number | null;
  public qrCode!: string | null;
  public qrExpiresAt!: Date | null;
}

Delivery.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  orderId: {
    type: DataTypes.STRING(50),
    unique: true,
    allowNull: false,
    defaultValue: () => `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`
  },
  driverId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  recipientId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  venueId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: Venue,
      key: 'id'
    }
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('pending', 'assigned', 'picked_up', 'in_transit', 'nearby', 'arrived', 'delivered', 'cancelled'),
    defaultValue: 'pending'
  },
  wrongPerson: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  latitude: {
    type: DataTypes.DECIMAL(10, 8),
    allowNull: true
  },
  longitude: {
    type: DataTypes.DECIMAL(11, 8),
    allowNull: true
  },
  qrCode: {
    type: DataTypes.STRING(255),
    allowNull: true,
    unique: true
  },
  qrExpiresAt: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  sequelize,
  tableName: 'deliveries',
  timestamps: true,
  indexes: [
    {
      fields: ['orderId']
    },
    {
      fields: ['driverId']
    },
    {
      fields: ['recipientId']
    },
    {
      fields: ['status']
    },
    {
      fields: ['qrCode']
    }
  ]
});

// ProximityTracking Model (matching Go ProximityTracking struct)
export class ProximityTracking extends Model {
  public id!: string;
  public userId!: string;
  public targetUserId!: string;
  public targetLatitude!: number;
  public targetLongitude!: number;
  public currentDistance!: number;
  public phase!: 'gps' | 'discovery' | 'close_range' | 'nfc_ready' | 'verified';
  public technology!: 'gps' | 'uwb' | 'pdr' | 'nfc';
  public status!: 'active' | 'paused' | 'completed';
  public lastUpdate!: Date;
  public completedAt!: Date | null;
}

ProximityTracking.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  targetUserId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  targetLatitude: {
    type: DataTypes.DECIMAL(10, 8),
    allowNull: false
  },
  targetLongitude: {
    type: DataTypes.DECIMAL(11, 8),
    allowNull: false
  },
  currentDistance: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0
  },
  phase: {
    type: DataTypes.ENUM('gps', 'discovery', 'close_range', 'nfc_ready', 'verified'),
    defaultValue: 'gps'
  },
  technology: {
    type: DataTypes.ENUM('gps', 'uwb', 'pdr', 'nfc'),
    defaultValue: 'gps'
  },
  status: {
    type: DataTypes.ENUM('active', 'paused', 'completed'),
    defaultValue: 'active'
  },
  lastUpdate: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  completedAt: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  sequelize,
  tableName: 'proximity_trackings',
  timestamps: true,
  indexes: [
    {
      fields: ['userId']
    },
    {
      fields: ['targetUserId']
    },
    {
      fields: ['status']
    }
  ]
});

// Associations
Delivery.belongsTo(Venue, { foreignKey: 'venueId', as: 'venue' });
Venue.hasMany(Delivery, { foreignKey: 'venueId', as: 'deliveries' });

export default sequelize;
