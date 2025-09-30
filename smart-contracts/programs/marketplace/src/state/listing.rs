use crate::errors::MarketplaceError;
use anchor_lang::prelude::*;

#[account]
pub struct Listing {
    pub seller: Pubkey,            // 32 bytes - current owner
    pub event: Pubkey,             // 32 bytes - event account
    pub ticket_asset_id: Pubkey,   // 32 bytes - compressed NFT asset ID
    pub price: u64,                // 8 bytes - asking price
    pub original_price: u64,       // 8 bytes - original ticket price
    pub listed_at: i64,            // 8 bytes - Unix timestamp
    pub expires_at: i64,           // 8 bytes - Unix timestamp
    pub active: bool,              // 1 byte - available for purchase
    pub bump: u8,                  // 1 byte
}

impl Listing {
    pub const SIZE: usize = 32 + 32 + 32 + 8 + 8 + 8 + 8 + 1 + 1;
    
    
    pub fn validate_price_cap(&self) -> Result<()> {
        // 110% max markup
        let max_price = self.original_price
            .checked_mul(110)
            .ok_or(error!(MarketplaceError::MathOverflow))?
            .checked_div(100)
            .ok_or(error!(MarketplaceError::MathOverflow))?;
            
        require!(
            self.price <= max_price,
            MarketplaceError::PriceCapExceeded
        );
        Ok(())
    }
}

impl Listing {
    pub const LEN: usize = 8 + 32 + 32 + 32 + 8 + 8 + 8 + 8 + 1;
    
    pub fn is_within_price_cap(&self) -> bool {
        // Calculate 110% of original price
        let max_price = (self.original_price as u128)
            .saturating_mul(110)
            .saturating_div(100) as u64;
        
        self.price <= max_price
    }
    
    pub fn is_expired(&self, current_timestamp: i64) -> bool {
        current_timestamp > self.expires_at
    }
}
