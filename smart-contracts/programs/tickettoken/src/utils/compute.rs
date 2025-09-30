use anchor_lang::prelude::*;
use anchor_lang::solana_program::log::sol_log_compute_units;

pub fn log_compute_checkpoint(checkpoint: &str) {
    msg!("Compute checkpoint: {}", checkpoint);
    sol_log_compute_units();
}

#[macro_export]
macro_rules! compute_fn {
    ($name:expr, $body:expr) => {{
        msg!("Start: {}", $name);
        sol_log_compute_units();
        let result = $body;
        msg!("End: {}", $name);
        sol_log_compute_units();
        result
    }};
}
