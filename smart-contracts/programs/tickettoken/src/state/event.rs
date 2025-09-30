use anchor_lang::prelude::*;

#[account]
pub struct Event {
    pub venue: Pubkey,                // 32 bytes - Parent venue
    pub event_id: u64,                // 8 bytes - Unique event ID
    pub name: [u8; 32],               // 32 bytes - Event name
    pub ticket_price: u64,            // 8 bytes - Price in lamports
    pub total_tickets: u32,           // 4 bytes - Total capacity
    pub tickets_sold: u32,            // 4 bytes - Current sold count
    pub tickets_reserved: u32,        // 4 bytes - Reserved (not paid)
    pub start_time: i64,              // 8 bytes - Unix timestamp
    pub end_time: i64,                // 8 bytes - Unix timestamp
    pub refund_window: i64,           // 8 bytes - Seconds after start
    pub metadata_uri: [u8; 64],       // 64 bytes - Event details URI
    pub oracle_feed: Pubkey,          // 32 bytes - Pyth price feed
    pub description: [u8; 200],       // 200 bytes - On-chain description
    pub transferable: bool,           // 1 byte - Can tickets be traded
    pub resaleable: bool,             // 1 byte - Can be resold
    pub merkle_tree: Pubkey,          // 32 bytes - Compressed NFT tree
    pub bump: u8,                     // 1 byte - PDA bump seed
}

impl Event {
    pub const SIZE: usize = 8 +       // discriminator
        32 +                          // venue
        8 +                           // event_id
        32 +                          // name
        8 +                           // ticket_price
        4 +                           // total_tickets
        4 +                           // tickets_sold
        4 +                           // tickets_reserved
        8 +                           // start_time
        8 +                           // end_time
        8 +                           // refund_window
        64 +                          // metadata_uri
        32 +                          // oracle_feed
        200 +                         // description
        1 +                           // transferable
        1 +                           // resaleable
        32 +                          // merkle_tree
        1;                            // bump
    // Total: 455 bytes (updated from spec to include merkle_tree)
    
    pub fn is_active(&self) -> bool {
        let now = Clock::get().map_err(|_| TicketTokenError::ClockError)?.unix_timestamp;
        now < self.start_time && self.tickets_sold < self.total_tickets
    }
    
    pub fn can_refund(&self) -> bool {
        let now = Clock::get().map_err(|_| TicketTokenError::ClockError)?.unix_timestamp;
        now < self.start_time.saturating_add(self.refund_window)
    }
}
