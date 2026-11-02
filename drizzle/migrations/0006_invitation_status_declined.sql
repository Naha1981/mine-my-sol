-- Separate migration on purpose: ALTER TYPE ... ADD VALUE must not share a
-- transaction with statements that use the new value (PostgreSQL enum semantics).
ALTER TYPE public.invitation_status ADD VALUE IF NOT EXISTS 'declined';
