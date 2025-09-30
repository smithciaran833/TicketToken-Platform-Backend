use anchor_lang::prelude::*;
use crate::state::Event;
use crate::errors::TicketTokenError;

#[derive(Accounts)]
pub struct VerifyTicket<'info> {
    #[account(mut)]
    pub validator: Signer<'info>,
    
    #[account(
        mut,
        constraint = event.start_time - 3600 <= Clock::get()?.unix_timestamp @ TicketTokenError::EventAlreadyStarted,
        constraint = Clock::get()?.unix_timestamp <= event.end_time + 3600 @ TicketTokenError::EventAlreadyStarted,
    )]
    pub event: Account<'info, Event>,
}

pub fn verify_ticket(ctx: Context<VerifyTicket>) -> Result<()> {
    // In a real implementation, this would verify the merkle proof
    // For now, we just emit an event
    
    emit!(TicketVerified {
        event: ctx.accounts.event.key(),
        validator: ctx.accounts.validator.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    msg!("Ticket verified for event");
    
    Ok(())
}

#[event]
pub struct TicketVerified {
    pub event: Pubkey,
    pub validator: Pubkey,
    pub timestamp: i64,
}
