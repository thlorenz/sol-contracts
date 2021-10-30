import { AccountLayout, Token, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { Keypair, SystemProgram, Transaction } from '@solana/web3.js'
import { Conn } from './conn'
import { getKeypair, getProgramId, getPublicKey, getTerms, sleep } from './util'

export async function alice(conn: Conn) {
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
  const space = AccountLayout.span
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
  // Send Transaction
  // -----------------
  const tx = new Transaction().add(
    createTmpTokenAccountIx,
    initTmpAccountIx,
    transferXTokensToTmpAccIx
  )
  await conn.connection.sendTransaction(
    tx,
    [aliceKeypair, tmpXTokenAccountKeypair /* escrowKeypair */],
    { skipPreflight: false, preflightCommitment: 'confirmed' }
  )

  return tmpXTokenAccountKeypair.publicKey
}
