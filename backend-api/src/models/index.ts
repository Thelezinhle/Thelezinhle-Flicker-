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
  publicKey: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  deviceId: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: false
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

export default sequelize;
