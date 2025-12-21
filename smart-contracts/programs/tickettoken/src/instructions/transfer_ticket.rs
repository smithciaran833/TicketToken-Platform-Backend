use anchor_lang::prelude::*;
use crate::state::{Event, Ticket};
use crate::errors::TicketTokenError;

#[derive(Accounts)]
pub struct TransferTicket<'info> {
    pub authority: Signer<'info>,
    
    #[account(constraint = event.resaleable @ TicketTokenError::TransferNotAllowed)]
    pub event: Account<'info, Event>,
    
    #[account(
        mut,
        seeds = [b"ticket", event.key().as_ref(), ticket.ticket_id.to_le_bytes().as_ref()],
        bump = ticket.bump,
    )]
    pub ticket: Account<'info, Ticket>,
}

pub fn transfer_ticket(
    ctx: Context<TransferTicket>,
    new_owner_id: String,
) -> Result<()> {
    require!(new_owner_id.len() <= Ticket::MAX_OWNER_ID_LEN, TicketTokenError::OwnerIdTooLong);
    
    let ticket = &mut ctx.accounts.ticket;
    require!(!ticket.used, TicketTokenError::TicketAlreadyUsed);
    
    let old_owner_id = ticket.current_owner_id.clone();
    ticket.current_owner_id = new_owner_id.clone();
    ticket.transfer_count += 1;
    
    msg!(
        "Ticket {} transferred from {} to {} (transfer #{})", 
        ticket.ticket_id,
        old_owner_id,
        new_owner_id,
        ticket.transfer_count
    );
    
    Ok(())
}
