import * as web from '@solana/web3.js'

import debug from 'debug'
export const logInfo = debug('tx:info ')
export const logDebug = debug('tx:debug')
export const logTrace = debug('tx:trace')
export const logExpl = debug('tx:url  ')

const englishFormatter = new Intl.NumberFormat('en-US')
const solFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'SOL',
})

export function getProgramKeypair(jsrooot: string, program_name: string) {
  const privKey = require(`${jsrooot}/../program/target/deploy/${program_name}-keypair.json`)
  return web.Keypair.fromSecretKey(Uint8Array.from(privKey))
}

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
