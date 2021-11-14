use std::convert::TryInto;

use solana_program::program_error::ProgramError;

pub struct TransferInstruction {
    pub amount: u64,
}

impl TransferInstruction {
    pub fn unpack(input: &[u8]) -> Result<Self, ProgramError> {
        let amount = Self::unpack_amount(input)?;
        Ok(TransferInstruction { amount })
    }

    fn unpack_amount(input: &[u8]) -> Result<u64, ProgramError> {
        let amount: u64 = input
            .get(..8)
            .and_then(|slice| slice.try_into().ok())
            .map(u64::from_le_bytes)
            .ok_or(ProgramError::InvalidInstructionData)?;
        Ok(amount)
    }

    pub fn pack(&self) -> Vec<u8> {
        let TransferInstruction { amount } = self;
        const LEN: usize = 8;
        let amount_dst = &mut [0_u8; LEN];
        *amount_dst = amount.to_le_bytes();
        amount_dst.to_vec()
    }
}
