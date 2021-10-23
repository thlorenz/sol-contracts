use transfer_lamports::processor::process_instruction;

use {
    solana_program::{instruction::Instruction, pubkey::Pubkey},
    solana_program_test::*,
    solana_sdk::{signature::Signer, transaction::Transaction},
    std::str::FromStr,
};

#[tokio::test]
async fn test_lamport_transfer() {
    let program_id = Pubkey::from_str("TransferLamports111111111111111111111111111").unwrap();

    let program_test = ProgramTest::new(
        "transfer_lamports",
        program_id,
        processor!(process_instruction),
    );

    let mut ctx = program_test.start_with_context().await;
    let instruction = Instruction::new_with_bincode(program_id, &(), vec![]);
    let mut transaction = Transaction::new_with_payer(&[instruction], Some(&ctx.payer.pubkey()));

    transaction.sign(&[&ctx.payer], ctx.last_blockhash);
    ctx.banks_client
        .process_transaction(transaction)
        .await
        .unwrap()
}
