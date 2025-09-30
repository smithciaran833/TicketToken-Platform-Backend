use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;
pub mod utils;

use instructions::*;

declare_id!("BTNZP23sGbQsMwX1SBiyfTpDDqD8Sev7j78N45QBoYtv");

#[program]
pub mod marketplace {
    use super::*;

    pub fn initialize_marketplace(
        ctx: Context<InitializeMarketplace>,
        fee_bps: u16,
        treasury: Pubkey,
    ) -> Result<()> {
        instructions::initialize_marketplace::initialize_marketplace(ctx, fee_bps, treasury)
    }

    pub fn create_listing(
        ctx: Context<CreateListing>,
        asset_id: Pubkey,
        price: u64,
        original_price: u64,
        expires_at: i64,
    ) -> Result<()> {
        instructions::create_listing::create_listing(ctx, asset_id, price, original_price, expires_at)
    }

    pub fn buy_listing(ctx: Context<BuyListing>) -> Result<()> {
        instructions::buy_listing::buy_listing(ctx)
    }

    pub fn cancel_listing(ctx: Context<CancelListing>) -> Result<()> {
        instructions::cancel_listing::cancel_listing(ctx)
    }
}

#[cfg(test)]
mod tests;
