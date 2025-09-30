use anchor_lang::prelude::*;
use crate::state::{Venue, Event, CreateEventParams, TreeConfig};
use crate::errors::TicketTokenError;
use crate::utils::{string_to_bytes, validate_string};
use crate::utils::validation::*;
use crate::utils::reentrancy::{ReentrancyGuard};

#[derive(Accounts)]
#[instruction(params: CreateEventParams)]
pub struct CreateEvent<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        mut,
        constraint = authority.key() == venue.owner @ TicketTokenError::UnauthorizedVenue,
        constraint = venue.verified @ TicketTokenError::VenueNotVerified,
        constraint = venue.active @ TicketTokenError::VenueInactive,
    )]
    pub venue: Account<'info, Venue>,
    
    #[account(
        init,
        payer = authority,
        seeds = [
            b"event",
            venue.key().as_ref(),
            params.event_id.to_le_bytes().as_ref()
        ],
        bump,
        space = 8 + Event::SIZE,
    )]
    pub event: Account<'info, Event>,
    
    #[account(
        init,
        payer = authority,
        seeds = [
            b"reentrancy",
            event.key().as_ref()
        ],
        bump,
        space = 8 + ReentrancyGuard::INIT_SPACE,
    )]
    pub reentrancy_guard: Account<'info, ReentrancyGuard>,

    pub system_program: Program<'info, System>,
}

pub fn create_event(ctx: Context<CreateEvent>, params: CreateEventParams) -> Result<()> {
    let current_time = Clock::get()?.unix_timestamp;
    
    // Validate all parameters
    validate_string(&params.name)?;
    validate_event_times(params.start_time, params.end_time, current_time)?;
    validate_price_bounds(params.ticket_price)?;
    validate_capacity(params.total_tickets)?;
    validate_refund_window(params.refund_window)?;
    
    // Validate tree capacity
    let tree_config = TreeConfig::optimal();
    require!(
        tree_config.capacity() >= params.total_tickets,
        TicketTokenError::InvalidCapacity
    );
    
    // Initialize event state
    let event = &mut ctx.accounts.event;
    event.venue = ctx.accounts.venue.key();
    event.event_id = params.event_id;
    event.name = string_to_bytes(&params.name, 32)?
        .try_into()
        .map_err(|_| TicketTokenError::InvalidEventName)?;
    event.ticket_price = params.ticket_price;
    event.total_tickets = params.total_tickets;
    event.tickets_sold = 0;
    event.tickets_reserved = 0;
    event.start_time = params.start_time;
    event.end_time = params.end_time;
    event.refund_window = params.refund_window;
    event.metadata_uri = string_to_bytes(&params.metadata_uri, 64)?
        .try_into()
        .map_err(|_| TicketTokenError::UriTooLong)?;
    event.oracle_feed = params.oracle_feed;
    event.description = string_to_bytes(&params.description, 200)?
        .try_into()
        .map_err(|_| TicketTokenError::DescriptionTooLong)?;
    event.transferable = params.transferable;
    event.resaleable = params.resaleable;
    
    // For now, we'll store a placeholder merkle tree pubkey
    // Real merkle tree initialization will be added in the next step
    event.merkle_tree = Pubkey::default();
    event.bump = ctx.bumps.event;
    
    // Update venue event counter
    let venue = &mut ctx.accounts.venue;
    venue.event_count += 1;
    
    // Initialize reentrancy guard
    let reentrancy_guard = &mut ctx.accounts.reentrancy_guard;
    reentrancy_guard.is_locked = false;
    reentrancy_guard.bump = ctx.bumps.reentrancy_guard;

    emit!(EventCreated {
        venue: venue.key(),
        event: ctx.accounts.event.key(),
        event_id: params.event_id,
        capacity: params.total_tickets,
        timestamp: current_time,
    });
    
    msg!("Event created with capacity for {} tickets", params.total_tickets);
    
    Ok(())
}

#[event]
pub struct EventCreated {
    pub venue: Pubkey,
    pub event: Pubkey,
    pub event_id: u64,
    pub capacity: u32,
    pub timestamp: i64,
}
