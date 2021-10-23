use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint::ProgramResult,
    msg,
    program_error::ProgramError,
    pubkey::Pubkey,
};

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

/// Total compute units measured:       138
/// BPF instructions executed (interp): 900 (919 trace-compute)
/// Compute units consumed:             900 (960 trace-compute)
/// Max frame depth reached: 4
/// Just process_instruction body       220 (353 trace-compute)
pub fn process_instruction(
    _program_id: &Pubkey,
    accounts: &[AccountInfo],
    _instruction_data: &[u8],
) -> ProgramResult {
    compute_fn! { "process_instruction" =>

    // 56 units
    compute! { "get account infos" =>
        let account_info_iter = &mut accounts.iter();
        let source_info = next_account_info(account_info_iter)?;
        let destination_info = next_account_info(account_info_iter)?;
    }

    // 82 units on success; 78 units on failure
    // However handling the error incurs an overhead of ~32 units
    compute! { "execute transfer" =>
        let mut source_lamports = source_info.try_borrow_mut_lamports()?;
        if **source_lamports < 5 {
            msg!("source account has less than 5 lamports");
            let err = Err(ProgramError::InsufficientFunds);
            return err;
        }
        **source_lamports -= 5;
        **destination_info.try_borrow_mut_lamports()? += 5;
    }

    Ok(())
    }
}
