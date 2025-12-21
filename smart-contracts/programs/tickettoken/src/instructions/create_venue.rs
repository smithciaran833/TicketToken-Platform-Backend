use anchor_lang::prelude::*;
use crate::state::{Platform, Venue};
use crate::errors::TicketTokenError;
use crate::constants::*;
use crate::utils::string_to_bytes;

#[derive(Accounts)]
#[instruction(venue_id: String)]
pub struct CreateVenue<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    
    #[account(
        mut,
        seeds = [PLATFORM_SEED],
        bump = platform.bump
    )]
    pub platform: Account<'info, Platform>,
    
    #[account(
        init,
        payer = owner,
        space = 8 + Venue::SIZE,
        seeds = [VENUE_SEED, venue_id.as_bytes()],
        bump
    )]
    pub venue: Account<'info, Venue>,
    
    pub system_program: Program<'info, System>,
}

pub fn create_venue(
    ctx: Context<CreateVenue>,
    venue_id: String,
    name: String,
    metadata_uri: String,
) -> Result<()> {
    // Input validation
    require!(
        venue_id.len() <= 32,
        TicketTokenError::VenueIdTooLong
    );
    require!(
        name.len() <= MAX_VENUE_NAME,
        TicketTokenError::VenueNameTooLong
    );
    require!(
        metadata_uri.len() <= MAX_URI_LENGTH,
        TicketTokenError::UriTooLong
    );
    require!(
        name.chars().all(|c| c.is_ascii_graphic() || c == ' '),
        TicketTokenError::InvalidCharacters
    );
    
    // Convert strings to fixed byte arrays
    let venue_id_bytes = string_to_bytes(&venue_id, 32)?;
    let name_bytes = string_to_bytes(&name, 64)?;
    let metadata_uri_bytes = string_to_bytes(&metadata_uri, 64)?;
    
    // Initialize venue
    let venue = &mut ctx.accounts.venue;
    venue.owner = ctx.accounts.owner.key();
    venue.venue_id = venue_id_bytes.try_into().map_err(|_| TicketTokenError::InvalidVenueId)?;
    venue.name = name_bytes.try_into().map_err(|_| TicketTokenError::InvalidVenueId)?;
    venue.metadata_uri = metadata_uri_bytes.try_into().map_err(|_| TicketTokenError::InvalidVenueId)?;
    venue.verified = false;
    venue.active = true;
    venue.event_count = 0;
    venue.total_sales = 0;
    venue.bump = ctx.bumps.venue; // Store bump seed!
    
    // Increment platform venue counter
    let platform = &mut ctx.accounts.platform;
    platform.total_venues += 1;
    
    // Clone name for the event (or use &name in both places)
    emit!(VenueCreated {
        venue_id: venue_id.clone(),
        owner: venue.owner,
        name: name.clone(),
        venue_pubkey: ctx.accounts.venue.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    msg!("Venue '{}' created successfully", name);
    
    Ok(())
}

#[event]
pub struct VenueCreated {
    pub venue_id: String,
    pub owner: Pubkey,
    pub name: String,
    pub venue_pubkey: Pubkey,
    pub timestamp: i64,
}
