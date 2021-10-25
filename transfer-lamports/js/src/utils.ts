import * as web from '@solana/web3.js'
import { inspect } from 'util'

import debug from 'debug'
export const logInfo = debug('tx:info ')
export const logDebug = debug('tx:debug')
export const logTrace = debug('tx:trace')
export const logExpl = debug('tx:url  ')

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

export function prettyAccountInfo<T>(info: web.AccountInfo<T>) {
  const { executable, owner, lamports, data, rentEpoch } = info

  const dataStr =
    data == null
      ? '<None>'
      : Buffer.isBuffer(data)
      ? data.toString('hex')
      : data
  return `AccountInfo {
  executable : ${executable}
  owner      : ${owner}
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

// -----------------
// Solana Explorer
// -----------------
export const EXPLORER_ROOT = 'https://explorer.solana.com'
export const EXPLORER_TX = `${EXPLORER_ROOT}/tx`
export const EXPLORER_ADDRESS = `${EXPLORER_ROOT}/address`
export const LOCAL_CLUSTER = `cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A8899`
