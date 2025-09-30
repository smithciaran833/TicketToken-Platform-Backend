#[cfg(test)]
mod tests {
    use crate::state::{Listing, MarketplaceConfig};
    use anchor_lang::prelude::*;

    #[test]
    fn test_listing_state_size() {
        // Verify the Listing account size matches our calculation
        assert_eq!(Listing::LEN, 8 + 32 + 32 + 32 + 8 + 8 + 8 + 8 + 1);
        assert_eq!(Listing::LEN, 137);
    }

    #[test]
    fn test_listing_validation() {
        let listing = Listing {
            seller: Pubkey::new_unique(),
            event: Pubkey::new_unique(),
            ticket_asset_id: Pubkey::new_unique(),
            price: 55_000_000_000, // 55 SOL
            original_price: 50_000_000_000, // 50 SOL
            listed_at: 1000,
            expires_at: 2000,
            active: true,
            bump: 255,
        };

        // Test price cap validation (110% max)
        assert!(listing.is_within_price_cap());
        
        // Test expiry check
        assert!(!listing.is_expired(1500));
        assert!(listing.is_expired(2001));
    }

    #[test]
    fn test_price_cap_enforcement() {
        let mut listing = Listing {
            seller: Pubkey::new_unique(),
            event: Pubkey::new_unique(),
            ticket_asset_id: Pubkey::new_unique(),
            price: 60_000_000_000, // 60 SOL (120% of original)
            original_price: 50_000_000_000, // 50 SOL
            listed_at: 1000,
            expires_at: 2000,
            active: true,
            bump: 255,
        };

        // Should fail - exceeds 110% cap
        assert!(!listing.is_within_price_cap());
        
        // Exactly at cap should pass
        listing.price = 55_000_000_000; // 110% of 50 SOL
        assert!(listing.is_within_price_cap());
    }

    #[test]
    fn test_marketplace_config() {
        let marketplace = MarketplaceConfig {
            authority: Pubkey::new_unique(),
            fee_bps: 750, // 7.5%
            paused: false,
            total_listings: 0,
            total_sales: 0,
            total_volume: 0,
            treasury: Pubkey::new_unique(),
            bump: 255,
        };

        assert_eq!(marketplace.fee_bps, 750);
        assert!(!marketplace.paused);
        assert_eq!(marketplace.total_sales, 0);
    }

    #[test]
    fn test_fee_calculations() {
        let price = 100_000_000_000; // 100 SOL
        let marketplace_fee_bps = 750; // 7.5%
        
        // Calculate marketplace fee
        let marketplace_fee = (price * marketplace_fee_bps as u64) / 10_000;
        assert_eq!(marketplace_fee, 7_500_000_000); // 7.5 SOL
        
        // Calculate venue royalty (5%)
        let venue_royalty = (price * 500) / 10_000;
        assert_eq!(venue_royalty, 5_000_000_000); // 5 SOL
        
        // Calculate seller amount
        let seller_amount = price - marketplace_fee - venue_royalty;
        assert_eq!(seller_amount, 87_500_000_000); // 97.5 SOL
    }
}

    #[test]
    fn test_reentrancy_guard() {
        use crate::utils::ReentrancyGuard;
        
        let mut guard = ReentrancyGuard {
            is_locked: false,
            bump: 255,
        };
        
        // Test locking
        assert!(guard.lock().is_ok());
        assert!(guard.is_locked);
        
        // Test double lock fails
        assert!(guard.lock().is_err());
        
        // Test unlock
        assert!(guard.unlock().is_ok());
        assert!(!guard.is_locked);
    }
