use solana_program::instruction::{AccountMeta, InstructionError};
use solana_sdk::{account::Account, transaction::TransactionError};

use transfer_lamports::{instruction::TransferInstruction, processor::process_instruction};
use {
    solana_program::{instruction::Instruction, pubkey::Pubkey},
    solana_program_test::*,
    solana_sdk::{signature::Signer, transaction::Transaction},
    std::str::FromStr,
};

#[cfg(feature = "trace-compute")]
const COMPUTE_UNITS: u64 = 1400;
#[cfg(not(feature = "trace-compute"))]
const COMPUTE_UNITS: u64 = 1200;

// -----------------
// Utils
// -----------------
async fn start_program(
    program_id: Pubkey,
    source_pubkey: Pubkey,
    destination_pubkey: Pubkey,
    source_account: Account,
    destination_account: Account,
    amount: u64,
    compute_units: Option<u64>,
) -> (ProgramTestContext, Instruction) {
    let mut program_test = ProgramTest::new(
        "transfer_lamports",
        program_id,
        processor!(process_instruction),
    );

    program_test.add_account(source_pubkey, source_account);
    program_test.add_account(destination_pubkey, destination_account);

    program_test.set_bpf_compute_max_units(compute_units.unwrap_or(COMPUTE_UNITS));

    let ctx = program_test.start_with_context().await;
    let transfer_ix = &TransferInstruction { amount };
    let ix_data = &transfer_ix.pack();
    let instruction = Instruction::new_with_bytes(
        program_id,
        ix_data,
        vec![
            AccountMeta::new(source_pubkey, false),
            AccountMeta::new(destination_pubkey, false),
        ],
    );
    (ctx, instruction)
}

async fn account_balance(ctx: &mut ProgramTestContext, pubkey: Pubkey) -> u64 {
    ctx.banks_client.get_balance(pubkey).await.unwrap()
}

const FAILED_TO_COMPLETE: TransactionError =
    TransactionError::InstructionError(0, InstructionError::ProgramFailedToComplete);
const COMPUTATIONAL_BUDGET_EXCEEDED: TransactionError =
    TransactionError::InstructionError(0, InstructionError::ComputationalBudgetExceeded);
const INSUFFICIENT_FUNDS: TransactionError =
    TransactionError::InstructionError(0, InstructionError::InsufficientFunds);

async fn assert_tx_exceeds_compute_budget(mut ctx: ProgramTestContext, transaction: Transaction) {
    let err = ctx
        .banks_client
        .process_transaction(transaction)
        .await
        .unwrap_err()
        .unwrap();
    assert!(
        err == FAILED_TO_COMPLETE || err == COMPUTATIONAL_BUDGET_EXCEEDED,
        "exceeded computations"
    );
}

async fn assert_insufficient_funds(mut ctx: ProgramTestContext, transaction: Transaction) {
    let err = ctx
        .banks_client
        .process_transaction(transaction)
        .await
        .unwrap_err()
        .unwrap();
    assert!(err == INSUFFICIENT_FUNDS, "insufficient funds");
}

// -----------------
// Tests
// -----------------
#[tokio::test]
async fn lamport_tx_success() {
    let lamports = 9;
    let program_id = Pubkey::from_str("TransferLamports111111111111111111111111111").unwrap();
    let source_pubkey = Pubkey::new_unique();
    let destination_pubkey = Pubkey::new_unique();
    let source_account = Account {
        lamports,
        owner: program_id,
        ..Account::default()
    };
    let destination_account = Account {
        lamports: 5,
        ..Account::default()
    };

    let (mut ctx, instruction) = start_program(
        program_id,
        source_pubkey,
        destination_pubkey,
        source_account,
        destination_account,
        lamports,
        None,
    )
    .await;

    let mut transaction = Transaction::new_with_payer(&[instruction], Some(&ctx.payer.pubkey()));
    transaction.sign(&[&ctx.payer], ctx.last_blockhash);
    ctx.banks_client
        .process_transaction(transaction)
        .await
        .expect("TX succeeds");

    assert_eq!(
        account_balance(&mut ctx, source_pubkey).await,
        0,
        "source looses transferred lamports"
    );
    assert_eq!(
        account_balance(&mut ctx, destination_pubkey).await,
        5 + lamports,
        "destination gains transferred lamports"
    );
}

#[tokio::test]
async fn lamport_tx_not_enough_units() {
    let lamports = 9;
    let program_id = Pubkey::from_str("TransferLamports111111111111111111111111111").unwrap();
    let source_pubkey = Pubkey::new_unique();
    let destination_pubkey = Pubkey::new_unique();
    let source_account = Account {
        lamports,
        owner: program_id,
        ..Account::default()
    };
    let destination_account = Account {
        lamports: 5,
        ..Account::default()
    };

    let (ctx, instruction) = start_program(
        program_id,
        source_pubkey,
        destination_pubkey,
        source_account,
        destination_account,
        lamports,
        Some(500),
    )
    .await;

    let mut transaction = Transaction::new_with_payer(&[instruction], Some(&ctx.payer.pubkey()));
    transaction.sign(&[&ctx.payer], ctx.last_blockhash);

    assert_tx_exceeds_compute_budget(ctx, transaction).await;
}

#[tokio::test]
async fn lamport_tx_not_enough_source_lamports() {
    let lamports = 9;
    let program_id = Pubkey::from_str("TransferLamports111111111111111111111111111").unwrap();
    let source_pubkey = Pubkey::new_unique();
    let destination_pubkey = Pubkey::new_unique();
    let source_account = Account {
        lamports: lamports - 1,
        owner: program_id,
        ..Account::default()
    };
    let destination_account = Account {
        lamports: 5,
        ..Account::default()
    };

    let (ctx, instruction) = start_program(
        program_id,
        source_pubkey,
        destination_pubkey,
        source_account,
        destination_account,
        lamports,
        Some(COMPUTE_UNITS + 1000),
    )
    .await;

    let mut transaction = Transaction::new_with_payer(&[instruction], Some(&ctx.payer.pubkey()));
    transaction.sign(&[&ctx.payer], ctx.last_blockhash);
    assert_insufficient_funds(ctx, transaction).await;
}
