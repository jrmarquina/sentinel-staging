-- ─── 029_notifications_realtime.sql ──────────────────────────────────────────
-- Enable Supabase Realtime for the notifications table so that
-- postgres_changes subscriptions in useNotifications.ts receive INSERT events.
-- Without this the notification bell silently receives nothing.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
