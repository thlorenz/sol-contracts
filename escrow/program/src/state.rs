use solana_program::{
    program_error::ProgramError,
    program_pack::{IsInitialized, Pack, Sealed},
    pubkey::Pubkey,
};

use arrayref::{array_mut_ref, array_ref, array_refs, mut_array_refs};

#[derive(Default, Debug)]
pub struct Escrow {
    /// Determines if escrow account is already in use
    pub is_initialized: bool,

    /// Alice's pubkey
    pub initializer_pubkey: Pubkey,

    /// Program sends tokens from this account to Bob's account when Bob takes the trade.
    /// Used to verify that Bob later passes in correct account to receive from
    pub tmp_token_account_pubkey: Pubkey,

    /// Bob's tokens will be sent to this account.
    pub initializer_token_to_receive_account_pubkey: Pubkey,

    /// Used to check that Bob sends enough of his token
    pub expected_amount: u64,
}

// -----------------
// Pack Implementation
// -----------------

// NOTE: this is what BorshSerialize, BorshDeserialize do for us

/// Solana version of `Sized`
impl Sealed for Escrow {}

impl IsInitialized for Escrow {
    fn is_initialized(&self) -> bool {
        self.is_initialized
    }
}

impl Pack for Escrow {
    const LEN: usize = 105; // 1 + 32 + 32 + 32 + 8

    fn pack_into_slice(&self, dst: &mut [u8]) {
        let Escrow {
            is_initialized,
            initializer_pubkey,
            tmp_token_account_pubkey,
            initializer_token_to_receive_account_pubkey,
            expected_amount,
        } = self;

        // allocate u8 buffer of size 105
        let dst = array_mut_ref![dst, 0, Escrow::LEN];
        // get offsets of individual buffer chunks
        let (
            /* bool:    1 byte  */ is_initialized_dst,
            /* Pubkey: 32 bytes */ initializer_pubkey_dst,
            /* Pubkey: 32 bytes */ tmp_token_account_pubkey_dst,
            /* Pubkey: 32 bytes */ initializer_token_to_receive_account_pubkey_dst,
            /* u64:     8 bytes */ expected_amount_dst,
        ) = mut_array_refs![dst, 1, 32, 32, 32, 8];

        // memcpy escrow content into chunks one by one
        is_initialized_dst[0] = *is_initialized as u8;
        initializer_pubkey_dst.copy_from_slice(initializer_pubkey.as_ref());
        tmp_token_account_pubkey_dst.copy_from_slice(tmp_token_account_pubkey.as_ref());
        initializer_token_to_receive_account_pubkey_dst
            .copy_from_slice(initializer_token_to_receive_account_pubkey.as_ref());
        *expected_amount_dst = expected_amount.to_le_bytes();
    }

    fn unpack_from_slice(src: &[u8]) -> Result<Self, ProgramError> {
        // take slice of src that matches packed escrow bytesize
        let src = array_ref![src, 0, Escrow::LEN];
        // get offsets of individual buffer chunks
        let (
            /* bool:    1 byte  */ is_initialized,
            /* Pubkey: 32 bytes */ initializer_pubkey,
            /* Pubkey: 32 bytes */ tmp_token_account_pubkey,
            /* Pubkey: 32 bytes */ initializer_token_to_receive_account_pubkey,
            /* u64:     8 bytes */ expected_amount,
        ) = array_refs![src, 1, 32, 32, 32, 8];

        // convert memory content of each chunk into Rust types
        let is_initialized = match is_initialized {
            [0] => false,
            [1] => true,
            _ => return Err(ProgramError::InvalidAccountData),
        };

        let initializer_pubkey = Pubkey::new_from_array(*initializer_pubkey);
        let tmp_token_account_pubkey = Pubkey::new_from_array(*tmp_token_account_pubkey);
        let initializer_token_to_receive_account_pubkey =
            Pubkey::new_from_array(*initializer_token_to_receive_account_pubkey);
        let expected_amount = u64::from_le_bytes(*expected_amount);

        let escrow = Escrow {
            is_initialized,
            initializer_pubkey,
            tmp_token_account_pubkey,
            initializer_token_to_receive_account_pubkey,
            expected_amount,
        };

        Ok(escrow)
    }
}
