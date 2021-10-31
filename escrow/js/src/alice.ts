import { AccountLayout, Token, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import {
  Keypair,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js'
import BN from 'bn.js'
import { Conn } from './conn'
import {
  ESCROW_ACCOUNT_DATA_LAYOUT,
  getKeypair,
  getProgramId,
  getPublicKey,
  getTerms,
  sleep,
  accountMeta,
} from './util'

export async function alice(conn: Conn) {
  let space: number

  const escrowProgramId = getProgramId()
  const { aliceExpectedAmount, bobExpectedAmount } = getTerms()

  const aliceTokenAccountPubkeyForX = getPublicKey('alice_x')
  const aliceTokenAccountPubkeyForY = getPublicKey('alice_y')
  const XTokenMintPubkey = getPublicKey('mint_x')
  const aliceKeypair = getKeypair('alice')

  // -----------------
  // Setup Tmp Account to hold Alice's X Token
  // -----------------
  const tmpXTokenAccountKeypair = new Keypair()
  conn.addLabel(tmpXTokenAccountKeypair.publicKey, 'Tmp X')

  // Create Tmp X
  space = AccountLayout.span
  const createTmpTokenAccountIx = SystemProgram.createAccount({
    programId: TOKEN_PROGRAM_ID,
    space,
    lamports: await conn.getMinimumBalanceForRentExemption(space),
    fromPubkey: aliceKeypair.publicKey,
    newAccountPubkey: tmpXTokenAccountKeypair.publicKey,
  })

  // Init Tmp X
  const initTmpAccountIx = Token.createInitAccountInstruction(
    TOKEN_PROGRAM_ID,
    XTokenMintPubkey,
    tmpXTokenAccountKeypair.publicKey,
    aliceKeypair.publicKey
  )

  // Alice sends tokens to Tmp X
  const transferXTokensToTmpAccIx = Token.createTransferInstruction(
    TOKEN_PROGRAM_ID,
    aliceTokenAccountPubkeyForX,
    tmpXTokenAccountKeypair.publicKey,
    aliceKeypair.publicKey,
    [],
    bobExpectedAmount
  )

  // -----------------
  // Create Escrow
  // -----------------
  const escrowKeypair = new Keypair()
  space = ESCROW_ACCOUNT_DATA_LAYOUT.span
  const createEscrowAccountIx = SystemProgram.createAccount({
    space,
    lamports: await conn.getMinimumBalanceForRentExemption(space),
    fromPubkey: aliceKeypair.publicKey,
    newAccountPubkey: escrowKeypair.publicKey,
    programId: escrowProgramId,
  })
  // -----------------
  // Init Escrow
  // -----------------
  const packedAmount = Uint8Array.of(
    0,
    ...new BN(aliceExpectedAmount).toArray('le', 8)
  )

  const initEscrowIx = new TransactionInstruction({
    programId: escrowProgramId,
    keys: [
      accountMeta(aliceKeypair.publicKey, true, true),
      accountMeta(tmpXTokenAccountKeypair.publicKey, true),
      accountMeta(aliceTokenAccountPubkeyForY),
      accountMeta(escrowKeypair.publicKey, true),
      accountMeta(TOKEN_PROGRAM_ID),
    ],
    data: Buffer.from(packedAmount),
  })

  // -----------------
  // Send Transaction
  // -----------------
  const tx = new Transaction().add(
    createTmpTokenAccountIx,
    initTmpAccountIx,
    transferXTokensToTmpAccIx,
    createEscrowAccountIx,
    initEscrowIx
  )
  await conn.connection.sendTransaction(
    tx,
    [aliceKeypair, tmpXTokenAccountKeypair, escrowKeypair],
    { skipPreflight: false, preflightCommitment: 'confirmed' }
  )

  return {
    tmpXTokenAccountPubkey: tmpXTokenAccountKeypair.publicKey,
    escrowAccountPubkey: escrowKeypair.publicKey,
  }
}
