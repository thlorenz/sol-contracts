import { Conn } from './conn'
import {
  accountMeta,
  EscrowInstruction,
  EscrowLayout,
  ESCROW_ACCOUNT_DATA_LAYOUT,
  getKeypair,
  getProgramId,
  getPublicKey,
  getTerms,
  logInfo,
} from './util'
import { strict as assert } from 'assert'
import { PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js'
import BN from 'bn.js'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'

export async function bob(conn: Conn) {
  const bobKeypair = getKeypair('bob')
  const bobTokenAccountPubkeyForX = getPublicKey('bob_x')
  const bobTokenAccountPubkeyForY = getPublicKey('bob_y')
  const aliceTokenAccountPubkeyForY = getPublicKey('alice_y')
  const escrowAccountPubkey = getPublicKey('escrow')
  const escrowProgramId = getProgramId()
  const terms = getTerms()

  // -----------------
  // Decode Escrow State
  // -----------------
  const escrowAccount = await conn.getAccountInfo(escrowAccountPubkey)
  assert(escrowAccount != null, 'Should find escrow at stored address')

  const encodedEscrow = escrowAccount.data
  const {
    isInitialized,
    expectedAmount,
    initializerPubkey,
    initializerTempTokenAccountPubkey,
    initializerReceivingTokenAccountPubkey,
  } = ESCROW_ACCOUNT_DATA_LAYOUT.decode(encodedEscrow) as EscrowLayout

  const escrowState = {
    escrowAccountPubkey,
    isInitialized: !!isInitialized,
    initializerAccountPubkey: new PublicKey(initializerPubkey),
    tmpXTokenAccountPubkey: new PublicKey(initializerTempTokenAccountPubkey),
    initializerYTokenAccount: new PublicKey(
      initializerReceivingTokenAccountPubkey
    ),
    expectedAmount: new BN(expectedAmount, 10, 'le'),
  }

  // -----------------
  // Get Token Balances before Exchange Transaction
  // -----------------
  const [aliceYStartBalance, bobXStartBalance] = await Promise.all([
    conn.getTokenBalance(aliceTokenAccountPubkeyForY),
    conn.getTokenBalance(bobTokenAccountPubkeyForX),
  ])
  assert(
    typeof aliceYStartBalance === 'number',
    'Should find Alice Y token balance'
  )
  assert(
    typeof bobXStartBalance === 'number',
    'Should find Bob X token balance'
  )

  // -----------------
  // Exchange Transaction
  // -----------------
  const pda = await PublicKey.findProgramAddress(
    [Buffer.from('escrow')],
    escrowProgramId
  )

  const exchangeIx = new TransactionInstruction({
    programId: escrowProgramId,
    data: Buffer.from(
      Uint8Array.of(
        EscrowInstruction.Exchange,
        ...new BN(terms.bobExpectedAmount).toArray('le', 8)
      )
    ),

    keys: [
      // 0. `[signer]` The account of the person taking the trade (Bob)
      accountMeta(bobKeypair.publicKey, false, true),
      // 1. `[writable]` The taker's token account for the token they send (Bob Token Y)
      accountMeta(bobTokenAccountPubkeyForY, true),
      // 2. `[writable]` The taker's token account for the token they will receive should the trade
      //    go through (Bob Token X)
      accountMeta(bobTokenAccountPubkeyForX, true),
      // 3. `[writable]` The PDA's temp token account to get tokens from and eventually close
      accountMeta(escrowState.tmpXTokenAccountPubkey, true),
      // 4. `[writable]` The initializer's main account to send their rent fees to
      accountMeta(escrowState.initializerAccountPubkey, true),
      // 5. `[writable]` The initializer's token account that will receive tokens
      accountMeta(escrowState.initializerYTokenAccount, true),
      // 6. `[writable]` The escrow account holding the escrow info
      accountMeta(escrowAccountPubkey, true),
      // 7. `[]` The token program
      accountMeta(TOKEN_PROGRAM_ID),
      // 8. `[]` The PDA account
      accountMeta(pda[0]),
    ],
  })

  logInfo(`Sending Bob's transaction`)
  await conn.sendTransaction(new Transaction().add(exchangeIx), [bobKeypair], {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
  })

  return {
    tmpXTokenAccountPubkey: escrowState.tmpXTokenAccountPubkey,
    escrowAccountPubkey,
    aliceYStartBalance,
    bobXStartBalance,
    pdaPubkey: pda[0],
  }
}
