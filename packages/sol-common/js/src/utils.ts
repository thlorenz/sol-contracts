import * as web from '@solana/web3.js'
import { inspect } from 'util'

import * as BufferLayout from 'buffer-layout'
export * as BufferLayout from 'buffer-layout'

import debug from 'debug'
export const logError = debug('sol:error')
export const logInfo = debug('sol:info ')
export const logDebug = debug('sol:debug')
export const logTrace = debug('sol:trace')
export const logExpl = debug('sol:url  ')

type ConfirmedTransactionMetaWithStatus = web.ConfirmedTransactionMeta & {
  status?: Record<string, any>
}

const englishFormatter = new Intl.NumberFormat('en-US')
const solFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'SOL',
})

export function getProgramKeypair(jsrooot: string, program_name: string) {
  const privKey = require(`${jsrooot}/../program/target/deploy/${program_name}-keypair.json`)
  return web.Keypair.fromSecretKey(Uint8Array.from(privKey))
}

// -----------------
// Pretty Printers
// -----------------
export function prettyLamports(lamports: number) {
  const lamportsStr = englishFormatter.format(Math.round(lamports))
  const solsStr = solFormatter.format(lamports / web.LAMPORTS_PER_SOL)
  return `${lamportsStr} (${solsStr})`
}

export function prettyAccountInfo<T>(
  info: web.AccountInfo<T>,
  accountLabel: string,
  getLabel: (k: web.PublicKey) => string = (k) => k.toBase58()
) {
  const { executable, owner, lamports, data, rentEpoch } = info

  const dataStr =
    data == null
      ? '<None>'
      : Buffer.isBuffer(data)
      ? data.toString('hex')
      : data
  return `${accountLabel}: AccountInfo {
  executable : ${executable}
  owner      : ${getLabel(owner)}
  lamports   : ${prettyLamports(lamports)}
  data       : ${dataStr}
  rentEpoch  : ${rentEpoch}
}`
}

export function prettyInstruction(info: web.TransactionInstruction) {
  const { keys, programId } = info
  const prettyKeys = keys.map(({ pubkey, isSigner, isWritable }) => {
    const signer = isSigner ? 's' : ' '
    const writable = isWritable ? 'w' : ' '
    return `[${signer}${writable}] ${pubkey.toBase58()}`
  })
  return {
    programId: programId.toBase58(),
    keys: prettyKeys,
  }
}

export function prettyTransaction(info: web.Transaction) {
  const { instructions, feePayer, recentBlockhash, signatures } = info
  return {
    feePayer: feePayer?.toBase58() ?? '<NULL>',
    signatures: signatures.map((x) => x.publicKey.toBase58()),
    instructions: instructions.map(prettyInstruction),
    recentBlockhash,
  }
}

export function prettyConfirmedTransaction(info: web.ConfirmedTransaction) {
  const { fee, logMessages, status } = <ConfirmedTransactionMetaWithStatus>(
    (info.meta ?? {
      fee: 0,
      logMessages: null,
      status: { NO: 'meta' },
    })
  )
  const meta = {
    fee: prettyLamports(fee),
    logMessages,
    status: Object.keys(status ?? {}),
  }
  const transaction = prettyTransaction(info.transaction)
  return { meta, transaction }
}
export function logConfirmedTransaction(
  signature: string,
  info: web.ConfirmedTransaction
) {
  logDebug('ConfirmedTransaction: %s', signature)
  logDebug(
    inspect(prettyConfirmedTransaction(info), { colors: true, depth: 5 })
  )
}

export function logSeparator() {
  logDebug(
    '-------------------------------------------------------------------------'
  )
}

export const LOCAL_CLUSTER_URL = 'http://127.0.0.1:8899'

// -----------------
// Layouts
// -----------------

export const publicKey = (property = 'publicKey') => {
  return BufferLayout.blob(32, property)
}

export const uint64 = (property = 'uint64') => {
  return BufferLayout.blob(8, property)
}

// -----------------
// Account Meta
// -----------------
export function accountMeta(
  pubkey: web.PublicKey,
  isWritable = false,
  isSigner = false
): web.AccountMeta {
  return { pubkey, isWritable, isSigner }
}

// -----------------
// Solana Explorer
// -----------------
// const LIVE_EXPLORER_ROOT = 'https://explorer.solana.com'
const LOCAL_EXPLORER_ROOT = 'http://localhost:3000'
export const EXPLORER_ROOT = LOCAL_EXPLORER_ROOT
export const EXPLORER_TX = `${EXPLORER_ROOT}/tx`
export const EXPLORER_ADDRESS = `${EXPLORER_ROOT}/address`
export const LOCAL_CLUSTER = `cluster=custom&customUrl=${LOCAL_CLUSTER_URL}`

// -----------------
// Convenience functions
// -----------------
export async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}
