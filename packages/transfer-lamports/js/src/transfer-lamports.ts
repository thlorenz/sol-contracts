import {
  AccountMeta,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js'
import { Conn } from '@packages/sol-common/src/conn'

export async function transferLamports(
  conn: Conn,
  programId: PublicKey,
  payer: Keypair,
  receiver: PublicKey,
  lamports: number
) {
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

  const data = Buffer.alloc(8)
  data.writeBigUInt64LE(BigInt(lamports))
  const programIx = new TransactionInstruction({
    keys: programAccs,
    programId,
    data,
  })

  // 5. Init the transaction
  const transaction = new Transaction({ feePayer: payer.publicKey })
    .add(transferIx)
    .add(assignIx)
    .add(programIx)

  return conn.sendAndConfirmTransaction(transaction, [payer, tmpAccount])
}
