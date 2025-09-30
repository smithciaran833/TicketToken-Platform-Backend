use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;
pub mod utils;

use instructions::*;
use state::MintTicketArgs;
use state::CreateEventParams;

declare_id!("E7D92vNoSj2rqB1PnuZihFZ9hDstnbJMwCFkxx9TxQBL");

#[program]
pub mod tickettoken {
    use super::*;

    pub fn initialize_platform(
        ctx: Context<InitializePlatform>,
        fee_bps: u16,
        treasury: Pubkey,
    ) -> Result<()> {
        instructions::initialize_platform::initialize_platform(ctx, fee_bps, treasury)
    }

    pub fn create_venue(
        ctx: Context<CreateVenue>,
        venue_id: String,
        name: String,
        metadata_uri: String,
    ) -> Result<()> {
        instructions::create_venue::create_venue(ctx, venue_id, name, metadata_uri)
    }

    pub fn verify_venue(ctx: Context<VerifyVenue>) -> Result<()> {
        instructions::verify_venue::verify_venue(ctx)
    }

    pub fn create_event(
        ctx: Context<CreateEvent>,
        params: CreateEventParams,
    ) -> Result<()> {
        instructions::create_event::create_event(ctx, params)
    }

    pub fn purchase_tickets(
        ctx: Context<PurchaseTickets>,
        args: MintTicketArgs,
    ) -> Result<()> {
        instructions::purchase_tickets::handler(ctx, args)
    }

    pub fn list_ticket_on_marketplace(
        ctx: Context<ListTicketOnMarketplace>,
        ticket_asset_id: Pubkey,
        price: u64,
        expires_at: i64,
    ) -> Result<()> {
        instructions::list_ticket_on_marketplace(ctx, ticket_asset_id, price, expires_at)
    }

    pub fn verify_ticket(ctx: Context<VerifyTicket>) -> Result<()> {
        instructions::verify_ticket::verify_ticket(ctx)
    }
}

#[cfg(test)]
mod test {
    #[test]
    fn test_id() {
        assert_eq!(
            super::ID.to_string(),
            "2WiJ9wF1XdQ4WZ6mQDbBeFN9wTj5HZrNbx6hA6YGGXpT"
        );
    }
}

#[cfg(test)]
mod tests;
