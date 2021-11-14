use solana_program::program_pack::Pack;
use solana_program::{account_info::AccountInfo, pubkey::Pubkey, rent::Rent};

use solana_sdk::account::{create_account_for_test, Account};

use crate::state::Escrow;

pub struct EscrowAccounts<'a> {
    pub initializer_acc: AccountInfo<'a>,
    pub tmp_acc: AccountInfo<'a>,
    pub tok_to_receive_acc: AccountInfo<'a>,
    pub escrow_acc: AccountInfo<'a>,
    pub rent: AccountInfo<'a>,
    pub token_program_acc: AccountInfo<'a>,
}

impl<'a> EscrowAccounts<'a> {
    pub fn new(
        // Signer
        initializer_pkey: &'a Pubkey,
        initializer_lamp: &'a mut u64,
        initializer_data: &'a mut [u8],

        // Initializer's Token Account
        tmp_pkey: &'a Pubkey,
        tmp_lamp: &'a mut u64,
        tmp_data: &'a mut [u8],

        tok_to_receive_pkey: &'a Pubkey,
        tok_to_receive_lamp: &'a mut u64,
        tok_to_receive_data: &'a mut [u8],
        tok_to_receive_owner: &'a Pubkey,

        // Escrow Account
        escrow_pkey: &'a Pubkey,
        escrow_lamp: &'a mut u64,
        escrow_data: &'a mut [u8; Escrow::LEN],

        // Rent account
        rent_pkey: &'a Pubkey,
        rent_acc: &'a mut Account,

        token_program_pkey: &'a Pubkey,
        token_program_lamp: &'a mut u64,
        token_program_data: &'a mut [u8],
    ) -> Self {
        let initializer_acc = AccountInfo::new(
            initializer_pkey,
            true, // initializer
            false,
            initializer_lamp,
            initializer_data,
            initializer_pkey,
            false,
            0,
        );
        let tmp_acc = AccountInfo::new(
            tmp_pkey, false, true, // writable
            tmp_lamp, tmp_data, tmp_pkey, false, 0,
        );
        let tok_to_receive_acc = AccountInfo::new(
            &tok_to_receive_pkey,
            false,
            false,
            tok_to_receive_lamp,
            tok_to_receive_data,
            &tok_to_receive_owner,
            false,
            0,
        );
        let escrow_acc = create_empty_escrow_acc(escrow_pkey, escrow_lamp, escrow_data);
        let rent = create_rent_acc(rent_pkey, rent_acc);

        let token_program_acc = AccountInfo::new(
            token_program_pkey,
            false,
            false,
            token_program_lamp,
            token_program_data,
            token_program_pkey,
            false,
            0,
        );

        Self {
            initializer_acc,
            tmp_acc,
            tok_to_receive_acc,
            escrow_acc,
            rent,
            token_program_acc,
        }
    }

    pub fn account_infos(&'a self) -> Vec<AccountInfo> {
        let EscrowAccounts {
            initializer_acc,
            tmp_acc,
            tok_to_receive_acc,
            escrow_acc,
            rent,
            token_program_acc,
        } = self;

        vec![
            /* 0 */ initializer_acc.clone(),
            /* 1 */ tmp_acc.clone(),
            /* 2 */ tok_to_receive_acc.clone(),
            /* 3 */ escrow_acc.clone(),
            /* 4 */ rent.clone(),
            /* 5 */ token_program_acc.clone(),
        ]
    }
}

// -----------------
// Escrow Account
// -----------------
pub fn create_empty_escrow_acc<'a>(
    pubkey: &'a Pubkey,
    lamports: &'a mut u64,
    data: &'a mut [u8; Escrow::LEN],
) -> AccountInfo<'a> {
    let escrow = Escrow::default();
    escrow.pack_into_slice(data);
    let escrow_acc = AccountInfo::new(pubkey, false, true, lamports, data, pubkey, false, 0);
    escrow_acc
}

// -----------------
// Rent account
// -----------------
fn create_rent_acc<'a>(rent_pkey: &'a Pubkey, account: &'a mut Account) -> AccountInfo<'a> {
    let rent_acc = AccountInfo::new(
        rent_pkey,
        false,
        false,
        &mut account.lamports,
        &mut account.data,
        &mut account.owner,
        account.executable,
        account.rent_epoch,
    );
    rent_acc
}

fn rent_sysvar() -> Account {
    create_account_for_test(&Rent::default())
}
