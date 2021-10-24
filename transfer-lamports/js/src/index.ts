import {
  getProgramKeypair,
  logDebug,
  logExpl,
  logInfo,
  logSeparator,
  prettyLamports,
} from './utils'

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
  payer: Keypair,
  receiver: PublicKey,
  _sols: number
) {
  const sols = 5
  const lamports = LAMPORTS_PER_SOL * sols

  // We don't want to give ownership of the entire payer account to our program.
  // Instead we create a tmp account, transfer the needed funds into it from the
  // payer account. Then we assign ownership of it to our program and execute
  // the instruction that will transfer all its funds to the receiver.

  // 1. Create tmp account
  const tmpAccount = Keypair.generate()
  await conn.initAccount(tmpAccount.publicKey, {
    lamports,
    rentExcempt: false,
  })
  // 2. Transfer the needed amount from the payer into that tmp account
  const transferIx = SystemProgram.transfer({
    lamports,
    fromPubkey: payer.publicKey,
    toPubkey: tmpAccount.publicKey,
  })

  // 3. Give ownership of that tmp account to the program
  const assignIx = SystemProgram.assign({
    programId,
    accountPubkey: tmpAccount.publicKey,
  })

  // 4. Instruct it to transfer the amount from the tmp account to the receiver
  const programAccs: AccountMeta[] = [
    { pubkey: tmpAccount.publicKey, isSigner: true, isWritable: true },
    { pubkey: receiver, isSigner: false, isWritable: true },
  ]

  const programIx = new TransactionInstruction({ keys: programAccs, programId })

  // 5. Init the transaction
  const transaction = new Transaction({ feePayer: payer.publicKey })
    .add(transferIx)
    .add(assignIx)
    .add(programIx)

  return conn.sendAndConfirmTransaction(transaction, [payer, tmpAccount])
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
  await conn.initAccount(payer.publicKey, { lamports: 50 * LAMPORTS_PER_SOL })
  logSeparator()

  logInfo('Initializing receiver')
  await conn.initAccount(receiver.publicKey)
  logSeparator()

  await logParties(conn, payer.publicKey, receiver.publicKey)
  logSeparator()

  await transferSolsWithCustomProgram(
    conn,
    program.publicKey,
    payer,
    receiver.publicKey,
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
