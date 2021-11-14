import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
} from '@solana/web3.js'
import {
  getProgramKeypair,
  logExpl,
  logInfo,
  logSeparator,
} from '@packages/sol-common/src/utils'
import { Conn } from '@packages/sol-common/src/conn'

import path from 'path'
import { transferLamports } from './transfer-lamports'

const arg = process.argv[2]
const SOLS = arg != null ? parseInt(arg) : 5

async function logParties(conn: Conn, payer: PublicKey, receiver: PublicKey) {
  logInfo(`Payer: ${payer.toBase58()}`)
  await conn.logAccountInfo(payer)

  logInfo(`Receiver: ${receiver.toBase58()}`)
  await conn.logAccountInfo(receiver)
}

async function main() {
  const program = getProgramKeypair(
    path.join(__dirname, '..'),
    'transfer_lamports'
  )
  const payer = Keypair.generate()
  const receiver = Keypair.generate()

  const conn = new Conn(new Connection('http://127.0.0.1:8899', 'confirmed'))
  logInfo(`Program: ${program.publicKey.toBase58()}`)
  logExpl(Conn.solanaExplorerAddressUrl(program.publicKey))
  await conn.logAccountInfo(program.publicKey)
  logSeparator()

  logInfo(`Payer: ${payer.publicKey.toBase58()}`)
  logExpl(Conn.solanaExplorerAddressUrl(payer.publicKey))
  logSeparator()

  logInfo(`Receiver: ${receiver.publicKey.toBase58()}`)
  logExpl(Conn.solanaExplorerAddressUrl(receiver.publicKey))

  logInfo('Initializing payer')
  await conn.initAccount(payer.publicKey, {
    lamports: (SOLS + 1) * LAMPORTS_PER_SOL,
  })
  logSeparator()

  logInfo('Initializing receiver')
  await conn.initAccount(receiver.publicKey)
  logSeparator()

  await logParties(conn, payer.publicKey, receiver.publicKey)
  logSeparator()

  const txSig = await transferLamports(
    conn,
    program.publicKey,
    payer,
    receiver.publicKey,
    SOLS * LAMPORTS_PER_SOL
  )
  logSeparator()

  await conn.logConfirmedTransaction(txSig)
  logSeparator()

  await logParties(conn, payer.publicKey, receiver.publicKey)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
