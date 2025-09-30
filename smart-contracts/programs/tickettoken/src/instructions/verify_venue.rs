use anchor_lang::prelude::*;
use crate::state::{Platform, Venue};
use crate::errors::TicketTokenError;
use crate::constants::*;

#[derive(Accounts)]
pub struct VerifyVenue<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        seeds = [PLATFORM_SEED],
        bump = platform.bump,
        constraint = platform.owner == authority.key() @ TicketTokenError::Unauthorized
    )]
    pub platform: Account<'info, Platform>,
    
    #[account(
        mut,
        constraint = !venue.verified @ TicketTokenError::AlreadyVerified
    )]
    pub venue: Account<'info, Venue>,
}

pub fn verify_venue(ctx: Context<VerifyVenue>) -> Result<()> {
    let venue = &mut ctx.accounts.venue;
    venue.verified = true;
    
    emit!(VenueVerified {
        venue: ctx.accounts.venue.key(),
        verifier: ctx.accounts.authority.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    msg!("Venue {} verified by platform owner", ctx.accounts.venue.key());
    
    Ok(())
}

#[event]
pub struct VenueVerified {
    pub venue: Pubkey,
    pub verifier: Pubkey,
    pub timestamp: i64,
}
