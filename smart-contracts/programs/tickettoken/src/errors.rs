use anchor_lang::prelude::*;

#[error_code]
pub enum TicketTokenError {
    #[msg("Invalid tree depth")]
    InvalidTreeDepth,
    #[msg("Invalid buffer size")]
    InvalidBufferSize,
    #[msg("Invalid canopy depth")]
    InvalidCanopyDepth,
    #[msg("Clock error")]
    ClockError,  // This line had a syntax error - fixed now
    // Add other errors as needed
}
