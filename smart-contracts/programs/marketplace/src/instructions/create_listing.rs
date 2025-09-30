use anchor_lang::prelude::*;
use crate::utils::ReentrancyGuard;
use crate::state::{Listing, MarketplaceConfig};
use crate::errors::MarketplaceError;

#[derive(Accounts)]
#[instruction(asset_id: Pubkey, price: u64, expires_at: i64)]
pub struct CreateListing<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,
    
    #[account(
        seeds = [b"marketplace"],
        bump = marketplace.bump,
        constraint = !marketplace.paused @ MarketplaceError::MarketplacePaused,
    )]
    pub marketplace: Account<'info, MarketplaceConfig>,
    
    #[account(
        init,
        payer = seller,
        seeds = [
            b"listing",
            seller.key().as_ref(),
            asset_id.as_ref(),
        ],
        bump,
        space = 8 + Listing::SIZE,
    )]
    pub listing: Account<'info, Listing>,
    
    /// CHECK: Event account will be validated by the ticket program
    pub event: UncheckedAccount<'info>,
    
    #[account(
        init,
        payer = seller,
        seeds = [
            b"reentrancy",
            listing.key().as_ref()
        ],
        bump,
        space = 8 + ReentrancyGuard::INIT_SPACE,
    )]
    pub reentrancy_guard: Account<'info, ReentrancyGuard>,

    pub system_program: Program<'info, System>,
}

pub fn create_listing(
    ctx: Context<CreateListing>,
    asset_id: Pubkey,
    price: u64,
    original_price: u64,
    expires_at: i64,
) -> Result<()> {
    let current_time = Clock::get()?.unix_timestamp;
    
    // Validate expiry
    require!(
        expires_at > current_time,
        MarketplaceError::InvalidExpiry
    );
    
    // Initialize listing
    let listing = &mut ctx.accounts.listing;
    listing.seller = ctx.accounts.seller.key();
    listing.event = ctx.accounts.event.key();
    listing.ticket_asset_id = asset_id;
    listing.price = price;
    listing.original_price = original_price;
    listing.listed_at = current_time;
    listing.expires_at = expires_at;
    listing.active = true;
    listing.bump = ctx.bumps.listing;
    
    // Validate price cap
    listing.validate_price_cap()?;
    
    // Update marketplace stats
    let marketplace = &mut ctx.accounts.marketplace;
    marketplace.total_listings += 1;
    
    // Initialize reentrancy guard
    let reentrancy_guard = &mut ctx.accounts.reentrancy_guard;
    reentrancy_guard.is_locked = false;
    reentrancy_guard.bump = ctx.bumps.reentrancy_guard;

    emit!(ListingCreated {
        seller: listing.seller,
        asset_id,
        price,
        expires_at,
        timestamp: current_time,
    });
    
    msg!("Listing created for asset {} at price {}", asset_id, price);
    
    Ok(())
}

#[event]
pub struct ListingCreated {
    pub seller: Pubkey,
    pub asset_id: Pubkey,
    pub price: u64,
    pub expires_at: i64,
    pub timestamp: i64,
}
