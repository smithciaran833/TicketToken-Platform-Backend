-- =============================================
-- Migration: Add Business Constraints and Foreign Key Indexes
-- Version: 009
-- Description: Adds business logic constraints and indexes for foreign keys
-- =============================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- PART 1: Business Logic Constraint Functions
-- =============================================

-- Validate ticket status transitions
CREATE OR REPLACE FUNCTION public.validate_ticket_status_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'DRAFT' AND NEW.status NOT IN ('MINTING','ACTIVE','CANCELLED') THEN
    RAISE EXCEPTION 'Invalid status transition from DRAFT to %', NEW.status;
  ELSIF OLD.status = 'MINTING' AND NEW.status NOT IN ('ACTIVE','FAILED') THEN
    RAISE EXCEPTION 'Invalid status transition from MINTING to %', NEW.status;
  ELSIF OLD.status = 'ACTIVE' AND NEW.status NOT IN ('LISTED','TRANSFERRED','REDEEMED','CANCELLED') THEN
    RAISE EXCEPTION 'Invalid status transition from ACTIVE to %', NEW.status;
  ELSIF OLD.status = 'REDEEMED' THEN
    RAISE EXCEPTION 'Cannot change status after ticket is REDEEMED';
  ELSIF OLD.status = 'CANCELLED' THEN
    RAISE EXCEPTION 'Cannot change status after ticket is CANCELLED';
  END IF;

  RETURN NEW;
END
$$;

-- Check ticket availability before insert
CREATE OR REPLACE FUNCTION public.check_ticket_availability()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_current_supply integer;
  v_max_supply     integer;
BEGIN
  SELECT current_supply, total_supply
    INTO v_current_supply, v_max_supply
  FROM public.ticket_types
  WHERE id = NEW.ticket_type_id;

  IF v_current_supply IS NULL OR v_max_supply IS NULL THEN
    RAISE EXCEPTION 'Unknown ticket_type %', NEW.ticket_type_id;
  END IF;

  IF v_current_supply >= v_max_supply THEN
    RAISE EXCEPTION 'No tickets available for this ticket type';
  END IF;

  RETURN NEW;
END
$$;

-- Prevent self purchase
CREATE OR REPLACE FUNCTION public.prevent_self_purchase()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_seller_id uuid;
BEGIN
  SELECT seller_id INTO v_seller_id
  FROM public.listings
  WHERE id = NEW.listing_id;

  IF v_seller_id IS NULL THEN
    RAISE EXCEPTION 'Listing % not found', NEW.listing_id;
  END IF;

  IF v_seller_id = NEW.buyer_id THEN
    RAISE EXCEPTION 'Cannot purchase your own listing';
  END IF;

  RETURN NEW;
END
$$;

-- Validate ticket ownership before listing
CREATE OR REPLACE FUNCTION public.validate_ticket_ownership()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_owner_id uuid;
BEGIN
  SELECT owner_id INTO v_owner_id
  FROM public.tickets
  WHERE id = NEW.ticket_id;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Ticket % not found', NEW.ticket_id;
  END IF;

  IF v_owner_id <> NEW.seller_id THEN
    RAISE EXCEPTION 'Cannot list ticket you do not own';
  END IF;

  RETURN NEW;
END
$$;

-- =============================================
-- PART 2: Business Logic Triggers
-- =============================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE t.tgname='trg_validate_ticket_status' AND n.nspname='public' AND c.relname='tickets'
  ) THEN
    CREATE TRIGGER trg_validate_ticket_status
      BEFORE UPDATE OF status ON public.tickets
      FOR EACH ROW
      WHEN (OLD.status IS DISTINCT FROM NEW.status)
      EXECUTE FUNCTION public.validate_ticket_status_transition();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE t.tgname='trg_check_ticket_availability' AND n.nspname='public' AND c.relname='tickets'
  ) THEN
    CREATE TRIGGER trg_check_ticket_availability
      BEFORE INSERT ON public.tickets
      FOR EACH ROW
      EXECUTE FUNCTION public.check_ticket_availability();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE t.tgname='trg_prevent_self_purchase' AND n.nspname='public' AND c.relname='offers'
  ) THEN
    CREATE TRIGGER trg_prevent_self_purchase
      BEFORE INSERT ON public.offers
      FOR EACH ROW
      EXECUTE FUNCTION public.prevent_self_purchase();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE t.tgname='trg_validate_ticket_ownership' AND n.nspname='public' AND c.relname='listings'
  ) THEN
    CREATE TRIGGER trg_validate_ticket_ownership
      BEFORE INSERT ON public.listings
      FOR EACH ROW
      EXECUTE FUNCTION public.validate_ticket_ownership();
  END IF;
END $$;

-- =============================================
-- PART 3: Foreign Key Indexes
-- =============================================

-- User foreign keys
CREATE INDEX IF NOT EXISTS idx_tickets_user_id ON public.tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_events_created_by ON public.events(created_by);
CREATE INDEX IF NOT EXISTS idx_venues_owner_id ON public.venues(owner_id);
CREATE INDEX IF NOT EXISTS idx_listings_seller_id ON public.listings(seller_id);
CREATE INDEX IF NOT EXISTS idx_offers_buyer_id ON public.offers(buyer_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON public.transactions(user_id);

-- Venue foreign keys
CREATE INDEX IF NOT EXISTS idx_events_venue_id ON public.events(venue_id);
CREATE INDEX IF NOT EXISTS idx_sections_venue_id ON public.sections(venue_id);
CREATE INDEX IF NOT EXISTS idx_amenities_venues_venue_id ON public.amenities_venues(venue_id);

-- Event foreign keys
CREATE INDEX IF NOT EXISTS idx_tickets_event_id ON public.tickets(event_id);
CREATE INDEX IF NOT EXISTS idx_ticket_types_event_id ON public.ticket_types(event_id);
CREATE INDEX IF NOT EXISTS idx_event_analytics_event_id ON public.event_analytics(event_id);

-- Ticket foreign keys
CREATE INDEX IF NOT EXISTS idx_tickets_ticket_type_id ON public.tickets(ticket_type_id);
CREATE INDEX IF NOT EXISTS idx_ticket_transfers_ticket_id ON public.ticket_transfers(ticket_id);
CREATE INDEX IF NOT EXISTS idx_listings_ticket_id ON public.listings(ticket_id);

-- Order foreign keys
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_ticket_id ON public.order_items(ticket_id);
CREATE INDEX IF NOT EXISTS idx_orders_payment_id ON public.orders(payment_id);

-- Transaction foreign keys
CREATE INDEX IF NOT EXISTS idx_transactions_order_id ON public.transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_methods_user_id ON public.payment_methods(user_id);

-- Marketplace foreign keys
CREATE INDEX IF NOT EXISTS idx_offers_listing_id ON public.offers(listing_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_transactions_listing_id ON public.marketplace_transactions(listing_id);

-- Record migration
INSERT INTO public.schema_migrations (version, name)
VALUES (9, '009_add_business_constraints.sql')
ON CONFLICT (version) DO NOTHING;
