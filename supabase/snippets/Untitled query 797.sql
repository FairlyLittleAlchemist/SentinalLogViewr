SELECT *
FROM alerts
JOIN incidents 
ON alerts.incident_id = incidents.id;