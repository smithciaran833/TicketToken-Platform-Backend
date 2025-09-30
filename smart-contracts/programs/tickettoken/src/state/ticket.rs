use anchor_lang::prelude::*;
use anchor_lang::solana_program::keccak;

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
        let serialized = self.try_to_vec().map_err(|_| ProgramError::BorshIoError("Serialization failed".to_string()))?;
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
