pub mod validation;
pub mod merkle;

use anchor_lang::prelude::*;
use crate::errors::TicketTokenError;

pub fn string_to_bytes(input: &str, max_len: usize) -> Result<Vec<u8>> {
    require!(
        input.len() <= max_len,
        TicketTokenError::InvalidCharacters
    );
    
    let mut bytes = input.as_bytes().to_vec();
    bytes.resize(max_len, 0);
    Ok(bytes)
}

pub fn validate_string(input: &str) -> Result<()> {
    require!(
        input.chars().all(|c| c.is_ascii_graphic() || c == ' '),
        TicketTokenError::InvalidCharacters
    );
    Ok(())
}

pub fn safe_add(a: u64, b: u64) -> Result<u64> {
    a.checked_add(b).ok_or(TicketTokenError::MathOverflow.into())
}

pub fn safe_mul(a: u64, b: u64) -> Result<u64> {
    a.checked_mul(b).ok_or(TicketTokenError::MathOverflow.into())
}

pub fn calculate_fee(amount: u64, fee_bps: u16) -> Result<u64> {
    let fee = safe_mul(amount, fee_bps as u64)?;
    fee.checked_div(10_000).ok_or(TicketTokenError::MathOverflow.into())
}

pub fn bytes_to_string(bytes: &[u8]) -> String {
    String::from_utf8(bytes.to_vec())
        .unwrap_or_default()
        .trim_end_matches('\0')
        .to_string()
}

pub fn safe_div(a: u64, b: u64) -> Result<u64> {
    if b == 0 {
        return Err(TicketTokenError::MathOverflow.into());
    }
    a.checked_div(b).ok_or(TicketTokenError::MathOverflow.into())
}
pub mod reentrancy;
pub mod compute;
