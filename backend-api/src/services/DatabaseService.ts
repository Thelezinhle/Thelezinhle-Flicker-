import {
  User,
  Session,
  Delivery,
  LocationHistory,
  ProximityHandshake,
  NFTRecord
} from '../models/database';

/**
 * User Service - Database operations for users
 */
export const UserService = {
  async createUser(data: {
    deviceId: string;
    publicKey: string;
    name?: string;
    email?: string;
    role?: 'delivery_person' | 'customer' | 'admin';
  }) {
    return await User.create(data);
  },

  async findUserById(userId: string) {
    return await User.findByPk(userId);
  },

  async findUserByDeviceId(deviceId: string) {
    return await User.findOne({ where: { deviceId } });
  },

  async findUserByEmail(email: string) {
    return await User.findOne({ where: { email } });
  },

  async updateUser(userId: string, data: Partial<any>) {
    const user = await User.findByPk(userId);
    if (!user) throw new Error('User not found');
    return await user.update(data);
  },

  async getAllUsers() {
    return await User.findAll();
  }
};

/**
 * Session Service - Database operations for sessions
 */
export const SessionService = {
  async createSession(data: {
    userId: string;
    sessionToken: string;
    expiresAt: Date;
    status?: 'active' | 'expired' | 'revoked';
  }) {
    return await Session.create(data);
  },

  async findSessionByToken(sessionToken: string) {
    return await Session.findOne({
      where: { sessionToken },
      include: [{ model: User, as: 'user' }]
    });
  },

  async findSessionsByUserId(userId: string) {
    return await Session.findAll({ where: { userId } });
  },

  async updateSessionStatus(
    sessionId: string,
    status: 'active' | 'expired' | 'revoked'
  ) {
    const session = await Session.findByPk(sessionId);
    if (!session) throw new Error('Session not found');
    return await session.update({ status });
  },

  async revokeSession(sessionId: string) {
    return await SessionService.updateSessionStatus(sessionId, 'revoked');
  }
};

/**
 * Delivery Service - Database operations for deliveries
 */
export const DeliveryService = {
  async createDelivery(data: {
    orderId: string;
    deliveryPersonId: string;
    customerId: string;
    startLocation: { latitude: number; longitude: number };
    endLocation: { latitude: number; longitude: number };
    estimatedETA?: Date;
  }) {
    return await Delivery.create({
      ...data,
      status: 'pending',
      startTime: new Date(),
      distanceMeters: 0
    });
  },

  async findDeliveryById(deliveryId: string) {
    return await Delivery.findByPk(deliveryId, {
      include: [
        { model: User, as: 'deliveryPerson' },
        { model: User, as: 'customer' },
        { model: LocationHistory, as: 'locations' }
      ]
    });
  },

  async findDeliveryByOrderId(orderId: string) {
    return await Delivery.findOne({
      where: { orderId },
      include: [
        { model: User, as: 'deliveryPerson' },
        { model: User, as: 'customer' }
      ]
    });
  },

  async findDeliveriesByDeliveryPerson(deliveryPersonId: string) {
    return await Delivery.findAll({
      where: { deliveryPersonId },
      order: [['createdAt', 'DESC']]
    });
  },

  async findDeliveriesByCustomer(customerId: string) {
    return await Delivery.findAll({
      where: { customerId },
      order: [['createdAt', 'DESC']]
    });
  },

  async updateDeliveryStatus(
    deliveryId: string,
    status: 'pending' | 'in_transit' | 'arrived' | 'completed' | 'failed'
  ) {
    const delivery = await Delivery.findByPk(deliveryId);
    if (!delivery) throw new Error('Delivery not found');

    const updateData: any = { status };
    if (status === 'completed') {
      updateData.completedTime = new Date();
    }

    return await delivery.update(updateData);
  },

  async updateDeliveryDistance(deliveryId: string, distanceMeters: number) {
    const delivery = await Delivery.findByPk(deliveryId);
    if (!delivery) throw new Error('Delivery not found');
    return await delivery.update({ distanceMeters });
  },

  async getDeliveryHistory(
    deliveryId: string,
    limit: number = 100,
    offset: number = 0
  ) {
    return await LocationHistory.findAll({
      where: { deliveryId },
      limit,
      offset,
      order: [['createdAt', 'ASC']]
    });
  }
};

/**
 * Location Service - Database operations for location tracking
 */
export const LocationService = {
  async recordLocation(data: {
    deliveryId: string;
    userId: string;
    latitude: number;
    longitude: number;
    accuracy?: number;
    speed?: number;
    heading?: number;
  }) {
    return await LocationHistory.create(data);
  },

  async getRecentLocations(
    deliveryId: string,
    limit: number = 50
  ) {
    return await LocationHistory.findAll({
      where: { deliveryId },
      limit,
      order: [['createdAt', 'DESC']]
    });
  },

  async getLocationsBetweenTimestamps(
    deliveryId: string,
    startTime: Date,
    endTime: Date
  ) {
    return await LocationHistory.findAll({
      where: {
        deliveryId,
        createdAt: {
          [require('sequelize').Op.between]: [startTime, endTime]
        }
      },
      order: [['createdAt', 'ASC']]
    });
  },

  async getUserLocationHistory(userId: string, limit: number = 100) {
    return await LocationHistory.findAll({
      where: { userId },
      limit,
      order: [['createdAt', 'DESC']]
    });
  }
};

/**
 * Proximity Service - Database operations for proximity handshakes
 */
export const ProximityService = {
  async createHandshake(data: {
    initiatorId: string;
    handshakeCode: string;
    latitude: number;
    longitude: number;
  }) {
    return await ProximityHandshake.create({
      ...data,
      status: 'pending',
      phase: 'gps'
    });
  },

  async findHandshakeByCode(handshakeCode: string) {
    return await ProximityHandshake.findOne(
      {
        where: { handshakeCode },
        include: [
          { model: User, as: 'initiator' },
          { model: User, as: 'receiver' }
        ]
      }
    );
  },

  async updateHandshakePhase(
    handshakeId: string,
    phase: 'gps' | 'bluetooth' | 'uwb' | 'nfc' | 'complete'
  ) {
    const handshake = await ProximityHandshake.findByPk(handshakeId);
    if (!handshake) throw new Error('Handshake not found');
    return await handshake.update({ phase });
  },

  async updateHandshakeStatus(
    handshakeId: string,
    status: 'pending' | 'active' | 'completed' | 'failed'
  ) {
    const handshake = await ProximityHandshake.findByPk(handshakeId);
    if (!handshake) throw new Error('Handshake not found');
    return await handshake.update({ status });
  },

  async recordHandshakeDistance(
    handshakeId: string,
    distance: number
  ) {
    const handshake = await ProximityHandshake.findByPk(handshakeId);
    if (!handshake) throw new Error('Handshake not found');
    return await handshake.update({ distance });
  },

  async completeHandshake(
    handshakeId: string,
    receiverId: string,
    encryptedPayload?: string
  ) {
    const handshake = await ProximityHandshake.findByPk(handshakeId);
    if (!handshake) throw new Error('Handshake not found');

    return await handshake.update({
      receiverId,
      status: 'completed',
      phase: 'complete',
      encryptedPayload
    });
  },

  async findPendingHandshakes() {
    return await ProximityHandshake.findAll({
      where: { status: 'pending' },
      order: [['createdAt', 'DESC']]
    });
  }
};

/**
 * NFT Service - Database operations for NFT records
 */
export const NFTService = {
  async createNFTRecord(data: {
    deliveryId: string;
    metadata?: Record<string, any>;
  }) {
    return await NFTRecord.create({
      ...data,
      status: 'pending'
    });
  },

  async findNFTByDelivery(deliveryId: string) {
    return await NFTRecord.findOne({ where: { deliveryId } });
  },

  async updateNFTStatus(
    nftId: string,
    status: 'pending' | 'minted' | 'failed',
    transactionHash?: string,
    mintAddress?: string
  ) {
    const nft = await NFTRecord.findByPk(nftId);
    if (!nft) throw new Error('NFT record not found');

    return await nft.update({
      status,
      transactionHash: transactionHash || nft.transactionHash,
      nftMintAddress: mintAddress || nft.nftMintAddress
    });
  },

  async getPendingNFTs() {
    return await NFTRecord.findAll({
      where: { status: 'pending' },
      include: [
        {
          model: Delivery,
          include: [
            { model: User, as: 'deliveryPerson' },
            { model: User, as: 'customer' }
          ]
        }
      ]
    });
  }
};
