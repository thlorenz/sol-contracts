import fs from 'fs'
import { alice } from './alice'
import { Conn } from './conn'
import { setup } from './setup'
import {
  getPublicKey,
  labelKnownAccounts,
  logInfo,
  logTokenAmounts,
  publicKey,
  sleep,
} from './util'

const runSetup = !!process.env.SETUP
const runAlice = !!process.env.ALICE

const ADDRESS_LABELS_PATH = require.resolve(
  '../../../../../solana-labs/solana/explorer/src/data/address-labels.json'
)

async function main() {
  const conn = Conn.toSolanaCluster()

  try {
    if (runSetup) {
      logInfo('Setting up Accounts and Tokens')
      await setup(conn)
      await logTokenAmounts(conn)
    }

    if (runAlice) {
      logInfo('Initializing Escrow')
      const tmpXTokenAccountPubkey = await alice(conn)
      await sleep(1000)
      await logTokenAmounts(conn, { 'Tmp X': tmpXTokenAccountPubkey })
    }
  } finally {
    await sleep(1000)
    labelKnownAccounts(conn)

    // Write account addresses to locally running solana explorer
    fs.writeFileSync(ADDRESS_LABELS_PATH, conn.jsonLabels(), 'utf8')

    await conn.logLabeledAccountInfos(true)

    conn.logLabels()

    await logTokenAmounts(conn)
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
