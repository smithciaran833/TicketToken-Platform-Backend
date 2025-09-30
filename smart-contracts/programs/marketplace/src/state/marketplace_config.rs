use anchor_lang::prelude::*;

#[account]
pub struct MarketplaceConfig {
    pub authority: Pubkey,          // 32 bytes
    pub fee_bps: u16,              // 2 bytes - marketplace fee (basis points)
    pub paused: bool,              // 1 byte
    pub total_listings: u64,       // 8 bytes
    pub total_sales: u64,          // 8 bytes
    pub total_volume: u64,         // 8 bytes - total SOL volume
    pub treasury: Pubkey,          // 32 bytes
    pub bump: u8,                  // 1 byte
}

impl MarketplaceConfig {
    pub const SIZE: usize = 32 + 2 + 1 + 8 + 8 + 8 + 32 + 1;
}
