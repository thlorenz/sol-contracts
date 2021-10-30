use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint::ProgramResult,
    msg,
    program::invoke,
    program_error::ProgramError,
    program_pack::Pack,
    pubkey::Pubkey,
    rent::Rent,
    sysvar::{self, Sysvar},
};

use crate::{error::EscrowError, instruction::EscrowInstruction, state::Escrow};
use spl_token::instruction::{set_authority, AuthorityType};

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

        // TODO: get it properly from sysvar
        let rent = Rent::default();
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
