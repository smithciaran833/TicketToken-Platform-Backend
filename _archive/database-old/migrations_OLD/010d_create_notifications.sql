-- Minimal notifications table used by 011_create_views.sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.notifications (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v1(),
  user_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status     varchar(20) NOT NULL DEFAULT 'SENT',  -- 'SENT', 'READ', etc.
  title      text,
  body       text,
  created_at timestamptz DEFAULT CURRENT_TIMESTAMP,
  read_at    timestamptz
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_status ON public.notifications(user_id, status);
