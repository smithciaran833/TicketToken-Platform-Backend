use anchor_lang::prelude::*;
use mpl_bubblegum::types::{MetadataArgs, TokenStandard, Collection, Creator, Uses, UseMethod, TokenProgramVersion};
use crate::state::Event;

/// Create ticket metadata for compressed NFT
pub fn create_ticket_metadata(
    event: &Event,
    ticket_number: u32,
    _section: &str,
    _row: &str,
    _seat: &str,
) -> MetadataArgs {
    MetadataArgs {
        name: format!("Ticket #{} - {}", ticket_number, std::str::from_utf8(&event.name).unwrap_or("Event")),
        symbol: "TKT".to_string(),
        uri: format!("{}/tickets/{}", std::str::from_utf8(&event.metadata_uri).unwrap_or(""), ticket_number),
        seller_fee_basis_points: 500, // 5% royalty on resales
        primary_sale_happened: true,
        is_mutable: false,
        edition_nonce: None,
        token_standard: Some(TokenStandard::NonFungible),
        collection: Some(Collection {
            verified: false,
            key: event.venue,
        }),
        uses: Some(Uses {
            use_method: UseMethod::Single,
            remaining: 1,
            total: 1,
        }),
        token_program_version: TokenProgramVersion::Original,
        creators: vec![
            Creator {
                address: event.venue,
                verified: false,
                share: 100,
            }
        ],
    }
}

/// Derive asset ID for a compressed NFT
pub fn get_asset_id(tree: &Pubkey, nonce: u64) -> Pubkey {
    Pubkey::find_program_address(
        &[
            b"asset",
            tree.as_ref(),
            &nonce.to_le_bytes(),
        ],
        &mpl_bubblegum::ID,
    ).0
}
