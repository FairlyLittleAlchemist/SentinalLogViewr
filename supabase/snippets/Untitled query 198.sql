DROP FUNCTION IF EXISTS match_alerts(vector, double precision, integer);                                                      
   
  CREATE FUNCTION match_alerts(                                                                                                  
    query_embedding vector(1536),                          
    match_threshold float,                                                                                                      
    match_count int                                        
  )
  RETURNS TABLE (
    id uuid,
    alert_title text,
    issue_summary text,
    category text,
    remediation_steps text,                                                                                                      
    containment_steps text,
    validation_steps text,                                                                                                      
    outcome text,                                          
    fingerprint text,
    similarity float
  )
  LANGUAGE sql STABLE
  AS $$
    SELECT
      id,
      alert_title,                                                                                                              
      issue_summary,
      category,                                                                                                                  
      remediation_steps,                                    
      containment_steps,
      validation_steps,
      outcome,
      fingerprint,
      1 - (embedding <=> query_embedding) AS similarity
    FROM alert_resolution_knowledge                                                                                              
    WHERE 1 - (embedding <=> query_embedding) > match_threshold
    ORDER BY similarity DESC                                                                                                    
    LIMIT match_count;                                      
  $$;