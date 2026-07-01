 SELECT
      alert_title,                                                                                                              
      category,                                            
      CASE WHEN embedding IS NULL THEN 'MISSING ❌' ELSE 'VECTORIZED ✓' END AS vector_status,
      LEFT(remediation_steps::text, 80) AS remediation_preview                                                                  
  FROM alert_resolution_knowledge                                                                                                
  ORDER BY created_at;               