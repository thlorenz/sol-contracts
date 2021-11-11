use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint::ProgramResult,
    msg,
    program::{invoke, invoke_signed},
    program_error::ProgramError,
    program_pack::Pack,
    pubkey::Pubkey,
    rent::Rent,
    sysvar::Sysvar,
};

use crate::{error::EscrowError, instruction::EscrowInstruction, state::Escrow};
use spl_token::instruction::{set_authority, AuthorityType};
use spl_token::state::Account as TokenAccount;

pub struct Processor;
impl Processor {
    pub fn process(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        instruction_data: &[u8],
    ) -> ProgramResult {
        let instruction = EscrowInstruction::unpack(instruction_data)?;

        use EscrowInstruction::*;
        match instruction {
            InitEscrow { amount } => {
                msg!("Instruction: InitEscrow");
                Self::process_init_escrow(program_id, accounts, amount)
            }
            EscrowInstruction::Exchange { amount } => {
                msg!("Instruction: Exchange");
                Self::process_exchange(program_id, accounts, amount)
            }
        }
    }

    fn process_init_escrow(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        amount: u64,
    ) -> ProgramResult {
        let account_iter = &mut accounts.iter();

        // 1. escrow initializer (account 0)
        let initializer = next_account_info(account_iter)?;
        if !initializer.is_signer {
            return Err(ProgramError::MissingRequiredSignature);
        }

        // 2. tmp token account (account 1) Alice Token X
        // - tx fails if it's not writable
        // - tx fails if not owned by token program at the point where we try to transfer it to the PDA
        // - no explicit checks needed here
        let tmp_token_account = next_account_info(account_iter)?;

        // 3. initializer's receive token account (account 2) Alice Token Y
        let token_to_receive_account = next_account_info(account_iter)?;
        let token_program_id = spl_token::id();
        if *token_to_receive_account.owner != token_program_id {
            return Err(ProgramError::IncorrectProgramId);
        }

        // 4. escrow account (account 3)
        let escrow_account = next_account_info(account_iter)?;

        let rent = Rent::get()?;
        if !rent.is_exempt(escrow_account.lamports(), escrow_account.data_len()) {
            return Err(EscrowError::NotRentExempt.into());
        }

        // Extract [Escrow] state from it's account data
        let mut escrow_state = Escrow::unpack_unchecked(&escrow_account.data.borrow())?;
        if escrow_state.is_initialized {
            return Err(ProgramError::AccountAlreadyInitialized);
        }

        // initialize escrow state
        escrow_state.is_initialized = true;
        escrow_state.initializer_pubkey = *initializer.key;
        escrow_state.tmp_token_account_pubkey = *tmp_token_account.key;
        escrow_state.initializer_token_to_receive_account_pubkey = *token_to_receive_account.key;
        escrow_state.expected_amount = amount;

        // persist escrow state
        Escrow::pack(escrow_state, &mut escrow_account.data.borrow_mut())?;

        // Transfer ownership of tmp token to the PDA
        let (pda, _bump_seed) = Pubkey::find_program_address(&[b"escrow"], program_id);

        // 6. token program (account 5)
        let token_program = next_account_info(account_iter)?;

        /*
        Create instruction that makes PDA the account owner of the tmp_token_account
          token_program_id     = key of program being called
          owned_pubkey         = key of account whose authority we'll change
          new_authority_pubkey = new authorithy of that owned account
          owner_pubkey         = key of current owner
          signer_pubkeys       = public keys signing the CPI (to approve owner change)
        */
        let owner_change_ix = set_authority(
            /* token_program_id     */ token_program.key,
            /* owned_pubkey         */ tmp_token_account.key,
            /* new_authority_pubkey */ Some(&pda),
            /* authority_type       */ AuthorityType::AccountOwner,
            /* owner_pubkey         */ initializer.key,
            /* signer_pubkeys       */ &[&initializer.key],
        )?;

        // NOTE: spl-token instruction builder verifies that token_program account is the account
        // of the token program

        msg!("Calling the token program to transfer token account ownership...");

        // Invoke cross-program instruction
        // Passing accounts required by ix and account of program we're calling
        let account_infos = &[
            tmp_token_account.clone(), // account whose authority/owner we're changing
            initializer.clone(),       // account of current authority/owner
            token_program.clone(),
        ];
        invoke(&owner_change_ix, account_infos)?;

        Ok(())
    }
    fn process_exchange(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        amount_expected_by_taker: u64,
    ) -> ProgramResult {
        let account_iter = &mut accounts.iter();

        // 1. taker (account 0) Bob
        let taker = next_account_info(account_iter)?;
        if !taker.is_signer {
            return Err(ProgramError::MissingRequiredSignature);
        }

        // 2. token that taker sends (account 1) Bob Y
        let takers_sending_token_account = next_account_info(account_iter)?;

        // 3. token that taker receives ( account 2) Bob X
        let takers_token_to_receive_account = next_account_info(account_iter)?;

        // 4. PDA's tmp token account to get tokens from, which we'll close at the end (account 3)
        let pdas_tmp_token_account = next_account_info(account_iter)?;
        let pdas_tmp_token_account_info =
            TokenAccount::unpack(&pdas_tmp_token_account.data.borrow())?;

        if amount_expected_by_taker != pdas_tmp_token_account_info.amount {
            return Err(EscrowError::ExpectedAmountMismatch.into());
        }

        let (pda, bump_seed) = Pubkey::find_program_address(&[b"escrow"], program_id);

        // 5. initializer's main account to send rent fees to (account 4) Alice
        let initializers_main_account = next_account_info(account_iter)?;

        // 6. initializer's token account that will receive tokens (account 5) Alice Y
        let initializers_token_to_receive_account = next_account_info(account_iter)?;

        // 7.  escrow account holding the escrow info (account 6)
        let escrow_account = next_account_info(account_iter)?;
        let escrow_info = Escrow::unpack(&escrow_account.data.borrow())?;

        if escrow_info.tmp_token_account_pubkey != *pdas_tmp_token_account.key {
            return Err(ProgramError::InvalidAccountData);
        }
        if escrow_info.initializer_pubkey != *initializers_main_account.key {
            return Err(ProgramError::InvalidAccountData);
        }
        if escrow_info.initializer_token_to_receive_account_pubkey
            != *initializers_token_to_receive_account.key
        {
            return Err(ProgramError::InvalidAccountData);
        }

        // 8. Token Program (account 7)
        let token_program = next_account_info(account_iter)?;

        // 9. PDA account (account 8)
        let pda_account = next_account_info(account_iter)?;

        // -----------------
        // Transfers
        // -----------------

        // Transfer Bob's Y directly to Alice's Y
        let transfer_to_initializer_ix = spl_token::instruction::transfer(
            token_program.key,
            // source
            takers_sending_token_account.key,
            // destination
            initializers_token_to_receive_account.key,
            // authority
            taker.key,
            // signer
            &[&taker.key],
            escrow_info.expected_amount,
        )?;
        msg!("Calling the token program to transfer tokens to the escrow's initializer...");
        invoke(
            &transfer_to_initializer_ix,
            &[
                takers_sending_token_account.clone(),
                initializers_token_to_receive_account.clone(),
                taker.clone(),
                token_program.clone(),
            ],
        )?;

        // Transfer Alice's X stored in tmp account during init to Bob's X
        let transfer_to_taker_ix = spl_token::instruction::transfer(
            token_program.key,
            // source
            pdas_tmp_token_account.key,
            // destination
            takers_token_to_receive_account.key,
            // authority
            &pda,
            // signer
            &[&pda],
            pdas_tmp_token_account_info.amount,
        )?;
        msg!("Calling the token program to transfer tokens to the taker...");
        invoke_signed(
            &transfer_to_taker_ix,
            &[
                pdas_tmp_token_account.clone(),
                takers_token_to_receive_account.clone(),
                pda_account.clone(),
                token_program.clone(),
            ],
            // signers_seeds: &[&[&[u8]]]
            &[&[&b"escrow"[..], &[bump_seed]]],
        )?;

        // -----------------
        // Cleanup
        // -----------------

        let close_pdas_tmp_acc_ix = spl_token::instruction::close_account(
            token_program.key,
            // account_pubkey
            pdas_tmp_token_account.key,
            // destination_pubkey
            initializers_main_account.key,
            // owner_pubkey
            &pda,
            // signer_pubkeys
            &[&pda],
        )?;
        msg!("Calling the token program to close pda's temp account...");
        invoke_signed(
            &close_pdas_tmp_acc_ix,
            &[
                pdas_tmp_token_account.clone(),
                initializers_main_account.clone(),
                pda_account.clone(),
                token_program.clone(),
            ],
            &[&[&b"escrow"[..], &[bump_seed]]],
        )?;

        msg!("Closing the escrow account...");
        // Move remaining lamports from escrow to Alice and remove escrow data
        **initializers_main_account.lamports.borrow_mut() = initializers_main_account
            .lamports()
            .checked_add(escrow_account.lamports())
            .ok_or(EscrowError::AmountOverflow)?;
        **escrow_account.lamports.borrow_mut() = 0;
        *escrow_account.data.borrow_mut() = &mut [];

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use solana_program::sysvar;

    use crate::test_utils::EscrowAccounts;

    use super::*;
    use solana_sdk::account::{create_account_for_test, Account};

    #[test]
    fn init_escrow() {
        // -----------------
        // Signer
        // -----------------
        let initializer_pkey = &Pubkey::new_unique();
        let initializer_lamp = &mut 0;
        let initializer_data = &mut [0u8];

        // -----------------
        // Alice Token X tmp
        // -----------------
        let tmp_pkey = &Pubkey::new_unique();
        let tmp_lamp = &mut 0;
        let tmp_data = &mut [0u8];

        // -----------------
        // Initializer's Token Account
        // -----------------
        let tok_to_receive_pkey = &Pubkey::new_unique();
        let tok_to_receive_lamp = &mut 0;
        let tok_to_receive_data = &mut [0u8];
        let tok_to_receive_owner = &spl_token::id();

        // -----------------
        // Escrow Account
        // -----------------
        // Defaulting to create essentially empty escrow which is filled when processed
        let escrow_pkey = &Pubkey::new_unique();
        let escrow_data = &mut [0u8; Escrow::LEN];
        let escrow_lamp = &mut Rent::default().minimum_balance(Escrow::LEN);

        // -----------------
        // Rent account
        // -----------------
        let rent_pkey = &sysvar::rent::id();
        let rent_acc = &mut rent_sysvar();

        // -----------------
        // Token Program account
        // -----------------
        let token_program_pkey = &spl_token::id();
        let token_program_lamp = &mut 0;
        let token_program_data = &mut [0u8];

        let escrow_accounts = EscrowAccounts::new(
            initializer_pkey,
            initializer_lamp,
            initializer_data,
            tmp_pkey,
            tmp_lamp,
            tmp_data,
            tok_to_receive_pkey,
            tok_to_receive_lamp,
            tok_to_receive_data,
            tok_to_receive_owner,
            escrow_pkey,
            escrow_lamp,
            escrow_data,
            rent_pkey,
            rent_acc,
            token_program_pkey,
            token_program_lamp,
            token_program_data,
        );

        let infos = &escrow_accounts.account_infos();
        let program_id = Pubkey::new_unique();

        let init_escrow = EscrowInstruction::InitEscrow { amount: 10 };
        let init_escrow_ix = init_escrow.pack();

        Processor::process(&program_id, infos, &init_escrow_ix)
            .expect("Program should have processed fine");
    }

    #[test]
    fn init_escrow_invalid_signer() {
        // -----------------
        // Signer
        // -----------------
        let initializer_pkey = &Pubkey::new_unique();
        let initializer_lamp = &mut 0;
        let initializer_data = &mut [0u8];

        // -----------------
        // Alice Token X tmp
        // -----------------
        let tmp_pkey = &Pubkey::new_unique();
        let tmp_lamp = &mut 0;
        let tmp_data = &mut [0u8];

        // -----------------
        // Initializer's Token Account
        // -----------------
        let tok_to_receive_pkey = &Pubkey::new_unique();
        let tok_to_receive_lamp = &mut 0;
        let tok_to_receive_data = &mut [0u8];
        let tok_to_receive_owner = &spl_token::id();

        // -----------------
        // Escrow Account
        // -----------------
        // Defaulting to create essentially empty escrow which is filled when processed
        let escrow_pkey = &Pubkey::new_unique();
        let escrow_data = &mut [0u8; Escrow::LEN];
        let escrow_lamp = &mut Rent::default().minimum_balance(Escrow::LEN);

        // -----------------
        // Rent account
        // -----------------
        let rent_pkey = &sysvar::rent::id();
        let rent_acc = &mut rent_sysvar();

        // -----------------
        // Token Program account
        // -----------------
        let token_program_pkey = &spl_token::id();
        let token_program_lamp = &mut 0;
        let token_program_data = &mut [0u8];

        let mut escrow_accounts = EscrowAccounts::new(
            initializer_pkey,
            initializer_lamp,
            initializer_data,
            tmp_pkey,
            tmp_lamp,
            tmp_data,
            tok_to_receive_pkey,
            tok_to_receive_lamp,
            tok_to_receive_data,
            tok_to_receive_owner,
            escrow_pkey,
            escrow_lamp,
            escrow_data,
            rent_pkey,
            rent_acc,
            token_program_pkey,
            token_program_lamp,
            token_program_data,
        );

        let program_id = Pubkey::new_unique();

        let init_escrow = EscrowInstruction::InitEscrow { amount: 10 };
        let init_escrow_ix = init_escrow.pack();

        // Make signer invalic
        escrow_accounts.initializer_acc.is_signer = false;
        let infos = &escrow_accounts.account_infos();

        assert_eq!(
            Processor::process(&program_id, infos, &init_escrow_ix),
            Err(ProgramError::MissingRequiredSignature),
            "Detects missing signature"
        );
    }

    fn rent_sysvar() -> Account {
        create_account_for_test(&Rent::default())
    }
}
