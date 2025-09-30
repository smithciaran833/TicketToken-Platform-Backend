use anchor_lang::prelude::*;

#[error_code]
pub enum MarketplaceError {
    #[msg("Marketplace is paused")]
    MarketplacePaused,
    
    #[msg("Listing has expired")]
    ListingExpired,
    
    #[msg("Listing is not active")]
    ListingNotActive,
    
    #[msg("Price exceeds 110% cap")]
    PriceCapExceeded,
    
    #[msg("Invalid expiry time")]
    InvalidExpiry,
    
    #[msg("Unauthorized access")]
    Unauthorized,
    
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Operation locked due to reentrancy")]
    ReentrancyLocked,
    
    #[msg("Insufficient funds")]
    InsufficientFunds,
}
