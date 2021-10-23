#![cfg(feature = "test-bpf")]

use solana_program::instruction::AccountMeta;
use solana_sdk::account::Account;
use transfer_lamports::processor::process_instruction;

use {
    solana_program::{instruction::Instruction, pubkey::Pubkey},
    solana_program_test::*,
    solana_sdk::{signature::Signer, transaction::Transaction},
    std::str::FromStr,
};

#[tokio::test]
async fn lamport_tx_not_enough_units() {
    let program_id = Pubkey::from_str("TransferLamports111111111111111111111111111").unwrap();
    let source_pubkey = Pubkey::new_unique();

    let mut program_test = ProgramTest::new(
        "transfer_lamports",
        program_id,
        processor!(process_instruction),
    );

    program_test.set_bpf_compute_max_units(10000);

    program_test.add_account(
        source_pubkey,
        Account {
            lamports: 5,
            owner: program_id, // Can only withdraw lamports from accounts owned by the program
            ..Account::default()
        },
    );

    let mut ctx = program_test.start_with_context().await;
    let instruction = Instruction::new_with_bincode(
        program_id,
        &(),
        vec![AccountMeta::new(source_pubkey, false)],
    );
    let mut transaction = Transaction::new_with_payer(&[instruction], Some(&ctx.payer.pubkey()));

    transaction.sign(&[&ctx.payer], ctx.last_blockhash);
    // TODO: don't unwrap, but assume an error here
    ctx.banks_client
        .process_transaction(transaction)
        .await
        .unwrap()
}
