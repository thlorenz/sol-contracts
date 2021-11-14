import fs from 'fs'
import path from 'path'
import { alice } from './alice'
import { bob } from './bob'
import { Conn } from './conn'
import { setup } from './setup'
import {
  labelKnownAccounts,
  logInfo,
  logTokenAmounts,
  sleep,
  writePublicKey,
} from './util'
import { verifyExchangedEscrow, verifyInitializedEscrow } from './verify'

const runSetup = !!process.env.SETUP
const runAlice = !!process.env.ALICE
const runBob = !!process.env.BOB

const ADDRESS_LABELS_PATH = path.resolve(
  __dirname,
  '../../../../../solana-labs/solana/explorer/src/data/address-labels.json'
)

async function main() {
  const conn = Conn.toSolanaCluster()
  labelKnownAccounts(conn)

  let extraKeys = {}
  let extraTokens = {}

  try {
    if (runSetup) {
      logInfo('Setting up Accounts and Tokens')
      await setup(conn)
      labelKnownAccounts(conn, extraKeys)
    }

    if (runAlice) {
      logInfo('Initializing Escrow')
      const { tmpXTokenAccountPubkey, escrowAccountPubkey } = await alice(conn)
      await sleep(1000)

      extraTokens = {
        'Tmp X': tmpXTokenAccountPubkey,
      }

      extraKeys = {
        'Tmp X': tmpXTokenAccountPubkey,
        Escrow: escrowAccountPubkey,
      }

      labelKnownAccounts(conn, extraKeys)

      await sleep(1000)
      await verifyInitializedEscrow(
        conn,
        escrowAccountPubkey,
        tmpXTokenAccountPubkey
      )

      writePublicKey(escrowAccountPubkey, 'escrow')
    }

    if (runBob) {
      logInfo('Exchanging Escrow')
      const {
        tmpXTokenAccountPubkey,
        escrowAccountPubkey,
        aliceYStartBalance,
        bobXStartBalance,
        pdaPubkey,
      } = await bob(conn)

      extraTokens = {}
      extraKeys = {
        PDA: pdaPubkey,
        Escrow: escrowAccountPubkey,
      }

      labelKnownAccounts(conn, extraKeys)

      await sleep(1000)

      await verifyExchangedEscrow(
        conn,
        escrowAccountPubkey,
        tmpXTokenAccountPubkey,
        aliceYStartBalance,
        bobXStartBalance
      )
    }
  } finally {
    await sleep(1000)

    // Write account addresses to locally running solana explorer
    fs.writeFileSync(ADDRESS_LABELS_PATH, conn.jsonLabels(), 'utf8')

    // await conn.logLabeledAccountInfos(true)

    conn.logLabels()

    await logTokenAmounts(conn, extraTokens)
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
