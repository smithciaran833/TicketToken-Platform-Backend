use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    instruction::{AccountMeta, Instruction},
    program::invoke,
};
use crate::state::{Event};
use crate::errors::TicketTokenError;

#[derive(Accounts)]
pub struct ListTicketOnMarketplace<'info> {
    #[account(mut)]
    pub ticket_owner: Signer<'info>,

    #[account(
        constraint = event.resaleable @ TicketTokenError::ResaleNotAllowed,
        constraint = Clock::get()?.unix_timestamp < event.start_time @ TicketTokenError::EventAlreadyStarted,
    )]
    pub event: Account<'info, Event>,

    /// CHECK: Marketplace program
    pub marketplace_program: UncheckedAccount<'info>,

    /// CHECK: Marketplace config account
    pub marketplace_config: UncheckedAccount<'info>,

    /// CHECK: Listing account to be created by marketplace
    #[account(mut)]
    pub listing: UncheckedAccount<'info>,

    /// CHECK: Reentrancy guard for listing
    #[account(mut)]
    pub listing_reentrancy_guard: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn list_ticket_on_marketplace(
    ctx: Context<ListTicketOnMarketplace>,
    ticket_asset_id: Pubkey,
    price: u64,
    expires_at: i64,
) -> Result<()> {
    let event = &ctx.accounts.event;

    // Validate price cap (110% of original)
    let max_price = event.ticket_price
        .checked_mul(110)
        .ok_or(TicketTokenError::MathOverflow)?
        .checked_div(100)
        .ok_or(TicketTokenError::MathOverflow)?;

    require!(
        price <= max_price,
        TicketTokenError::PriceExceedsMax
    );

    // Validate expiry
    require!(
        expires_at > Clock::get()?.unix_timestamp && expires_at <= event.start_time,
        TicketTokenError::InvalidExpiry
    );

    msg!("Creating marketplace listing via CPI");

    // Build the instruction data manually
    let mut data = Vec::with_capacity(8 + 32 + 8 + 8 + 8);
    // Discriminator for create_listing (you'll need to get this from marketplace)
    data.extend_from_slice(&[242, 93, 182, 110, 115, 127, 189, 59]); // placeholder
    data.extend_from_slice(&ticket_asset_id.to_bytes());
    data.extend_from_slice(&price.to_le_bytes());
    data.extend_from_slice(&event.ticket_price.to_le_bytes());
    data.extend_from_slice(&expires_at.to_le_bytes());

    // Build accounts for CPI
    let accounts = vec![
        AccountMeta::new(ctx.accounts.ticket_owner.key(), true),
        AccountMeta::new_readonly(ctx.accounts.marketplace_config.key(), false),
        AccountMeta::new(ctx.accounts.listing.key(), false),
        AccountMeta::new_readonly(ctx.accounts.event.key(), false),
        AccountMeta::new(ctx.accounts.listing_reentrancy_guard.key(), false),
        AccountMeta::new_readonly(ctx.accounts.system_program.key(), false),
    ];

    // Create the instruction
    let ix = Instruction {
        program_id: ctx.accounts.marketplace_program.key(),
        accounts,
        data,
    };

    // Invoke the instruction
    invoke(
        &ix,
        &[
            ctx.accounts.ticket_owner.to_account_info(),
            ctx.accounts.marketplace_config.to_account_info(),
            ctx.accounts.listing.to_account_info(),
            ctx.accounts.event.to_account_info(),
            ctx.accounts.listing_reentrancy_guard.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
            ctx.accounts.marketplace_program.to_account_info(),
        ],
    )?;

    msg!("Ticket listed on marketplace successfully");

    emit!(TicketListedOnMarketplace {
        owner: ctx.accounts.ticket_owner.key(),
        event: event.key(),
        asset_id: ticket_asset_id,
        price,
        expires_at,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

#[event]
pub struct TicketListedOnMarketplace {
    pub owner: Pubkey,
    pub event: Pubkey,
    pub asset_id: Pubkey,
    pub price: u64,
    pub expires_at: i64,
    pub timestamp: i64,
}
