use anchor_lang::prelude::*;
use crate::state::{Event, Ticket};
use crate::errors::TicketTokenError;

#[derive(Accounts)]
#[instruction(ticket_id: u64, nft_asset_id: Pubkey, owner_id: String)]
pub struct RegisterTicket<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub event: Account<'info, Event>,
    
    #[account(
        init,
        payer = authority,
        seeds = [b"ticket", event.key().as_ref(), ticket_id.to_le_bytes().as_ref()],
        bump,
        space = 8 + Ticket::SIZE,
    )]
    pub ticket: Account<'info, Ticket>,
    
    pub system_program: Program<'info, System>,
}

pub fn register_ticket(
    ctx: Context<RegisterTicket>,
    ticket_id: u64,
    nft_asset_id: Pubkey,
    owner_id: String,
) -> Result<()> {
    require!(owner_id.len() <= Ticket::MAX_OWNER_ID_LEN, TicketTokenError::OwnerIdTooLong);
    
    let ticket = &mut ctx.accounts.ticket;
    ticket.event = ctx.accounts.event.key();
    ticket.ticket_id = ticket_id;
    ticket.nft_asset_id = nft_asset_id;
    ticket.current_owner_id = owner_id.clone();
    ticket.used = false;
    ticket.verified_at = None;
    ticket.transfer_count = 0;
    ticket.bump = ctx.bumps.ticket;
    
    msg!("Ticket {} registered for event {} with owner {}", 
        ticket_id, 
        ctx.accounts.event.key(), 
        owner_id
    );
    
    Ok(())
}
