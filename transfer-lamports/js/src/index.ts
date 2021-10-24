import { getProgramKeypair, logExpl, logInfo, logSeparator } from './utils'

import {
  AccountMeta,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js'
import { Conn } from './conn'
import path from 'path'

async function logParties(conn: Conn, payer: PublicKey, receiver: PublicKey) {
  logInfo(`Payer: ${payer.toBase58()}`)
  await conn.logAccountInfo(payer)

  logInfo(`Receiver: ${receiver.toBase58()}`)
  await conn.logAccountInfo(receiver)
}

async function transferSolsWithSystemProgram(
  conn: Conn,
  feePayer: PublicKey,
  receiver: PublicKey,
  signer: Keypair,
  sols: number
) {
  const transaction = new Transaction()
  transaction.add(
    SystemProgram.transfer({
      fromPubkey: feePayer,
      toPubkey: receiver,
      lamports: LAMPORTS_PER_SOL * sols,
    })
  )
  logInfo('Sending lamports from payer to receiver')
  await conn.sendAndConfirmTransaction(transaction, [signer])

  await logParties(conn, feePayer, receiver)
}

async function transferSolsWithCustomProgram(
  conn: Conn,
  programId: PublicKey,
  feePayer: PublicKey,
  receiver: PublicKey,
  signer: Keypair,
  _sols: number
) {
  const accounts: AccountMeta[] = [
    { pubkey: feePayer, isSigner: true, isWritable: true },
    { pubkey: receiver, isSigner: false, isWritable: true },
  ]

  const assignIx = SystemProgram.assign({ programId, accountPubkey: feePayer })
  const transferIx = new TransactionInstruction({ keys: accounts, programId })

  const transaction = new Transaction({ feePayer })

  transaction.add(assignIx).add(transferIx)

  return conn.sendAndConfirmTransaction(transaction, [signer])
}

async function main() {
  const program = getProgramKeypair(path.join(__dirname, '..'))
  const payer = Keypair.generate()
  const receiver = Keypair.generate()

  const conn = new Conn(new Connection('http://127.0.0.1:8899', 'confirmed'))
  logInfo(`Program: ${program.publicKey.toBase58()}`)
  logExpl(conn.solanaExplorerAddressUrl(program.publicKey))
  await conn.logAccountInfo(program.publicKey)
  logSeparator()

  logInfo(`Payer: ${payer.publicKey.toBase58()}`)
  logExpl(conn.solanaExplorerAddressUrl(payer.publicKey))
  logSeparator()

  logInfo(`Receiver: ${receiver.publicKey.toBase58()}`)
  logExpl(conn.solanaExplorerAddressUrl(receiver.publicKey))

  logInfo('Initializing payer')
  await conn.initAccount(payer.publicKey, { lamports: 5 * LAMPORTS_PER_SOL })
  logSeparator()

  logInfo('Initializing receiver')
  await conn.initAccount(receiver.publicKey)
  logSeparator()

  await logParties(conn, payer.publicKey, receiver.publicKey)
  logSeparator()

  await transferSolsWithCustomProgram(
    conn,
    program.publicKey,
    payer.publicKey,
    receiver.publicKey,
    payer,
    5
  )
  logSeparator()

  await logParties(conn, payer.publicKey, receiver.publicKey)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
