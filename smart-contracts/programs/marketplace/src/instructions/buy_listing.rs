use anchor_lang::prelude::*;
use crate::utils::ReentrancyGuard;
use anchor_lang::solana_program::clock::Clock;
use crate::state::{Listing, MarketplaceConfig};
use crate::errors::MarketplaceError;

#[derive(Accounts)]
pub struct BuyListing<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,
    
    #[account(
        mut,
        constraint = listing.active @ MarketplaceError::ListingNotActive,
        constraint = !listing.is_expired(Clock::get()?.unix_timestamp) @ MarketplaceError::ListingExpired,
    )]
    pub listing: Account<'info, Listing>,
    
    #[account(
        mut,
        seeds = [b"marketplace"],
        bump = marketplace.bump,
    )]
    pub marketplace: Account<'info, MarketplaceConfig>,
    
    /// CHECK: Seller receives payment
    #[account(mut)]
    pub seller: UncheckedAccount<'info>,
    
    /// CHECK: Marketplace treasury
    #[account(mut)]
    pub marketplace_treasury: UncheckedAccount<'info>,
    
    /// CHECK: Venue treasury for royalties
    #[account(mut)]
    pub venue_treasury: UncheckedAccount<'info>,
    
    #[account(
        mut,
        seeds = [
            b"reentrancy",
            listing.key().as_ref()
        ],
        bump = reentrancy_guard.bump,
    )]
    pub reentrancy_guard: Account<'info, ReentrancyGuard>,

    pub system_program: Program<'info, System>,
}

pub fn buy_listing(ctx: Context<BuyListing>) -> Result<()> {
    // Lock reentrancy guard
    ctx.accounts.reentrancy_guard.lock()?;

    let listing = &ctx.accounts.listing;
    let marketplace = &ctx.accounts.marketplace;
    
    // Calculate fees
    let marketplace_fee = listing.price
        .checked_mul(marketplace.fee_bps as u64)
        .ok_or(MarketplaceError::MathOverflow)?
        .checked_div(10_000)
        .ok_or(MarketplaceError::MathOverflow)?;
    
    // 5% venue royalty
    let venue_royalty = listing.price
        .checked_mul(500)
        .ok_or(MarketplaceError::MathOverflow)?
        .checked_div(10_000)
        .ok_or(MarketplaceError::MathOverflow)?;
    
    let seller_amount = listing.price
        .checked_sub(marketplace_fee)
        .ok_or(MarketplaceError::MathOverflow)?
        .checked_sub(venue_royalty)
        .ok_or(MarketplaceError::MathOverflow)?;
    
    // Transfer to seller
    anchor_lang::system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: ctx.accounts.buyer.to_account_info(),
                to: ctx.accounts.seller.to_account_info(),
            },
        ),
        seller_amount,
    )?;
    
    // Transfer marketplace fee
    if marketplace_fee > 0 {
        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.buyer.to_account_info(),
                    to: ctx.accounts.marketplace_treasury.to_account_info(),
                },
            ),
            marketplace_fee,
        )?;
    }
    
    // Transfer venue royalty
    if venue_royalty > 0 {
        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.buyer.to_account_info(),
                    to: ctx.accounts.venue_treasury.to_account_info(),
                },
            ),
            venue_royalty,
        )?;
    }
    
    // Mark listing as sold
    let listing = &mut ctx.accounts.listing;
    listing.active = false;
    
    // Update marketplace stats
    let marketplace = &mut ctx.accounts.marketplace;
    marketplace.total_sales += 1;
    marketplace.total_volume = marketplace.total_volume
        .checked_add(listing.price)
        .ok_or(MarketplaceError::MathOverflow)?;
    
    emit!(ListingSold {
        buyer: ctx.accounts.buyer.key(),
        seller: listing.seller,
        asset_id: listing.ticket_asset_id,
        price: listing.price,
        marketplace_fee,
        venue_royalty,
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    msg!("Listing sold for {} SOL", listing.price);
    
    // Unlock reentrancy guard
    ctx.accounts.reentrancy_guard.unlock()?;

    Ok(())
}

#[event]
pub struct ListingSold {
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub asset_id: Pubkey,
    pub price: u64,
    pub marketplace_fee: u64,
    pub venue_royalty: u64,
    pub timestamp: i64,
}
