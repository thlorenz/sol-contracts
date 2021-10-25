use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint::ProgramResult,
    msg,
    program_error::ProgramError,
    pubkey::Pubkey,
};

use crate::instruction::TransferInstruction;

/// Total extra compute units used per compute! call    30 units
///
/// Breakdown:
///     solana_program::msg!(concat!($msg, " {"))      ~22 units
///     solana_program::log::sol_log_compute_units()    ~1 unit
///     solana_program::msg!(" }")                      ~5 units
#[cfg(feature = "trace-compute")]
macro_rules! compute {
    ($msg:expr=> $($tt:tt)*) => {
        solana_program::msg!(concat!($msg, " {"));
        solana_program::log::sol_log_compute_units();
        $($tt)*
        solana_program::log::sol_log_compute_units();
        solana_program::msg!(concat!(" } // ", $msg));
    };
}

#[cfg(not(feature = "trace-compute"))]
macro_rules! compute {
    ($msg:expr=> $($tt:tt)*) => { $($tt)* };
}

// TODO: this could be a procmacro allowing a simple #[compute_fn] on top of the fn declaration
macro_rules! compute_fn {
    ($msg:expr=> $($tt:tt)*) => {
        solana_program::msg!(concat!($msg, " {"));
        solana_program::log::sol_log_compute_units();
        let res = { $($tt)* };
        solana_program::log::sol_log_compute_units();
        solana_program::msg!(concat!(" } // ", $msg));
        res
    };
}

pub fn process_instruction(
    _program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    // 209 units total
    compute_fn! { "process_instruction" =>

    // 66 units
    compute! { "deserialize instruction" =>
        let TransferInstruction { amount } = TransferInstruction::unpack(instruction_data)?;
    }

    // 56 units
    compute! { "get account infos" =>
        let account_info_iter = &mut accounts.iter();
        let source_info = next_account_info(account_info_iter)?;
        let destination_info = next_account_info(account_info_iter)?;
    }

    // 82 units on success; >100 units on failure due to extra msg using format params
    // However handling the error incurs an overhead of ~32 units
    compute! { "execute transfer" =>
        let mut source_lamports = source_info.try_borrow_mut_lamports()?;
        if **source_lamports < amount {
            msg!("source account has less than {} lamports", amount);
            let err = Err(ProgramError::InsufficientFunds);
            return err;
        }
        **source_lamports -= amount;
        **destination_info.try_borrow_mut_lamports()? += amount;
    }

    Ok(())
    }
}
