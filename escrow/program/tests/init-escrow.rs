use escrow::{instruction::EscrowInstruction, processor::Processor};
use solana_program_test::{processor, tokio, ProgramTest, ProgramTestContext};

use solana_program::{
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
};
use solana_sdk::{account::Account, signer::Signer, transaction::Transaction};

// -----------------
// Utils
// -----------------
async fn start_program(
    // keys
    program_id: Pubkey,
    alice_pubkey: Pubkey,
    alice_x_pubkey: Pubkey,
    alice_y_pubkey: Pubkey,
    escrow_pubkey: Pubkey,
    // accounts
    alice_account: Account,
    alice_x_account: Account,
    alice_y_account: Account,
    escrow_account: Account,
    // payload
    amount: u64,
) -> (ProgramTestContext, Instruction) {
    let mut program_test = ProgramTest::new("escrow", program_id, processor!(Processor::process));

    // -----------------
    // Add Accounts
    // -----------------
    program_test.add_account(alice_pubkey, alice_account);
    program_test.add_account(alice_x_pubkey, alice_x_account);
    program_test.add_account(alice_y_pubkey, alice_y_account);
    program_test.add_account(escrow_pubkey, escrow_account);

    // -----------------
    // Setup and pack Instruction
    // -----------------
    let escrow_init_ix = EscrowInstruction::InitEscrow { amount };

    let ix_data = &escrow_init_ix.pack();

    let instruction = Instruction::new_with_bytes(
        program_id,
        ix_data,
        vec![
            AccountMeta::new(alice_pubkey, true),
            AccountMeta::new(alice_x_pubkey, false),
            AccountMeta::new(alice_y_pubkey, false),
            AccountMeta::new(escrow_pubkey, false),
            AccountMeta::new(program_id, false),
        ],
    );

    let ctx = program_test.start_with_context().await;
    (ctx, instruction)
}

#[tokio::test]
async fn init_escrow_success() {
    let program_id = Pubkey::new_unique();
    let alice_pubkey = Pubkey::new_unique();
    let alice_x_pubkey = Pubkey::new_unique();
    let alice_y_pubkey = Pubkey::new_unique();
    let escrow_pubkey = Pubkey::new_unique();

    let alice_account = Account::default();
    let alice_x_account = Account {
        owner: spl_token::id(),
        ..Account::default()
    };
    let alice_y_account = Account::default();
    let escrow_account = Account::default();

    let amount = 5000;

    let (mut ctx, instruction) = start_program(
        // keys
        program_id,
        alice_pubkey,
        alice_x_pubkey,
        alice_y_pubkey,
        escrow_pubkey,
        // accounts
        alice_account,
        alice_x_account,
        alice_y_account,
        escrow_account,
        // payload
        amount,
    )
    .await;

    let mut transaction = Transaction::new_with_payer(&[instruction], Some(&ctx.payer.pubkey()));
    transaction.sign(&[&ctx.payer], ctx.last_blockhash);

    ctx.banks_client
        .process_transaction(transaction)
        .await
        .expect("Init Escrow succeeds");
}
