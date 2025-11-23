import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { smartAccountService } from '../services/smart-account.service';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

export class WalletController {
  /**
   * Create a new smart account via RootManager (Web2-like, gasless)
   */
  static async createSmartAccount(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.id;

      // Check if user already has a smart account
      const existingAccount = await smartAccountService.getUserSmartAccount(userId);
      if (existingAccount) {
        return res.json({
          success: true,
          smartAccount: existingAccount,
          message: 'Smart account already exists',
        });
      }

      // Create smart account via RootManager
      const smartAccount = await smartAccountService.createSmartAccountViaRootManager(userId);

      logger.info(`Smart account ${smartAccount.smartAccountAddress} created for user ${userId}`);

      return res.json({
        success: true,
        smartAccount,
        message: 'Smart account created successfully',
      });
    } catch (error) {
      logger.error('Error creating smart account:', error);
      throw error;
    }
  }

  /**
   * Execute a gasless transaction via bundler/paymaster
   */
  static async executeGaslessTransaction(req: AuthRequest, res: Response) {
    try {
      const { to, data, value } = req.body;
      const userId = req.user!.id;

      if (!to || !data) {
        throw new AppError('Transaction "to" and "data" are required', 400);
      }

      // Execute transaction via bundler
      const result = await smartAccountService.executeGaslessTransaction(userId, {
        to,
        data,
        value: value || '0',
      });

      return res.json({
        success: true,
        txHash: result.txHash,
        message: 'Transaction executed successfully',
      });
    } catch (error) {
      logger.error('Error executing gasless transaction:', error);
      throw error;
    }
  }

  /**
   * Register smart account address for user
   */
  static async registerSmartAccount(req: AuthRequest, res: Response) {
    try {
      const { smartAccountAddress } = req.body;

      if (!smartAccountAddress) {
        throw new AppError('Smart account address is required', 400);
      }

      // Update user with smart account address
      const user = await smartAccountService.registerSmartAccountAddress(
        req.user!.id,
        smartAccountAddress
      );

      logger.info(`Smart account ${smartAccountAddress} registered for user ${req.user!.id}`);

      return res.json({
        success: true,
        message: 'Smart account registered successfully',
        user: {
          id: user.id,
          smartAccountAddress: user.smartAccountAddress,
        },
      });
    } catch (error) {
      logger.error('Error registering smart account:', error);
      throw error;
    }
  }

  /**
   * Get smart account info
   */
  static async getSmartAccountInfo(req: AuthRequest, res: Response) {
    try {
      // Get from user's account
      const user = req.user!;

      if (!user.smartAccountAddress) {
        return res.json({
          success: true,
          accountInfo: null,
          message: 'No smart account registered',
        });
      }

      const accountInfo = await smartAccountService.getSmartAccountInfo(user.smartAccountAddress);

      return res.json({
        success: true,
        accountInfo,
      });
    } catch (error) {
      logger.error('Error getting smart account info:', error);
      throw error;
    }
  }

  /**
   * Get credit balance - DEPRECATED: Credits system removed, use micropayments
   */
  static async getCreditBalance(_req: AuthRequest, res: Response) {
    return res.json({
      success: true,
      message:
        'Credit balance system has been removed. All AI usage is now pay-per-use via micropayments.',
      balance: 0,
    });
  }

  /**
   * Register session key
   */
  static async registerSessionKey(req: AuthRequest, res: Response) {
    try {
      const { sessionKey, validUntil, spendingLimit } = req.body;

      if (!sessionKey || !validUntil || !spendingLimit) {
        throw new AppError('Session key, validity period, and spending limit are required', 400);
      }

      const smartAccountAddress = req.user!.walletAddress;
      if (!smartAccountAddress) {
        throw new AppError('User does not have a wallet address', 400);
      }

      const txHash = await smartAccountService.registerSessionKey(
        smartAccountAddress,
        sessionKey,
        validUntil,
        spendingLimit
      );

      res.json({
        success: true,
        message: 'Session key registered successfully',
        txHash,
      });
    } catch (error) {
      logger.error('Error registering session key:', error);
      throw error;
    }
  }
}
