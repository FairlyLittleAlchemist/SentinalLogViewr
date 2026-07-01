UPDATE alert_resolution_knowledge                                                                                              
  SET category = CASE                                                                                                            
      WHEN alert_title ILIKE '%brute force%'     THEN 'credential_attack'                                                        
      WHEN alert_title ILIKE '%anomalous%'        THEN 'identity_threat'                                                        
      WHEN alert_title ILIKE '%sign in%'          THEN 'identity_threat'                                                        
      WHEN alert_title ILIKE '%traffic%forward%'  THEN 'network_threat'                                                          
      WHEN alert_title ILIKE '%local%deny%'       THEN 'access_control'                                                          
      WHEN alert_title ILIKE '%credential%theft%' THEN 'credential_attack'                                                      
      ELSE 'unknown'                                                                                                            
  END;                