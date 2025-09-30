use anchor_lang::prelude::*;
pub mod platform;
pub mod venue;
pub mod event;
pub mod ticket;
pub mod tree_config;

#[cfg(test)]
mod tests;

pub use platform::*;
pub use venue::*;
pub use event::*;
pub use ticket::*;
pub use tree_config::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CreateEventParams {
    pub event_id: u64,
    pub name: String,
    pub ticket_price: u64,
    pub total_tickets: u32,
    pub start_time: i64,
    pub end_time: i64,
    pub refund_window: i64,
    pub metadata_uri: String,
    pub oracle_feed: Pubkey,
    pub description: String,
    pub transferable: bool,
    pub resaleable: bool,
}
