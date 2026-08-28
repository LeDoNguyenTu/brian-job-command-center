update public.discovery_sources
set adapter = 'manatal',
    source_class = 'direct_structured',
    detector_confidence = greatest(detector_confidence, 0.99),
    fingerprint_evidence = case
      when fingerprint_evidence @> array['host:manatal']::text[] then fingerprint_evidence
      else fingerprint_evidence || array['host:manatal']::text[]
    end,
    updated_at = now()
where provider = 'manatal'
  and adapter is distinct from 'manatal';
