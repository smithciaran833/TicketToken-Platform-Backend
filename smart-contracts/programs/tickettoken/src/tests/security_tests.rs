#[cfg(test)]
mod tests {
    use crate::utils::reentrancy::ReentrancyGuard;
    use crate::utils::{safe_add, safe_mul, safe_div, calculate_fee};
    use crate::constants::*;
    use anchor_lang::prelude::*;

    #[test]
    fn test_reentrancy_guard_initialization() {
        let guard = ReentrancyGuard {
            is_locked: false,
            bump: 255,
        };
        
        assert!(!guard.is_locked);
        assert_eq!(guard.bump, 255);
    }

    #[test]
    fn test_reentrancy_lock_unlock() {
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
        
        // Test can lock again after unlock
        assert!(guard.lock().is_ok());
    }

    #[test]
    fn test_overflow_protection() {
        // Test safe_add
        assert!(safe_add(u64::MAX, 1).is_err());
        assert!(safe_add(100, 200).is_ok());
        
        // Test safe_mul
        assert!(safe_mul(u64::MAX, 2).is_err());
        assert!(safe_mul(100, 200).is_ok());
        
        // Test safe_div
        assert!(safe_div(100, 0).is_err());
        assert!(safe_div(100, 2).is_ok());
    }

    #[test]
    fn test_fee_calculation_overflow() {
        // Test fee calculation with large values
        let large_amount = u64::MAX / 10_000 - 1;
        let fee_bps = 250; // 2.5%
        
        // This should succeed
        assert!(calculate_fee(large_amount, fee_bps).is_ok());
        
        // This should overflow
        let too_large = u64::MAX / 100;
        assert!(calculate_fee(too_large, fee_bps).is_err());
    }

    #[test]
    fn test_price_validation_bounds() {
        use crate::utils::validation::*;
        
        // Test minimum price
        assert!(validate_price_bounds(MIN_TICKET_PRICE).is_ok());
        assert!(validate_price_bounds(MIN_TICKET_PRICE - 1).is_err());
        
        // Test maximum price  
        assert!(validate_price_bounds(MAX_TICKET_PRICE).is_ok());
        assert!(validate_price_bounds(MAX_TICKET_PRICE + 1).is_err());
    }

    #[test]
    fn test_event_time_validation() {
        use crate::utils::validation::*;
        
        let current_time = 1000000;
        let valid_start = current_time + 7200; // 2 hours from now
        let valid_end = valid_start + 3600; // 1 hour event
        
        // Valid times
        assert!(validate_event_times(valid_start, valid_end, current_time).is_ok());
        
        // Start time too soon
        let too_soon = current_time + 1800; // 30 minutes from now
        assert!(validate_event_times(too_soon, valid_end, current_time).is_err());
        
        // End before start
        assert!(validate_event_times(valid_end, valid_start, current_time).is_err());
        
        // Event too long
        let too_long_end = valid_start + (366 * 24 * 3600); // > 1 year
        assert!(validate_event_times(valid_start, too_long_end, current_time).is_err());
    }
}
