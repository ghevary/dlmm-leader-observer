import {
  Connection,
  PublicKey,
  SignaturesForAddressOptions,
  ConfirmedSignatureInfo,
  ParsedTransactionWithMeta,
  VersionedTransactionResponse,
  GetVersionedTransactionConfig,
} from '@solana/web3.js';
import { config } from '../config.js';

export interface RpcRetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
}

export class SolanaRpcClient {
  private connection: Connection;
  private maxRetries: number;
  private initialDelayMs: number;
  private maxDelayMs: number;

  constructor(
    endpoint: string = config.SOLANA_RPC_URL,
    options: RpcRetryOptions = {}
  ) {
    this.connection = new Connection(endpoint, {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: 30000,
    });
    this.maxRetries = options.maxRetries ?? 5;
    this.initialDelayMs = options.initialDelayMs ?? 1000;
    this.maxDelayMs = options.maxDelayMs ?? 15000;
  }

  /**
   * Helper to execute read-only RPC calls with exponential backoff on transient errors / rate-limits (HTTP 429).
   */
  private async executeWithRetry<T>(fn: () => Promise<T>, context: string): Promise<T> {
    let attempt = 0;
    let delay = this.initialDelayMs;

    while (true) {
      try {
        return await fn();
      } catch (error: unknown) {
        attempt++;
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isRateLimit = errorMessage.includes('429') || errorMessage.toLowerCase().includes('rate limit') || errorMessage.toLowerCase().includes('too many requests');
        const isTransient = isRateLimit || errorMessage.includes('503') || errorMessage.includes('ETIMEDOUT') || errorMessage.includes('ECONNRESET');

        if (attempt > this.maxRetries || !isTransient) {
          throw new Error(`[RPC Error] ${context} failed after ${attempt} attempts: ${errorMessage}`);
        }

        const jitter = Math.floor(Math.random() * 200);
        const waitTime = Math.min(delay + jitter, this.maxDelayMs);
        if (config.LOG_LEVEL === 'debug' || isRateLimit) {
          console.warn(`[RPC Warning] ${context} encountered error (${errorMessage}). Retrying in ${waitTime}ms (Attempt ${attempt}/${this.maxRetries})...`);
        }
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        delay *= 2;
      }
    }
  }

  /**
   * Fetch transaction signatures for an address (Read-only).
   */
  public async getSignaturesForAddress(
    address: PublicKey,
    options?: SignaturesForAddressOptions
  ): Promise<ConfirmedSignatureInfo[]> {
    return this.executeWithRetry(
      () => this.connection.getSignaturesForAddress(address, options, 'confirmed'),
      `getSignaturesForAddress(${address.toBase58()})`
    );
  }

  /**
   * Fetch parsed transaction with meta (Read-only).
   */
  public async getParsedTransaction(
    signature: string
  ): Promise<ParsedTransactionWithMeta | null> {
    return this.executeWithRetry(
      () =>
        this.connection.getParsedTransaction(signature, {
          maxSupportedTransactionVersion: 0,
          commitment: 'confirmed',
        }),
      `getParsedTransaction(${signature})`
    );
  }

  /**
   * Fetch raw versioned transaction with meta (Read-only).
   */
  public async getTransaction(
    signature: string,
    options?: GetVersionedTransactionConfig
  ): Promise<VersionedTransactionResponse | null> {
    return this.executeWithRetry(
      () =>
        this.connection.getTransaction(signature, {
          maxSupportedTransactionVersion: 0,
          commitment: 'confirmed',
          ...options,
        }),
      `getTransaction(${signature})`
    );
  }

  /**
   * Fetch account info (Read-only).
   */
  public async getAccountInfo(publicKey: PublicKey) {
    return this.executeWithRetry(
      () => this.connection.getAccountInfo(publicKey, 'confirmed'),
      `getAccountInfo(${publicKey.toBase58()})`
    );
  }

  /**
   * Fetch current slot (Read-only).
   */
  public async getSlot(): Promise<number> {
    return this.executeWithRetry(
      () => this.connection.getSlot('confirmed'),
      'getSlot()'
    );
  }
}

// Export singleton instance initialized with current config
export const rpcClient = new SolanaRpcClient();
