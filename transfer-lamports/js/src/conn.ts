import web, {
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  Signer,
  Transaction,
} from '@solana/web3.js'
import {
  EXPLORER_ADDRESS,
  EXPLORER_TX,
  LOCAL_CLUSTER,
  logDebug,
  logExpl,
  logTrace,
  prettyAccountInfo,
  prettyLamports,
} from './utils'
import { strict as assert } from 'assert'

const LamportsNeededToKeepAliveUntilRentExcempt = 4000
type InitAccountOpts = {
  rentExcempt: boolean
  lamports: number
}

const DefaultInitAccountOpts = {
  rentExcempt: true,
  lamports: 0,
}

export class Conn {
  constructor(private readonly _connection: Connection) {}

  get connection(): Connection {
    return this._connection
  }

  // -----------------
  // Airdrop
  // -----------------
  async airdropSol(to: PublicKey, sols: number) {
    return this.airdrop(to, sols * LAMPORTS_PER_SOL)
  }

  async airdrop(to: PublicKey, lamports: number) {
    const airdropSignature = await this._connection.requestAirdrop(to, lamports)
    await this._connection.confirmTransaction(airdropSignature)
    logDebug(`Airdropped ${prettyLamports(lamports)} to: ${to}`)
    logTrace(`Signature: ${airdropSignature}`)
    logExpl(this.solanaExplorerTxUrl(airdropSignature))

    return airdropSignature
  }

  // -----------------
  // Transaction
  // -----------------
  async sendAndConfirmTransaction(transaction: Transaction, signer: Signer[]) {
    const transactionSig = await web.sendAndConfirmTransaction(
      this._connection,
      transaction,
      signer
    )
    logTrace(`Sig: ${transactionSig}`)
    logExpl(this.solanaExplorerTxUrl(transactionSig))

    return transactionSig
  }

  // -----------------
  // Account
  // -----------------
  async logBalance(account: PublicKey) {
    const balance = await this._connection.getBalance(account)
    logDebug(`Balance ${account.toBase58()}: ${prettyLamports(balance)}`)
  }

  async logAccountInfo(account: PublicKey) {
    const accountInfo = await this._connection.getAccountInfo(account)
    if (accountInfo == null) {
      logDebug(`AccountInfo { NOT FOUND, key: ${account.toBase58()} }`)
    } else {
      logDebug(prettyAccountInfo(accountInfo))
    }
  }

  async getAccountMinimumBalanceForRentExemption(account: PublicKey) {
    const accountInfo = await this._connection.getAccountInfo(account)
    assert(
      accountInfo != null,
      'cannot rent excempt account that doesn not exist'
    )
    const dataLen = accountInfo.data?.length ?? 1
    const rentExcemptBalance =
      await this._connection.getMinimumBalanceForRentExemption(dataLen)
    return { rentExcemptBalance, currentBalance: accountInfo.lamports }
  }

  async makeAccountRentExcempt(account: PublicKey) {
    const { rentExcemptBalance, currentBalance } =
      await this.getAccountMinimumBalanceForRentExemption(account)

    const neededLamports = Math.max(rentExcemptBalance - currentBalance, 0)
    if (neededLamports == 0) {
      logDebug(
        'Account has %s and needs %s to be rent-excempt, no airdrop necessary',
        prettyLamports(currentBalance),
        prettyLamports(rentExcemptBalance)
      )
      return 0
    }

    logDebug(
      'Account has %s and needs %s to be rent-excempt, airdropping %s',
      prettyLamports(currentBalance),
      prettyLamports(rentExcemptBalance),
      prettyLamports(neededLamports)
    )

    return this.airdrop(account, neededLamports)
  }

  async initAccount(
    account: PublicKey,
    initAccountOpts: Partial<InitAccountOpts> = DefaultInitAccountOpts
  ) {
    const opts = Object.assign({}, DefaultInitAccountOpts, initAccountOpts)
    if (opts.rentExcempt) {
      const lamports = Math.max(
        opts.lamports,
        LamportsNeededToKeepAliveUntilRentExcempt
      )
      await this.airdrop(account, lamports)
      await this.makeAccountRentExcempt(account)
    } else {
      await this.airdrop(account, opts.lamports)
    }
  }

  // -----------------
  // Cluster
  // -----------------
  solanaCluster() {
    // TODO: detect devnet as well
    return LOCAL_CLUSTER
  }
  solanaExplorerTxUrl(key: string) {
    return `${EXPLORER_TX}/${key}?${this.solanaCluster()}`
  }
  solanaExplorerAddressUrl(pubkey: PublicKey) {
    return `${EXPLORER_ADDRESS}/${pubkey.toBase58()}?${this.solanaCluster()}`
  }
}
