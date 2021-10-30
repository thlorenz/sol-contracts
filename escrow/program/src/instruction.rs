use std::convert::TryInto;

use crate::error::EscrowError::InvalidInstruction;
use solana_program::program_error::ProgramError;

#[derive(Debug, PartialEq, Eq)]
pub enum EscrowInstruction {
    /// Starts the trade by creating and populating an escrow account and
    /// transferring ownership of the given temp token account to the PDA
    ///
    /// Accounts expected:
    ///
    /// 0. `[s]` The account of the person initializing the escrow (Alice)
    /// 1. `[w]` Temporary token account (Alice Token X) that should be created prior to
    ///    this instruction and owned by the initializer (Alice)
    /// 2 `[]` The initializer's token account for the token they will receive should the trade go
    ///    through (Alice Token Y) `[]` indicates _readonly_
    /// 3. `[w]` The escrow account, it will hold all necessary info about the trade.
    ///     Program will write escrow info to it
    /// 4. `[]` The token program
    InitEscrow {
        /// The amount of token Y that Alice wants to receive for her (Alice Token X)
        /// Provided via `instruction_data` instead of via an account
        amount: u64,
    },
}

impl EscrowInstruction {
    pub fn unpack(input: &[u8]) -> Result<Self, ProgramError> {
        // Separate first element (tag) from remaining 8 which represent the u64 amount
        let (instruction_tag, rest): (&u8, &[u8]) =
            input.split_first().ok_or(InvalidInstruction)?;
        let escrow = match instruction_tag {
            0 => Self::InitEscrow {
                amount: Self::unpack_amount(rest)?,
            },
            _ => return Err(InvalidInstruction.into()),
        };
        Ok(escrow)
    }

    fn unpack_amount(input: &[u8]) -> Result<u64, ProgramError> {
        let amount: u64 = input
            .get(..8)
            .and_then(|slice| slice.try_into().ok())
            .map(u64::from_le_bytes)
            .ok_or(InvalidInstruction)?;
        Ok(amount)
    }

    pub fn pack(&self) -> Vec<u8> {
        use arrayref::mut_array_refs;

        match self {
            EscrowInstruction::InitEscrow { amount } => {
                const LEN: usize = 1 + 8;
                let mut dst = [0_u8; LEN];
                let (tag_dst, amount_dst) = mut_array_refs![&mut dst, 1, 8];

                *tag_dst = [0_u8];
                *amount_dst = amount.to_le_bytes();
                dst.to_vec()
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unpack_escrow_init() {
        let init_escrow = EscrowInstruction::InitEscrow { amount: 10 };
        let packed = init_escrow.pack();
        let unpacked_escrow = EscrowInstruction::unpack(&packed);
        assert_eq!(unpacked_escrow, Ok(init_escrow));
    }
}
