use anchor_lang::prelude::*;
use crate::state::{Event, Ticket};
use crate::errors::TicketTokenError;

#[derive(Accounts)]
pub struct VerifyTicket<'info> {
    pub validator: Signer<'info>,
    
    #[account(
        constraint = event.start_time - 3600 <= Clock::get()?.unix_timestamp @ TicketTokenError::EventAlreadyStarted,
        constraint = Clock::get()?.unix_timestamp <= event.end_time + 3600 @ TicketTokenError::EventAlreadyStarted,
    )]
    pub event: Account<'info, Event>,
    
    #[account(
        mut,
        seeds = [b"ticket", event.key().as_ref(), ticket.ticket_id.to_le_bytes().as_ref()],
        bump = ticket.bump,
        constraint = ticket.event == event.key() @ TicketTokenError::InvalidTicket,
    )]
    pub ticket: Account<'info, Ticket>,
}

pub fn verify_ticket(ctx: Context<VerifyTicket>) -> Result<()> {
    // Capture keys before mutable borrow
    let event_key = ctx.accounts.event.key();
    let ticket_key = ctx.accounts.ticket.key();
    let validator_key = ctx.accounts.validator.key();
    
    let ticket = &mut ctx.accounts.ticket;
    
    // Check if ticket has already been used
    require!(!ticket.used, TicketTokenError::TicketAlreadyUsed);
    
    // Mark ticket as used (immutable!)
    ticket.used = true;
    ticket.verified_at = Some(Clock::get()?.unix_timestamp);
    
    let ticket_id = ticket.ticket_id;
    let owner = ticket.current_owner_id.clone();
    let timestamp = ticket.verified_at.unwrap();
    
    emit!(TicketVerified {
        event: event_key,
        ticket: ticket_key,
        ticket_id,
        owner,
        validator: validator_key,
        timestamp,
    });
    
    msg!("Ticket {} verified and marked as USED", ticket_id);
    
    Ok(())
}

#[event]
pub struct TicketVerified {
    pub event: Pubkey,
    pub ticket: Pubkey,
    pub ticket_id: u64,
    pub owner: String,
    pub validator: Pubkey,
    pub timestamp: i64,
}
