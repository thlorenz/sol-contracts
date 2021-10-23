use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint::ProgramResult,
    pubkey::Pubkey,
};

/// solana_program::msg!(concat!($msg, " {"))          ~22 units
/// solana_program::log::sol_log_compute_units() costs  ~1 unit
/// solana_program::msg!(" }")                          ~5 units
#[cfg(feature = "trace-compute")]
macro_rules! compute {
    ($msg:expr=> $($tt:tt)*) => {
        solana_program::msg!(concat!($msg, " {"));
        solana_program::log::sol_log_compute_units();
        $($tt)*
        solana_program::log::sol_log_compute_units();
        solana_program::msg!(" }");
    };
}

#[cfg(not(feature = "trace-compute"))]
macro_rules! compute {
    ($msg:expr=> $($tt:tt)*) => { $($tt)* };
}

pub fn process_instruction(
    _program_id: &Pubkey,
    accounts: &[AccountInfo],
    _instruction_data: &[u8],
) -> ProgramResult {
    // 3 compute units
    compute! { "account_info_iter" =>
        let account_info_iter = &mut accounts.iter();
    };

    // 28 compute units
    compute! { "source_info" =>
        let source_info = next_account_info(account_info_iter)?;
    };

    Ok(())
}
