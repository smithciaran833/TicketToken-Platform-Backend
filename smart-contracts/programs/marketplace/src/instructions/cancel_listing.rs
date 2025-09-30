use anchor_lang::prelude::*;
use crate::utils::ReentrancyGuard;
use crate::state::Listing;
use crate::errors::MarketplaceError;

#[derive(Accounts)]
pub struct CancelListing<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,
    
    #[account(
        mut,
        close = seller,
        constraint = listing.seller == seller.key() @ MarketplaceError::Unauthorized,
        constraint = listing.active @ MarketplaceError::ListingNotActive,
    )]
    pub listing: Account<'info, Listing>,
    #[account(
        mut,
        close = seller,
        seeds = [
            b"reentrancy",
            listing.key().as_ref()
        ],
        bump = reentrancy_guard.bump,
    )]
    pub reentrancy_guard: Account<'info, ReentrancyGuard>,
}

pub fn cancel_listing(ctx: Context<CancelListing>) -> Result<()> {
    let listing = &ctx.accounts.listing;
    
    emit!(ListingCancelled {
        seller: listing.seller,
        asset_id: listing.ticket_asset_id,
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    msg!("Listing cancelled for asset {}", listing.ticket_asset_id);
    
    Ok(())
}

#[event]
pub struct ListingCancelled {
    pub seller: Pubkey,
    pub asset_id: Pubkey,
    pub timestamp: i64,
}
