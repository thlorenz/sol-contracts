import { Token, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { Connection, PublicKey, Signer } from '@solana/web3.js'
import { Conn } from './conn'
import { getKeypair, getPublicKey, logInfo, writePublicKey } from './util'

// -----------------
// Minting
// -----------------
function createMint(conn: Conn, { publicKey, secretKey }: Signer) {
  /**
   *  static createMint(
   *    connection: Connection,
   *    payer: Signer,
   *    mintAuthority: PublicKey,
   *    freezeAuthority: PublicKey | null,
   *    decimals: number,
   *    programId: PublicKey,
   *  ): Promise<Token>;
   */
  return Token.createMint(
    conn.connection,
    { publicKey, secretKey },
    publicKey,
    null,
    0,
    TOKEN_PROGRAM_ID
  )
}

async function setupMint(
  conn: Conn,
  name: string,
  alicePubkey: PublicKey,
  bobPubkey: PublicKey,
  clientKeypair: Signer
) {
  logInfo(`Setting up Mint ${name}...`)
  const mint = await createMint(conn, clientKeypair)
  writePublicKey(mint.publicKey, `mint_${name.toLowerCase()}`)

  logInfo('Creating Alice %s Token Account', name)
  const aliceTokenAccountPubkey = await mint.createAccount(alicePubkey)
  writePublicKey(aliceTokenAccountPubkey, `alice_${name.toLowerCase()}`)

  logInfo('Creating Bob %s Token Account', name)
  const bobTokenAccountPubkey = await mint.createAccount(bobPubkey)
  writePublicKey(bobTokenAccountPubkey, `bob_${name.toLowerCase()}`)

  return { mint, aliceTokenAccountPubkey, bobTokenAccountPubkey }
}

// -----------------
// Main setup function
// -----------------
export async function setup(conn: Conn) {
  const alicePubkey = getPublicKey('alice')
  const bobPubkey = getPublicKey('bob')
  const clientKeypair = getKeypair('id')

  conn
    .addLabel(alicePubkey, 'Alice')
    .addLabel(bobPubkey, 'Bob')
    .addLabel(clientKeypair.publicKey, 'Client')

  // -----------------
  // Init Alice, Bob and Client Account and drop them some Sols
  // -----------------
  await conn.airdropSol(alicePubkey, 10)
  await conn.airdropSol(bobPubkey, 10)
  await conn.airdropSol(clientKeypair.publicKey, 10)

  // -----------------
  // Create Mint X and mint to Alice
  // -----------------
  const {
    mint: mintX,
    aliceTokenAccountPubkey: aliceTokenAccountPubkeyForX,
    bobTokenAccountPubkey: bobTokenAccountPubkeyForX,
  } = await setupMint(conn, 'X', alicePubkey, bobPubkey, clientKeypair)

  conn
    .addLabel(mintX.publicKey, 'Mint X')
    .addLabel(aliceTokenAccountPubkeyForX, 'Alice X')
    .addLabel(bobTokenAccountPubkeyForX, 'Bob X')

  /**
   * mintTo(
   *   dest: PublicKey, authority: Signer | PublicKey, multiSigners: Array<Signer>, amount: number | u64,
   * ): Promise<void>;
   */
  await mintX.mintTo(
    aliceTokenAccountPubkeyForX,
    clientKeypair.publicKey,
    [],
    50
  )

  // -----------------
  // Create Mint Y and mint to Bob
  // -----------------
  const {
    mint: mintY,
    aliceTokenAccountPubkey: aliceTokenAccountPubkeyForY,
    bobTokenAccountPubkey: bobTokenAccountPubkeyForY,
  } = await setupMint(conn, 'Y', alicePubkey, bobPubkey, clientKeypair)

  conn
    .addLabel(mintY.publicKey, 'Mint Y')
    .addLabel(aliceTokenAccountPubkeyForY, 'Alice Y')
    .addLabel(bobTokenAccountPubkeyForY, 'Bob Y')

  await mintY.mintTo(bobTokenAccountPubkeyForY, clientKeypair.publicKey, [], 50)
}
