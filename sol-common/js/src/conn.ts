import web, {
  Commitment,
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
<<<<<<< HEAD:sol-common/js/src/conn.ts
<<<<<<< HEAD:sol-common/js/src/conn.ts
  LOCAL_CLUSTER_URL,
=======
>>>>>>> cd90b3f (js: added transaction logging):transfer-lamports/js/src/conn.ts
=======
  LOCAL_CLUSTER_URL,
>>>>>>> e0a358e (js: adding success + failure tests):transfer-lamports/js/src/conn.ts
  logConfirmedTransaction,
  logDebug,
  logError,
  logExpl,
  logInfo,
  logTrace,
  prettyAccountInfo,
  prettyLamports,
} from './utils'
import { gray, green, greenBright, red } from 'ansi-colors'
import { strict as assert } from 'assert'

// TODO: calculate this via AccountLayout
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
  constructor(
    private readonly _connection: Connection,
    private readonly _pubKeyLabels: Map<string, string> = new Map()
  ) {}

  get connection(): Connection {
    return this._connection
  }

  // -----------------
  // Pubkey Labels
  // -----------------
  addLabel(pubKey: PublicKey, label: string) {
    this._pubKeyLabels.set(pubKey.toBase58(), label)
    return this
  }

  label(pubKey: PublicKey | Buffer | Uint8Array) {
    if (Buffer.isBuffer(pubKey) || pubKey instanceof Uint8Array) {
      pubKey = new PublicKey(pubKey)
    }
    return this._label(pubKey)
  }

  private _renderLabel(pubKey: PublicKey) {
    if (pubKey == null) return red('<NULL>')
    const base58 = pubKey.toBase58()
    const label = this._pubKeyLabels.get(base58)
    return label != null
      ? `${greenBright(label)} (${green(base58.slice(0, 8))})`
      : green(base58)
  }

  private _label(pubKey: PublicKey) {
    if (pubKey == null) return '<NULL>'
    const base58 = pubKey.toBase58()
    const label = this._pubKeyLabels.get(base58)
    return label != null ? `${label} (${base58.slice(0, 8)})` : base58
  }

  logLabels() {
    let labels = 'Labels {'
    for (const [key, val] of this._pubKeyLabels.entries()) {
      const solUrl = Conn.solanaExplorerAddressUrlFromBase58(key)
      labels += `\n  ${gray(key)}: ${greenBright(val)}`
      labels += `\n    ${gray(solUrl)}`
    }
    labels += '\n}'
    logDebug(labels)
  }

  jsonLabels() {
    const record = {}
    for (const [key, val] of this._pubKeyLabels.entries()) {
      record[key] = val
    }
    return JSON.stringify(record, null, 2)
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
    logDebug(
      `Airdropped ${prettyLamports(lamports)} to: ${this._renderLabel(to)}`
    )
    logTrace(`Signature: ${airdropSignature}`)
    logExpl(gray(this.solanaExplorerTxUrl(airdropSignature)))

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

  async getConfirmedTransaction(transactionSig: string) {
    return this._connection.getConfirmedTransaction(transactionSig)
  }

  async logConfirmedTransaction(transactionSig: string) {
    const transactionInfo = await this.getConfirmedTransaction(transactionSig)
    if (transactionInfo == null) {
      logDebug(`ConfirmedTransaction { NOT FOUND, : ${transactionSig} }`)
    } else {
      logConfirmedTransaction(transactionSig, transactionInfo)
    }
  }

  // -----------------
  // Token
  // -----------------
  async getTokenBalance(pubkey: PublicKey) {
    try {
      const balance = await this._connection.getTokenAccountBalance(pubkey)
      return parseInt(balance.value.amount)
    } catch (err) {
      logError('Finding %s\n%s', pubkey.toBase58(), err)
      return '<NOT FOUND>'
    }
  }

  // -----------------
  // Account
  // -----------------
  getAccountInfo(publicKey: PublicKey, commitment?: Commitment) {
    return this._connection.getAccountInfo(publicKey, commitment)
  }
  async logBalance(account: PublicKey) {
    const balance = await this._connection.getBalance(account)
    logDebug(`Balance ${account.toBase58()}: ${prettyLamports(balance)}`)
  }

  async getBalance(account: PublicKey) {
    return this._connection.getBalance(account)
  }

  async getBalanceSol(account: PublicKey) {
    const lamports = await this.getBalance(account)
    const sol100 = lamports / (LAMPORTS_PER_SOL / 100)

    return Math.round(sol100) / 100
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

  getMinimumBalanceForRentExemption(
    dataLength: number,
    commitment?: Commitment
  ) {
    return this._connection.getMinimumBalanceForRentExemption(
      dataLength,
      commitment
    )
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
  // Account Logging
  // -----------------
  async logLabeledAccountInfos(logExplorerUrl = true) {
    for (const address of this._pubKeyLabels.keys()) {
      const pubKey = new PublicKey(address)
      await this.logAccountInfo(pubKey, logExplorerUrl)
    }
  }
  async logAccountInfo(account: PublicKey, logExplorerUrl = false) {
    const accountInfo = await this._connection.getAccountInfo(account)
    if (accountInfo == null) {
      logDebug(`AccountInfo { NOT FOUND, key: ${account.toBase58()} }`)
    } else {
      logDebug(
        prettyAccountInfo(
          accountInfo,
          this._renderLabel(account),
          this._renderLabel.bind(this)
        )
      )
      if (logExplorerUrl) {
        return this.logAccountExplorerUrl(account)
      }
    }
  }

  async logAccountExplorerUrl(account: PublicKey) {
    const url = Conn.solanaExplorerAddressUrl(account)
    logExpl('%s: %s', this._renderLabel(account), gray(url))
  }

  // -----------------
  // Cluster
  // -----------------
<<<<<<< HEAD:sol-common/js/src/conn.ts
<<<<<<< HEAD:sol-common/js/src/conn.ts
=======
>>>>>>> e0a358e (js: adding success + failure tests):transfer-lamports/js/src/conn.ts
  static solanaClusterUrl() {
    // TODO: detect devnet as well
    return LOCAL_CLUSTER_URL
  }
<<<<<<< HEAD:sol-common/js/src/conn.ts
=======
>>>>>>> cd90b3f (js: added transaction logging):transfer-lamports/js/src/conn.ts
=======
>>>>>>> e0a358e (js: adding success + failure tests):transfer-lamports/js/src/conn.ts
  static solanaCluster() {
    // TODO: detect devnet as well
    return LOCAL_CLUSTER
  }
  solanaExplorerTxUrl(key: string) {
    return `${EXPLORER_TX}/${key}?${Conn.solanaCluster()}`
  }
  static solanaExplorerAddressUrl(pubkey: PublicKey) {
    return `${EXPLORER_ADDRESS}/${pubkey.toBase58()}?${Conn.solanaCluster()}`
  }

<<<<<<< HEAD
  static toSolanaCluster() {
<<<<<<< HEAD:sol-common/js/src/conn.ts
<<<<<<< HEAD:sol-common/js/src/conn.ts
    return new Conn(new Connection(Conn.solanaClusterUrl(), 'confirmed'))
=======
    return new Conn(new Connection(Conn.solanaCluster(), 'confirmed'))
>>>>>>> cd90b3f (js: added transaction logging):transfer-lamports/js/src/conn.ts
=======
    return new Conn(new Connection(Conn.solanaClusterUrl(), 'confirmed'))
>>>>>>> e0a358e (js: adding success + failure tests):transfer-lamports/js/src/conn.ts
=======
  static solanaExplorerAddressUrlFromBase58(base58: string) {
    return `${EXPLORER_ADDRESS}/${base58}?${Conn.solanaCluster()}`
  }

  static toSolanaCluster(pubKeyLabels?: Map<string, string>) {
    return new Conn(
      new Connection(Conn.solanaClusterUrl(), 'confirmed'),
      pubKeyLabels
    )
>>>>>>> d7ed47c (common: added features)
  }
}
