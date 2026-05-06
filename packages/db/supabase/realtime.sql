-- Enable Supabase Realtime for the dashboard's live-update feed.
--
-- Run this ONCE in Supabase SQL Editor (Dashboard → SQL Editor → New
-- query → paste → Run). It adds two tables to the supabase_realtime
-- publication so the LiveBadge component receives postgres_changes
-- events when a Vapi webhook inserts a call or a tool webhook books
-- an appointment.

ALTER PUBLICATION supabase_realtime ADD TABLE calls;
ALTER PUBLICATION supabase_realtime ADD TABLE appointments;

-- Sanity check — the SELECT below should list both tables.
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;
