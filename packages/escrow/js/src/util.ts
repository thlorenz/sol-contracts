import { Keypair, PublicKey } from '@solana/web3.js'
import fs from 'fs'
import path from 'path'
import {
  BufferLayout,
  logError,
  publicKey,
  uint64,
} from '@packages/sol-common/src/utils'
import { Conn } from './conn'

export * from '@packages/sol-common/src/utils'

export const getPublicKey = (name: string) =>
  new PublicKey(
    // We don't require here in order to read fresh each time (require cache)
    JSON.parse(
      fs.readFileSync(require.resolve(`../keys/${name}_pub.json`), 'utf8')
    )
  )

export const getPrivateKey = (name: string) =>
  Uint8Array.from(require(`../keys/${name}.json`))

export const getKeypair = (name: string) =>
  new Keypair({
    publicKey: getPublicKey(name).toBytes(),
    secretKey: getPrivateKey(name),
  })

export const getProgramId = () => {
  try {
    return getPublicKey('program')
  } catch (e) {
    logError('Given programId is missing or incorrect')
    process.exit(1)
  }
}

export function getTerms(): {
  aliceExpectedAmount: number
  bobExpectedAmount: number
} {
  return require('../terms.json')
}

export const writePublicKey = (publicKey: PublicKey, name: string) => {
  fs.writeFileSync(
    path.resolve(__dirname, `../keys/${name}_pub.json`),
    JSON.stringify(publicKey.toString())
  )
}

export const ESCROW_ACCOUNT_DATA_LAYOUT = BufferLayout.struct([
  BufferLayout.u8('isInitialized'),
  publicKey('initializerPubkey'),
  publicKey('initializerTempTokenAccountPubkey'),
  publicKey('initializerReceivingTokenAccountPubkey'),
  uint64('expectedAmount'),
])

export type EscrowLayout = {
  isInitialized: number
  initializerPubkey: Uint8Array
  initializerReceivingTokenAccountPubkey: Uint8Array
  initializerTempTokenAccountPubkey: Uint8Array
  expectedAmount: Uint8Array
}

export enum EscrowInstruction {
  InitEscrow = 0,
  Exchange = 1,
}

export async function logTokenAmounts(
  conn: Conn,
  extraKeys: Record<string, PublicKey> = {}
) {
  const aliceTokenAccountPubkeyForX = getPublicKey('alice_x')
  const aliceTokenAccountPubkeyForY = getPublicKey('alice_Y')
  const bobTokenAccountPubkeyForX = getPublicKey('bob_x')
  const bobTokenAccountPubkeyForY = getPublicKey('bob_Y')
  const columns = {
    'Alice X': await conn.getTokenBalance(aliceTokenAccountPubkeyForX),
    'Alice Y': await conn.getTokenBalance(aliceTokenAccountPubkeyForY),
    'Bob X': await conn.getTokenBalance(bobTokenAccountPubkeyForX),
    'Bob Y': await conn.getTokenBalance(bobTokenAccountPubkeyForY),
  }

  for (const [label, pubkey] of Object.entries(extraKeys)) {
    columns[label] = await conn.getTokenBalance(pubkey)
  }
  console.table([columns])
}

export function labelKnownAccounts(
  conn: Conn,
  extraKeys: Record<string, PublicKey> = {}
) {
  // Alice
  const alice = getPublicKey('alice')
  const aliceX = getPublicKey('alice_x')
  const aliceY = getPublicKey('alice_Y')

  // Bob
  const bob = getPublicKey('bob')
  const bobX = getPublicKey('bob_x')
  const bobY = getPublicKey('bob_Y')

  // Client and Program
  const client = getPublicKey('id')
  const program = getPublicKey('program')

  // Mints
  const mintX = getPublicKey('mint_x')
  const mintY = getPublicKey('mint_y')

  conn
    .addLabel(alice, 'Alice')
    .addLabel(aliceX, 'Alice X')
    .addLabel(aliceY, 'Alice Y')
    .addLabel(bob, 'Bob')
    .addLabel(bobX, 'Bob X')
    .addLabel(bobY, 'Bob Y')
    .addLabel(client, 'Client')
    .addLabel(program, 'Program')
    .addLabel(mintX, 'Mint X')
    .addLabel(mintY, 'Mint Y')

  for (const [label, pubkey] of Object.entries(extraKeys)) {
    conn.addLabel(pubkey, label)
  }
}
