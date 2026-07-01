SELECT alert_title, category, CASE WHEN embedding IS NULL THEN 'NEEDS VECTORIZING' ELSE 'HAS VECTOR' END AS vector_status FROM
  alert_resolution_knowledge;