/// Program Entrypoint
#[cfg(not(feature = "no-entrypoint"))]
pub mod entrypoint;

/// Program API, (De)serializes instruction data
pub mod instruction;

/// Program Logic
pub mod processor;

/// Program Objects, (De)serializes state
pub mod state;

/// Program Specific Errors
pub mod error;

#[cfg(test)]
pub mod test_utils;

/*
 * Alice: initializer, inits the escrow
 * Bob: taker, takes the trade
 */

/*
 * ## Program Flow
 *
 * 1. Entrypoint called
 * 2. Forwards to processor
 * 3. processor asks instruction to decode instruction_data
 * 4. processor decides based on decoded data with which processing function to process the request
 * 5. processor may use state to (en|de)code state of an account which was passed to entry point
 */
