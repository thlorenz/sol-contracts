/// Total extra compute units used per compute! call    30 units
///
/// Breakdown:
///     solana_program::msg!(concat!($msg, " {"))      ~22 units
///     solana_program::log::sol_log_compute_units()    ~1 unit
///     solana_program::msg!(" }")                      ~5 units
#[macro_export]
#[cfg(feature = "trace-compute")]
macro_rules! compute {
    ($msg:expr=> $($tt:tt)*) => {
        ::solana_program::msg!(concat!($msg, " {"));
        ::solana_program::log::sol_log_compute_units();
        $($tt)*
        ::solana_program::log::sol_log_compute_units();
        ::solana_program::msg!(concat!(" } // ", $msg));
    };
}

#[macro_export]
#[cfg(not(feature = "trace-compute"))]
macro_rules! compute {
    ($msg:expr=> $($tt:tt)*) => { $($tt)* };
}

#[macro_export]
macro_rules! compute_fn {
    ($msg:expr=> $($tt:tt)*) => {
        ::solana_program::msg!(concat!($msg, " {"));
        ::solana_program::log::sol_log_compute_units();
        let res = { $($tt)* };
        ::solana_program::log::sol_log_compute_units();
        ::solana_program::msg!(concat!(" } // ", $msg));
        res
    };
}
