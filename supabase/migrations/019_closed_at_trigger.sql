-- Auto-set closed_at when work order status transitions to/from 'closed'
CREATE OR REPLACE FUNCTION set_work_order_closed_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Transitioning TO closed: stamp closed_at if not already set
  IF NEW.status = 'closed' AND (OLD.status IS DISTINCT FROM 'closed') THEN
    NEW.closed_at = COALESCE(NEW.closed_at, NOW());

  -- Transitioning AWAY from closed: clear closed_at
  ELSIF OLD.status = 'closed' AND NEW.status != 'closed' THEN
    NEW.closed_at = NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_work_order_closed_at ON work_orders;
CREATE TRIGGER trg_work_order_closed_at
  BEFORE UPDATE ON work_orders
  FOR EACH ROW
  EXECUTE FUNCTION set_work_order_closed_at();

-- Back-fill: stamp any already-closed orders that are missing closed_at
UPDATE work_orders
SET closed_at = updated_at
WHERE status = 'closed'
  AND closed_at IS NULL
  AND deleted_at IS NULL;
