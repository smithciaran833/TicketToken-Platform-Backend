"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserWalletManager = void 0;
const web3_js_1 = require("@solana/web3.js");
const tweetnacl_1 = __importDefault(require("tweetnacl"));
class UserWalletManager {
    db;
    constructor(db) {
        this.db = db;
    }
    async connectWallet(userId, walletAddress, signatureBase64, message) {
        try {
            const signMessage = message || `Connect wallet to TicketToken: ${userId}`;
            const verified = await this.verifySignature(walletAddress, signatureBase64, signMessage);
            if (!verified) {
                throw new Error('Invalid wallet signature');
            }
            const existing = await this.db.query('SELECT * FROM wallet_addresses WHERE user_id = $1 AND wallet_address = $2', [userId, walletAddress]);
            if (existing.rows.length > 0) {
                await this.db.query(`
          UPDATE wallet_addresses
          SET verified_at = NOW(),
              is_primary = true,
              last_used_at = NOW(),
              updated_at = NOW()
          WHERE user_id = $1 AND wallet_address = $2
        `, [userId, walletAddress]);
                await this.db.query(`
          UPDATE wallet_addresses
          SET is_primary = false
          WHERE user_id = $1 AND wallet_address != $2
        `, [userId, walletAddress]);
                return {
                    success: true,
                    wallet: existing.rows[0],
                    message: 'Wallet reconnected successfully'
                };
            }
            await this.db.query(`
        UPDATE wallet_addresses
        SET is_primary = false
        WHERE user_id = $1
      `, [userId]);
            const result = await this.db.query(`
        INSERT INTO wallet_addresses
        (user_id, wallet_address, blockchain_type, is_primary, verified_at, created_at, updated_at)
        VALUES ($1, $2, 'SOLANA', true, NOW(), NOW(), NOW())
        RETURNING *
      `, [userId, walletAddress]);
            await this.db.query(`
        INSERT INTO user_wallet_connections
        (user_id, wallet_address, signature_proof, connected_at, is_primary)
        VALUES ($1, $2, $3, NOW(), true)
      `, [userId, walletAddress, signatureBase64]);
            return {
                success: true,
                wallet: result.rows[0],
                message: 'Wallet connected successfully'
            };
        }
        catch (error) {
            console.error('Wallet connection failed:', error);
            return {
                success: false,
                message: '',
                error: error.message
            };
        }
    }
    async verifySignature(publicKeyString, signatureBase64, message) {
        try {
            const publicKey = new web3_js_1.PublicKey(publicKeyString);
            const signature = Buffer.from(signatureBase64, 'base64');
            const messageBytes = new TextEncoder().encode(message);
            return tweetnacl_1.default.sign.detached.verify(messageBytes, signature, publicKey.toBuffer());
        }
        catch (error) {
            console.error('Signature verification failed:', error);
            return false;
        }
    }
    async getUserWallets(userId) {
        const result = await this.db.query(`
      SELECT * FROM wallet_addresses
      WHERE user_id = $1
      ORDER BY is_primary DESC NULLS LAST, created_at DESC
    `, [userId]);
        return result.rows;
    }
    async getPrimaryWallet(userId) {
        const result = await this.db.query(`
      SELECT * FROM wallet_addresses
      WHERE user_id = $1 AND is_primary = true
      LIMIT 1
    `, [userId]);
        return result.rows[0] || null;
    }
    async verifyOwnership(userId, walletAddress) {
        const result = await this.db.query(`
      SELECT * FROM wallet_addresses
      WHERE user_id = $1 AND wallet_address = $2
    `, [userId, walletAddress]);
        return result.rows.length > 0;
    }
    async disconnectWallet(userId, walletAddress) {
        await this.db.query(`
      DELETE FROM wallet_addresses
      WHERE user_id = $1 AND wallet_address = $2
    `, [userId, walletAddress]);
        return { success: true, message: 'Wallet disconnected' };
    }
    async updateLastUsed(userId, walletAddress) {
        await this.db.query(`
      UPDATE wallet_addresses
      SET last_used_at = NOW(), updated_at = NOW()
      WHERE user_id = $1 AND wallet_address = $2
    `, [userId, walletAddress]);
    }
}
exports.UserWalletManager = UserWalletManager;
exports.default = UserWalletManager;
//# sourceMappingURL=userWallet.js.map