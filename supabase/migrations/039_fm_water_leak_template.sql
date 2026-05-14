-- Seed: Water Leak Inspection template with branching logic and STOPLIGHT urgency
-- Fields use stable short IDs that become the `key` on fm_checklist_item_responses

INSERT INTO fm_inspection_templates (id, org_id, name, description, json_schema)
VALUES (
  '10000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'Water Leak Inspection',
  'Branching inspection for active water leaks — covers water damage, mold, structural impact, property/contents damage, cleanup needs, and safety risks.',
  '{
    "fields": [
      {
        "id": "wl01",
        "label": "Is there evidence of an active water leak?",
        "type": "YES_NO"
      },
      {
        "id": "wl02",
        "label": "Describe the location and source of the leak",
        "type": "TEXT",
        "show_if": { "field": "wl01", "answer": "YES" }
      },
      {
        "id": "wl03",
        "label": "Is there visible water damage to surfaces (walls, ceiling, floor)?",
        "type": "YES_NO",
        "show_if": { "field": "wl01", "answer": "YES" }
      },
      {
        "id": "wl04",
        "label": "Is there mold or mildew present?",
        "type": "YES_NO",
        "show_if": { "field": "wl03", "answer": "YES" }
      },
      {
        "id": "wl05",
        "label": "Estimate the mold coverage area (e.g. 2 sq ft on drywall)",
        "type": "TEXT",
        "show_if": { "field": "wl04", "answer": "YES" }
      },
      {
        "id": "wl06",
        "label": "Is there structural damage (framing, subflooring, load-bearing elements)?",
        "type": "YES_NO",
        "show_if": { "field": "wl03", "answer": "YES" }
      },
      {
        "id": "wl07",
        "label": "Describe the structural damage observed",
        "type": "TEXT",
        "show_if": { "field": "wl06", "answer": "YES" }
      },
      {
        "id": "wl08",
        "label": "Is there damage to property or contents (furniture, equipment, documents)?",
        "type": "YES_NO",
        "show_if": { "field": "wl01", "answer": "YES" }
      },
      {
        "id": "wl09",
        "label": "Describe the damaged property or contents",
        "type": "TEXT",
        "show_if": { "field": "wl08", "answer": "YES" }
      },
      {
        "id": "wl10",
        "label": "Is cleanup or remediation required?",
        "type": "YES_NO",
        "show_if": { "field": "wl01", "answer": "YES" }
      },
      {
        "id": "wl11",
        "label": "Describe the scope of cleanup or remediation needed",
        "type": "TEXT",
        "show_if": { "field": "wl10", "answer": "YES" }
      },
      {
        "id": "wl12",
        "label": "Has the water source been shut off or contained?",
        "type": "YES_NO",
        "show_if": { "field": "wl01", "answer": "YES" }
      },
      {
        "id": "wl13",
        "label": "Is there standing water present?",
        "type": "YES_NO",
        "show_if": { "field": "wl01", "answer": "YES" }
      },
      {
        "id": "wl14",
        "label": "Estimate the standing water area or volume",
        "type": "TEXT",
        "show_if": { "field": "wl13", "answer": "YES" }
      },
      {
        "id": "wl15",
        "label": "Overall urgency assessment",
        "type": "STOPLIGHT",
        "show_if": { "field": "wl01", "answer": "YES" }
      },
      {
        "id": "wl16",
        "label": "Have facilities maintenance or utilities been notified?",
        "type": "YES_NO",
        "show_if": { "field": "wl01", "answer": "YES" }
      },
      {
        "id": "wl17",
        "label": "List recommended immediate actions",
        "type": "TEXT",
        "show_if": { "field": "wl01", "answer": "YES" }
      },
      {
        "id": "wl18",
        "label": "Additional inspection notes",
        "type": "TEXT",
        "show_if": { "field": "wl01", "answer": "YES" }
      },
      {
        "id": "wl19",
        "label": "Is there a slip/fall risk in the affected area?",
        "type": "YES_NO"
      }
    ]
  }'
)
ON CONFLICT (id) DO UPDATE
  SET name        = EXCLUDED.name,
      description = EXCLUDED.description,
      json_schema = EXCLUDED.json_schema,
      updated_at  = NOW();
