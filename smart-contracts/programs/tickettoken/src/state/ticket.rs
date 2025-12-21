use anchor_lang::prelude::*;

#[account]
pub struct Ticket {
    pub event: Pubkey,              // 32 bytes - Parent event PDA
    pub ticket_id: u64,             // 8 bytes - Unique ID within event
    pub nft_asset_id: Pubkey,       // 32 bytes - Metaplex cNFT asset ID
    pub current_owner_id: String,   // 4 + 64 bytes - Backend user ID
    pub used: bool,                 // 1 byte - Has been scanned
    pub verified_at: Option<i64>,   // 1 + 8 bytes - When scanned
    pub transfer_count: u32,        // 4 bytes - Number of resales
    pub bump: u8,                   // 1 byte - PDA bump
}

impl Ticket {
    pub const MAX_OWNER_ID_LEN: usize = 64;
    pub const SIZE: usize = 8 + 32 + 8 + 32 + (4 + 64) + 1 + 9 + 4 + 1; // ~163 bytes
}

// Legacy structs kept for backwards compatibility with existing minting code
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct TicketMetadata {
    pub event_id: Pubkey,           // 32 bytes
    pub venue_id: Pubkey,           // 32 bytes
    pub ticket_number: u32,         // 4 bytes
    pub section: [u8; 20],          // 20 bytes - Section name
    pub row: [u8; 10],              // 10 bytes - Row identifier
    pub seat: [u8; 10],             // 10 bytes - Seat number
    pub purchase_price: u64,        // 8 bytes
    pub purchased_at: i64,          // 8 bytes
    pub purchaser: Pubkey,          // 32 bytes
}

impl TicketMetadata {
    pub fn hash(&self) -> [u8; 32] {
        use anchor_lang::solana_program::keccak;
        let serialized = self.try_to_vec().unwrap_or_default();
        keccak::hash(&serialized).to_bytes()
    }
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct MintTicketArgs {
    pub quantity: u8,
    pub section: String,
    pub row: String,
    pub seat_start: u32,
}
