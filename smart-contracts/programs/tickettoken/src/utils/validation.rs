use anchor_lang::prelude::*;
use crate::errors::TicketTokenError;
use crate::constants::*;

pub fn validate_event_times(
    start_time: i64,
    end_time: i64,
    current_time: i64,
) -> Result<()> {
    // Start time must be at least 1 hour in future
    require!(
        start_time > current_time + 3600,
        TicketTokenError::StartTimeTooSoon
    );
    
    // End time must be after start time
    require!(
        end_time > start_time,
        TicketTokenError::EndBeforeStart
    );
    
    // Event can't be longer than 365 days
    require!(
        end_time - start_time <= 365 * 24 * 3600,
        TicketTokenError::EventTooLong
    );
    
    Ok(())
}

pub fn validate_price_bounds(price: u64) -> Result<()> {
    require!(
        price >= MIN_TICKET_PRICE,
        TicketTokenError::PriceTooLow
    );
    
    require!(
        price <= MAX_TICKET_PRICE,
        TicketTokenError::PriceTooHigh
    );
    
    Ok(())
}

pub fn validate_capacity(capacity: u32) -> Result<()> {
    require!(
        capacity > 0 && capacity <= 1_000_000,
        TicketTokenError::InvalidCapacity
    );
    
    Ok(())
}

pub fn validate_refund_window(window: i64) -> Result<()> {
    // Max 48 hours after event start
    require!(
        window <= 48 * 3600,
        TicketTokenError::RefundWindowTooLong
    );
    
    Ok(())
}
