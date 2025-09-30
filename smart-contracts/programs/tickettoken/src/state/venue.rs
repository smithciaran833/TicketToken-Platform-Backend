use anchor_lang::prelude::*;

#[account]
pub struct Venue {
    pub venue_id: [u8; 32],         // 32 bytes
    pub owner: Pubkey,              // 32 bytes  
    pub name: [u8; 64],             // 64 bytes
    pub metadata_uri: [u8; 64],     // 64 bytes
    pub verified: bool,             // 1 byte
    pub active: bool,               // 1 byte
    pub event_count: u64,           // 8 bytes
    pub total_sales: u64,           // 8 bytes
    pub bump: u8,                   // 1 byte
}

impl Venue {
    pub const SIZE: usize = 32 + 32 + 64 + 64 + 1 + 1 + 8 + 8 + 1;

    pub fn is_active(&self) -> bool {
        self.active && self.verified
    }
}

impl Default for Venue {
    fn default() -> Self {
        Self {
            venue_id: [0u8; 32],
            owner: Pubkey::default(),
            name: [0u8; 64],
            metadata_uri: [0u8; 64],
            verified: false,
            active: false,
            event_count: 0,
            total_sales: 0,
            bump: 0,
        }
    }
}
