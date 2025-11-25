use anchor_lang::prelude::*;
use crate::state::{Platform, Venue, Event, MintTicketArgs};
use crate::errors::TicketTokenError;
use crate::constants::*;
use crate::utils::{calculate_fee, safe_add, safe_mul};
use crate::utils::merkle::create_ticket_metadata;
use crate::utils::reentrancy::{ReentrancyGuard};

#[derive(Accounts)]
#[instruction(args: MintTicketArgs)]
pub struct PurchaseTickets<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(
        seeds = [b"platform"],
        bump = platform.bump,
    )]
    pub platform: Account<'info, Platform>,

    #[account(
        mut,
        constraint = venue.verified @ TicketTokenError::VenueNotVerified,
        constraint = venue.active @ TicketTokenError::VenueInactive,
    )]
    pub venue: Account<'info, Venue>,

    #[account(
        mut,
        seeds = [
            b"event",
            venue.key().as_ref(),
            event.event_id.to_le_bytes().as_ref()
        ],
        bump = event.bump,
        constraint = event.venue == venue.key() @ TicketTokenError::InvalidEventVenue,
    )]
    pub event: Account<'info, Event>,

    /// CHECK: Venue treasury receives funds
    #[account(mut)]
    pub venue_treasury: UncheckedAccount<'info>,

    /// CHECK: Platform treasury receives fees
    #[account(
        mut,
        constraint = platform_treasury.key() == platform.treasury @ TicketTokenError::InvalidTreasury
    )]
    pub platform_treasury: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [
            b"reentrancy",
            event.key().as_ref()
        ],
        bump = reentrancy_guard.bump,
    )]
    pub reentrancy_guard: Account<'info, ReentrancyGuard>,

    pub system_program: Program<'info, System>,
}

pub fn purchase_tickets(ctx: Context<PurchaseTickets>, args: MintTicketArgs) -> Result<()> {
    // Lock reentrancy guard
    ctx.accounts.reentrancy_guard.lock()?;

    let event = &ctx.accounts.event;
    let current_time = Clock::get()?.unix_timestamp;

    // Validate purchase timing
    require!(
        current_time < event.start_time,
        TicketTokenError::EventAlreadyStarted
    );

    // Validate quantity
    require!(
        args.quantity > 0 && args.quantity <= MAX_TICKET_PURCHASE,
        TicketTokenError::InvalidQuantity
    );

    // Check capacity
    let new_sold = safe_add(event.tickets_sold as u64, args.quantity as u64)?;
    require!(
        new_sold <= event.total_tickets as u64,
        TicketTokenError::InsufficientTickets
    );

    // Calculate total cost
    let ticket_cost = safe_mul(event.ticket_price, args.quantity as u64)?;

    // Calculate platform fee
    let platform_fee = calculate_fee(ticket_cost, ctx.accounts.platform.fee_bps)?;
    let venue_amount = ticket_cost.checked_sub(platform_fee)
        .ok_or(TicketTokenError::MathOverflow)?;

    // Transfer to venue
    let venue_transfer = anchor_lang::system_program::Transfer {
        from: ctx.accounts.buyer.to_account_info(),
        to: ctx.accounts.venue_treasury.to_account_info(),
    };
    anchor_lang::system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            venue_transfer,
        ),
        venue_amount,
    )?;

    // Transfer platform fee
    if platform_fee > 0 {
        let fee_transfer = anchor_lang::system_program::Transfer {
            from: ctx.accounts.buyer.to_account_info(),
            to: ctx.accounts.platform_treasury.to_account_info(),
        };
        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                fee_transfer,
            ),
            platform_fee,
        )?;
    }

    // Store values before mutable borrows
    let event_key = ctx.accounts.event.key();
    let price_each = event.ticket_price;
    let venue_key = ctx.accounts.venue.key();
    let platform_treasury_key = ctx.accounts.platform_treasury.key();

    // Update event stats
    let event = &mut ctx.accounts.event;
    event.tickets_sold = new_sold as u32;

    // Update venue stats
    let venue = &mut ctx.accounts.venue;
    venue.total_sales = safe_add(venue.total_sales, args.quantity as u64)?;

    // In a real implementation, we would mint compressed NFTs here
    let start_ticket_number = event.tickets_sold - args.quantity as u32;
    for i in 0..args.quantity {
        let ticket_number = start_ticket_number.checked_add(i as u32).ok_or(TicketTokenError::MathOverflow)?;
        let metadata = create_ticket_metadata(
            event,
            ticket_number,
            &args.section,
            &args.row,
            &format!("{}", args.seat_start.checked_add(i as u32).ok_or(TicketTokenError::MathOverflow)?),
            platform_treasury_key,
        );

        msg!("Would mint ticket #{} with metadata: {}", ticket_number, metadata.name);
        msg!("Creators: Venue ({}): 50%, Platform ({}): 50%", venue_key, platform_treasury_key);
        msg!("Royalty: 10% (1000 basis points)");
    }

    emit!(TicketsPurchased {
        buyer: ctx.accounts.buyer.key(),
        event: event_key,
        venue: venue_key,
        quantity: args.quantity,
        price_each,
        total_paid: ticket_cost,
        platform_fee,
        start_ticket_number,
        timestamp: current_time,
    });

    msg!("Purchased {} tickets", args.quantity);

    // Unlock reentrancy guard
    ctx.accounts.reentrancy_guard.unlock()?;

    Ok(())
}

#[event]
pub struct TicketsPurchased {
    pub buyer: Pubkey,
    pub event: Pubkey,
    pub venue: Pubkey,
    pub quantity: u8,
    pub price_each: u64,
    pub total_paid: u64,
    pub platform_fee: u64,
    pub start_ticket_number: u32,
    pub timestamp: i64,
}

// Export alias for lib.rs
pub use purchase_tickets as handler;
