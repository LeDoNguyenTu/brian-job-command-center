update public.discovery_sources
set adapter = 'manatal',
    source_class = 'direct_structured',
    detector_confidence = greatest(detector_confidence, 0.99),
    fingerprint_evidence = case
      when coalesce(fingerprint_evidence, '[]'::jsonb) @> '["host:manatal"]'::jsonb then fingerprint_evidence
      else coalesce(fingerprint_evidence, '[]'::jsonb) || '["host:manatal"]'::jsonb
    end,
    updated_at = now()
where provider = 'manatal'
  and adapter is distinct from 'manatal';
