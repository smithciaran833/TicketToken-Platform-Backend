use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct MarketplaceState {
    pub authority: Pubkey,
    pub fee_basis_points: u16,
    pub treasury: Pubkey,
    pub total_volume: u64,
    pub total_trades: u64,
    pub paused: bool,
    pub bump: u8,
}
