use anchor_lang::prelude::*;
use crate::constants::PLATFORM_FEE_CAP;

#[account]
#[derive(Default)]
pub struct Platform {
    pub owner: Pubkey,              // 32 bytes
    pub treasury: Pubkey,           // 32 bytes
    pub fee_bps: u16,              // 2 bytes
    pub paused: bool,              // 1 byte
    pub total_venues: u64,         // 8 bytes
    pub total_events: u64,         // 8 bytes
    pub total_tickets_sold: u64,   // 8 bytes
    pub total_fees_collected: u64, // 8 bytes
    pub bump: u8,                  // 1 byte
}

impl Platform {
    pub const SIZE: usize = 32 + 32 + 2 + 1 + 8 + 8 + 8 + 8 + 1;
    
    pub fn validate_fee(&self) -> bool {
        self.fee_bps <= PLATFORM_FEE_CAP
    }
}
