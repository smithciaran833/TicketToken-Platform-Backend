import { PublicKey } from '@solana/web3.js';
import { ethers } from 'ethers';
import nacl from 'tweetnacl';
import { db } from '../config/database';
import { redis } from '../config/redis';
import { AuthenticationError } from '../errors';
import crypto from 'crypto';
import { JWTService } from './jwt.service';

export class WalletService {
  private jwtService: JWTService;

  constructor() {
    this.jwtService = new JWTService();
  }

  async generateNonce(walletAddress: string): Promise<string> {
    const nonce = crypto.randomBytes(32).toString('hex');
    await redis.setex(`wallet_nonce:${walletAddress}`, 300, nonce);
    return nonce;
  }

  async verifySolanaSignature(
    publicKey: string,
    signature: string,
    message: string
  ): Promise<boolean> {
    try {
      const publicKeyObj = new PublicKey(publicKey);
      const signatureBuffer = Buffer.from(signature, 'base64');
      const messageBuffer = Buffer.from(message);
      
      return nacl.sign.detached.verify(
        messageBuffer,
        signatureBuffer,
        publicKeyObj.toBytes()
      );
    } catch (error) {
      console.error('Solana signature verification failed:', error);
      return false;
    }
  }

  async verifyEthereumSignature(
    address: string,
    signature: string,
    message: string
  ): Promise<boolean> {
    try {
      const recoveredAddress = ethers.verifyMessage(message, signature);
      return recoveredAddress.toLowerCase() === address.toLowerCase();
    } catch (error) {
      console.error('Ethereum signature verification failed:', error);
      return false;
    }
  }

  async connectWallet(
    userId: string,
    walletAddress: string,
    network: 'solana' | 'ethereum',
    signature: string
  ): Promise<any> {
    const nonce = await redis.get(`wallet_nonce:${walletAddress}`);
    if (!nonce) {
      throw new AuthenticationError('Nonce expired or not found');
    }

    const message = `Connect wallet to TicketToken\nNonce: ${nonce}`;
    
    let isValid = false;
    if (network === 'solana') {
      isValid = await this.verifySolanaSignature(walletAddress, signature, message);
    } else {
      isValid = await this.verifyEthereumSignature(walletAddress, signature, message);
    }

    if (!isValid) {
      throw new AuthenticationError('Invalid wallet signature');
    }

    const existingConnection = await db('wallet_connections')
      .where({ wallet_address: walletAddress, network })
      .first();

    if (existingConnection && existingConnection.user_id !== userId) {
      throw new AuthenticationError('Wallet already connected to another account');
    }

    if (!existingConnection) {
      await db('wallet_connections').insert({
        user_id: userId,
        wallet_address: walletAddress,
        network: network,
        verified: true
      });
    }

    await redis.del(`wallet_nonce:${walletAddress}`);

    return {
      success: true,
      wallet: { address: walletAddress, network, connected: true }
    };
  }

  async loginWithWallet(
    walletAddress: string,
    network: 'solana' | 'ethereum',
    signature: string
  ): Promise<any> {
    const nonce = await redis.get(`wallet_nonce:${walletAddress}`);
    if (!nonce) {
      throw new AuthenticationError('Nonce expired or not found');
    }

    const message = `Login to TicketToken\nNonce: ${nonce}`;
    
    let isValid = false;
    if (network === 'solana') {
      isValid = await this.verifySolanaSignature(walletAddress, signature, message);
    } else {
      isValid = await this.verifyEthereumSignature(walletAddress, signature, message);
    }

    if (!isValid) {
      throw new AuthenticationError('Invalid wallet signature');
    }

    const connection = await db('wallet_connections')
      .where({ wallet_address: walletAddress, network, verified: true })
      .first();

    if (!connection) {
      throw new AuthenticationError('Wallet not connected to any account');
    }

    const user = await db('users').where({ id: connection.user_id }).first();
    if (!user) {
      throw new AuthenticationError('User not found');
    }

    await redis.del(`wallet_nonce:${walletAddress}`);
    await db('users').where({ id: user.id }).update({ last_login_at: new Date() });

    const tokens = await this.jwtService.generateTokenPair(user);
    
    return {
      success: true,
      user: { id: user.id, email: user.email },
      tokens,
      wallet: { address: walletAddress, network }
    };
  }
}
