use anchor_lang::prelude::*;
use crate::state::MarketplaceConfig;
use crate::errors::MarketplaceError;

#[derive(Accounts)]
pub struct InitializeMarketplace<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        init,
        payer = authority,
        seeds = [b"marketplace"],
        bump,
        space = 8 + MarketplaceConfig::SIZE,
    )]
    pub marketplace: Account<'info, MarketplaceConfig>,
    
    pub system_program: Program<'info, System>,
}

pub fn initialize_marketplace(
    ctx: Context<InitializeMarketplace>,
    fee_bps: u16,
    treasury: Pubkey,
) -> Result<()> {
    require!(fee_bps <= 1000, MarketplaceError::PriceCapExceeded); // Max 10%
    
    let marketplace = &mut ctx.accounts.marketplace;
    marketplace.authority = ctx.accounts.authority.key();
    marketplace.fee_bps = fee_bps;
    marketplace.paused = false;
    marketplace.total_listings = 0;
    marketplace.total_sales = 0;
    marketplace.total_volume = 0;
    marketplace.treasury = treasury;
    marketplace.bump = ctx.bumps.marketplace;
    
    msg!("Marketplace initialized with {}% fee", fee_bps as f64 / 100.0);
    
    Ok(())
}
