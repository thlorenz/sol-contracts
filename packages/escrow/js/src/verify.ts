import { PublicKey } from '@solana/web3.js'
import { Conn } from './conn'
import { strict as assert } from 'assert'
import {
  EscrowLayout,
  ESCROW_ACCOUNT_DATA_LAYOUT,
  getKeypair,
  getPublicKey,
  getTerms,
  logDebug,
  logInfo,
} from './util'
import { logTrace } from '../../../sol-common/js/src/utils'

function resolveEscrowState(conn: Conn, escrowState: EscrowLayout) {
  const {
    isInitialized,
    initializerPubkey,
    initializerReceivingTokenAccountPubkey,
    initializerTempTokenAccountPubkey,
    expectedAmount,
  } = escrowState

  return {
    isInitialized: !!isInitialized,
    initializerPubkey: conn.label(initializerPubkey),
    initializerReceivingTokenAccountPubkey: conn.label(
      initializerReceivingTokenAccountPubkey
    ),
    initializerTempTokenAccountPubkey: conn.label(
      initializerTempTokenAccountPubkey
    ),
    expectedAmount: Buffer.from(expectedAmount).readUInt8(),
  }
}

export async function verifyInitializedEscrow(
  conn: Conn,
  escrowPubkey: PublicKey,
  tmpXTokenAccountPubkey: PublicKey
) {
  const aliceKeypair = getKeypair('alice')
  const aliceYTokenPubkey = getPublicKey('alice_y')

  const escrowAccountInfo = await conn.getAccountInfo(escrowPubkey)

  assert(escrowAccountInfo != null, 'Escrow account info not found')
  assert(
    escrowAccountInfo.data.length > 0,
    'Escrow account data should not be empty'
  )
  logInfo('Verifying Escrow Account State')

  const escrowState = ESCROW_ACCOUNT_DATA_LAYOUT.decode(
    escrowAccountInfo.data
  ) as EscrowLayout
  logTrace(escrowState)
  logDebug(resolveEscrowState(conn, escrowState))

  assert(!!escrowState.isInitialized, 'Escrow should be initialized')

  // Verify Alice Initializer
  const initializerPubkey = new PublicKey(escrowState.initializerPubkey)
  assert(
    initializerPubkey.equals(aliceKeypair.publicKey),
    'Alice should be initializer'
  )

  // Verify Alice Y Token Receiver
  const initializerReceivingTokenAccountPubkey = new PublicKey(
    escrowState.initializerReceivingTokenAccountPubkey
  )
  assert(
    initializerReceivingTokenAccountPubkey.equals(aliceYTokenPubkey),
    'Receiving account should be Alice Y Token Account'
  )

  const initializerTmpTokenAccountPubkey = new PublicKey(
    escrowState.initializerTempTokenAccountPubkey
  )
  assert(
    initializerTmpTokenAccountPubkey.equals(tmpXTokenAccountPubkey),
    'Inititializer account should be Tmp X Token Account'
  )
}

export async function verifyExchangedEscrow(
  conn: Conn,
  escrowPubkey: PublicKey,
  tmpXTokenAccountPubkey: PublicKey,
  aliceYStartBalance: number,
  bobXStartBalance: number
) {
  const terms = getTerms()

  // Verify escrow account closed
  const escrowAccountInfo = await conn.getAccountInfo(escrowPubkey)
  assert(escrowAccountInfo == null, 'Escrow account should have been closed')

  // Verify tmp token X account closed
  const tmpXTokenAccountInfo = await conn.getAccountInfo(tmpXTokenAccountPubkey)
  assert(
    tmpXTokenAccountInfo == null,
    'Tmp X token account should have been closed'
  )

  // Verify Alice received expected Y tokens
  const aliceYTokenPubkey = getPublicKey('alice_y')
  const aliceYBalance = await conn.getTokenBalance(aliceYTokenPubkey)
  assert(typeof aliceYBalance === 'number', 'Should find Alice Y token balance')
  assert.equal(
    aliceYBalance,
    aliceYStartBalance + terms.aliceExpectedAmount,
    'Alice should have been credited correct Y token amount'
  )

  // Verify Bob received expected X tokens
  const bobXTokenPubkey = getPublicKey('bob_x')
  const bobXBalance = await conn.getTokenBalance(bobXTokenPubkey)
  assert(typeof bobXBalance === 'number', 'Should find Bob X token balance')
  assert.equal(
    bobXBalance,
    bobXStartBalance + terms.bobExpectedAmount,
    'Bob should have been credited correct X token amount'
  )
}
