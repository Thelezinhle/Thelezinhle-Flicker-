import { Sequelize, DataTypes, Model } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Sequelize connection
const sequelize = new Sequelize(
  process.env.DB_NAME || 'flickersecure_db',
  process.env.DB_USER || 'postgres',
  process.env.DB_PASSWORD || 'securepassword123',
  {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    dialect: 'postgres',
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  }
);

// ============================================
// 1. USER MODEL
// ============================================
export class User extends Model {
  public id!: string;
  public publicKey!: string;
  public deviceId!: string;
  public isVerified!: boolean;
  public name!: string;
  public email!: string;
  public role!: 'delivery_person' | 'customer' | 'admin';
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

User.init(
  {
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
      allowNull: false,
      index: true
    },
    isVerified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    name: {
      type: DataTypes.STRING,
      allowNull: true
    },
    email: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: true,
      index: true
    },
    role: {
      type: DataTypes.ENUM('delivery_person', 'customer', 'admin'),
      defaultValue: 'customer'
    }
  },
  {
    sequelize,
    tableName: 'users',
    timestamps: true,
    indexes: [{ fields: ['email'] }, { fields: ['deviceId'] }]
  }
);

// ============================================
// 2. SESSION MODEL
// ============================================
export class Session extends Model {
  public id!: string;
  public userId!: string;
  public sessionToken!: string;
  public expiresAt!: Date;
  public status!: 'active' | 'expired' | 'revoked';
  public readonly createdAt!: Date;
}

Session.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: User,
        key: 'id'
      }
    },
    sessionToken: {
      type: DataTypes.STRING(512),
      unique: true,
      index: true
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('active', 'expired', 'revoked'),
      defaultValue: 'active'
    }
  },
  {
    sequelize,
    tableName: 'sessions',
    timestamps: true,
    indexes: [{ fields: ['userId'] }, { fields: ['sessionToken'] }]
  }
);

// ============================================
// 3. DELIVERY MODEL
// ============================================
export class Delivery extends Model {
  public id!: string;
  public orderId!: string;
  public deliveryPersonId!: string;
  public customerId!: string;
  public startLocation!: { latitude: number; longitude: number };
  public endLocation!: { latitude: number; longitude: number };
  public status!: 'pending' | 'in_transit' | 'arrived' | 'completed' | 'failed';
  public startTime!: Date;
  public completedTime!: Date | null;
  public distanceMeters!: number;
  public estimatedETA!: Date;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Delivery.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    orderId: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: false,
      index: true
    },
    deliveryPersonId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: User,
        key: 'id'
      }
    },
    customerId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: User,
        key: 'id'
      }
    },
    startLocation: {
      type: DataTypes.JSON,
      allowNull: false,
      comment: '{ latitude: number, longitude: number }'
    },
    endLocation: {
      type: DataTypes.JSON,
      allowNull: false,
      comment: '{ latitude: number, longitude: number }'
    },
    status: {
      type: DataTypes.ENUM(
        'pending',
        'in_transit',
        'arrived',
        'completed',
        'failed'
      ),
      defaultValue: 'pending'
    },
    startTime: {
      type: DataTypes.DATE,
      allowNull: false
    },
    completedTime: {
      type: DataTypes.DATE,
      allowNull: true
    },
    distanceMeters: {
      type: DataTypes.FLOAT,
      defaultValue: 0
    },
    estimatedETA: {
      type: DataTypes.DATE,
      allowNull: true
    }
  },
  {
    sequelize,
    tableName: 'deliveries',
    timestamps: true,
    indexes: [
      { fields: ['orderId'] },
      { fields: ['deliveryPersonId'] },
      { fields: ['customerId'] },
      { fields: ['status'] }
    ]
  }
);

// ============================================
// 4. LOCATION HISTORY MODEL
// ============================================
export class LocationHistory extends Model {
  public id!: string;
  public deliveryId!: string;
  public userId!: string;
  public latitude!: number;
  public longitude!: number;
  public accuracy!: number;
  public speed!: number;
  public heading!: number;
  public readonly createdAt!: Date;
}

LocationHistory.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    deliveryId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: Delivery,
        key: 'id'
      }
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: User,
        key: 'id'
      }
    },
    latitude: {
      type: DataTypes.DECIMAL(10, 8),
      allowNull: false
    },
    longitude: {
      type: DataTypes.DECIMAL(11, 8),
      allowNull: false
    },
    accuracy: {
      type: DataTypes.FLOAT,
      defaultValue: 0
    },
    speed: {
      type: DataTypes.FLOAT,
      defaultValue: 0
    },
    heading: {
      type: DataTypes.FLOAT,
      defaultValue: 0
    }
  },
  {
    sequelize,
    tableName: 'location_history',
    timestamps: true,
    indexes: [
      { fields: ['deliveryId'] },
      { fields: ['userId'] },
      { fields: ['createdAt'] }
    ]
  }
);

// ============================================
// 5. PROXIMITY HANDSHAKE MODEL
// ============================================
export class ProximityHandshake extends Model {
  public id!: string;
  public initiatorId!: string;
  public receiverId!: string | null;
  public handshakeCode!: string;
  public encryptedPayload!: string | null;
  public latitude!: number;
  public longitude!: number;
  public status!: 'pending' | 'active' | 'completed' | 'failed';
  public phase!: 'gps' | 'bluetooth' | 'uwb' | 'nfc' | 'complete';
  public distance!: number | null;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

ProximityHandshake.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    initiatorId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: User,
        key: 'id'
      }
    },
    receiverId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: User,
        key: 'id'
      }
    },
    handshakeCode: {
      type: DataTypes.STRING(6),
      unique: true,
      allowNull: false,
      index: true
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
    },
    distance: {
      type: DataTypes.FLOAT,
      allowNull: true
    }
  },
  {
    sequelize,
    tableName: 'proximity_handshakes',
    timestamps: true,
    indexes: [
      { fields: ['handshakeCode'] },
      { fields: ['status'] },
      { fields: ['initiatorId'] }
    ]
  }
);

// ============================================
// 6. NFT RECORD MODEL (for blockchain)
// ============================================
export class NFTRecord extends Model {
  public id!: string;
  public deliveryId!: string;
  public transactionHash!: string | null;
  public nftMintAddress!: string | null;
  public status!: 'pending' | 'minted' | 'failed';
  public metadata!: Record<string, any>;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

NFTRecord.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    deliveryId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: Delivery,
        key: 'id'
      }
    },
    transactionHash: {
      type: DataTypes.STRING,
      allowNull: true,
      index: true
    },
    nftMintAddress: {
      type: DataTypes.STRING,
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('pending', 'minted', 'failed'),
      defaultValue: 'pending'
    },
    metadata: {
      type: DataTypes.JSON,
      defaultValue: {}
    }
  },
  {
    sequelize,
    tableName: 'nft_records',
    timestamps: true,
    indexes: [{ fields: ['deliveryId'] }, { fields: ['transactionHash'] }]
  }
);

// ============================================
// SET UP ASSOCIATIONS
// ============================================
User.hasMany(Session, { foreignKey: 'userId', as: 'sessions' });
Session.belongsTo(User, { foreignKey: 'userId', as: 'user' });

User.hasMany(Delivery, { foreignKey: 'deliveryPersonId', as: 'deliveries' });
Delivery.belongsTo(User, {
  foreignKey: 'deliveryPersonId',
  as: 'deliveryPerson'
});

User.hasMany(Delivery, { foreignKey: 'customerId', as: 'orders' });
Delivery.belongsTo(User, { foreignKey: 'customerId', as: 'customer' });

Delivery.hasMany(LocationHistory, { foreignKey: 'deliveryId', as: 'locations' });
LocationHistory.belongsTo(Delivery, { foreignKey: 'deliveryId' });

User.hasMany(LocationHistory, { foreignKey: 'userId', as: 'locationHistory' });
LocationHistory.belongsTo(User, { foreignKey: 'userId' });

Delivery.hasOne(NFTRecord, { foreignKey: 'deliveryId', as: 'nftRecord' });
NFTRecord.belongsTo(Delivery, { foreignKey: 'deliveryId' });

User.hasMany(ProximityHandshake, {
  foreignKey: 'initiatorId',
  as: 'initiatedHandshakes'
});
ProximityHandshake.belongsTo(User, {
  foreignKey: 'initiatorId',
  as: 'initiator'
});

// ============================================
// DATABASE INITIALIZATION
// ============================================
export async function initializeDatabase() {
  try {
    // Test connection
    await sequelize.authenticate();
    console.log('✅ Database connected successfully');

    // Sync all models
    await sequelize.sync({ alter: false });
    console.log('✅ Database models synced');

    return true;
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    return false;
  }
}

// Export sequelize instance
export default sequelize;
