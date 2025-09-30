use anchor_lang::prelude::*;
use crate::errors::MarketplaceError;

#[account]
#[derive(InitSpace)]
pub struct ReentrancyGuard {
    pub is_locked: bool,
    pub bump: u8,
}

impl ReentrancyGuard {
    pub fn lock(&mut self) -> Result<()> {
        require!(!self.is_locked, MarketplaceError::ReentrancyLocked);
        self.is_locked = true;
        Ok(())
    }

    pub fn unlock(&mut self) -> Result<()> {
        self.is_locked = false;
        Ok(())
    }
}

/// Seeds for deriving reentrancy guard PDA
pub fn reentrancy_seeds(listing: &Pubkey) -> Vec<Vec<u8>> {
    vec![
        b"reentrancy".to_vec(),
        listing.as_ref().to_vec(),
    ]
}
