import { Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { Conn, getProgramKeypair } from './sol-common'

import { transferLamports } from './transfer-lamports'

import test from 'tape'
import path from 'path'

let conn: Conn
let program: Keypair
async function runTest(payerSol: number, transferSol: number) {
  program =
    program ??
    getProgramKeypair(path.join(__dirname, '..'), 'transfer_lamports')

  conn = conn ?? Conn.toSolanaCluster()

  const payer = Keypair.generate()
  const receiver = Keypair.generate()

  await conn.initAccount(payer.publicKey, {
    lamports: payerSol * LAMPORTS_PER_SOL,
  })

  await conn.initAccount(receiver.publicKey)

  const lamports = transferSol * LAMPORTS_PER_SOL
  const signature = await transferLamports(
    conn,
    program.publicKey,
    payer,
    receiver.publicKey,
    lamports
  )
  return {
    conn,
    payer: payer.publicKey,
    receiver: receiver.publicKey,
    lamports,
    signature,
  }
}

test('transfer: payer has sufficient funds success', async (t) => {
  const payerSol = 3
  const transferSol = 2
  const expectedPayerSol = 1
  const expectedReceiverSol = 2
  const { conn, payer, receiver } = await runTest(payerSol, transferSol)

  const payerAfterSol = await conn.getBalanceSol(payer)
  const receiverAfterSol = await conn.getBalanceSol(receiver)

  t.equal(payerAfterSol, expectedPayerSol, 'payer is deducted correct amount')
  t.equal(
    receiverAfterSol,
    expectedReceiverSol,
    'receiver is debited correct amount'
  )
  t.end()
})

test('transfer: payer has insufficient funds failure', async (t) => {
  const payerSol = 3
  const transferSol = 4
  try {
    await runTest(payerSol, transferSol)
    t.fail('transaction should have failed')
  } catch (err: any) {
    t.match(
      err.toString(),
      /Transaction simulation failed/i,
      'fails due to insufficient funds'
    )
  } finally {
    t.end()
  }
})
