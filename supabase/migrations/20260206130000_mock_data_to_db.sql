create or replace function public.has_role(roles text[])
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = any(roles)
  );
$$;

create table if not exists public.alerts (
  id text primary key,
  title text not null,
  severity text not null check (severity in ('critical', 'high', 'medium', 'low')),
  status text not null check (status in ('new', 'in_progress', 'resolved', 'dismissed')),
  source text not null,
  timestamp timestamptz not null,
  description text not null,
  assignee text,
  tactics text[] not null,
  affected_entities text[] not null,
  recommended_actions text[] not null
);

create table if not exists public.logs (
  id text primary key,
  timestamp timestamptz not null,
  severity text not null check (severity in ('critical', 'high', 'medium', 'low', 'informational')),
  source text not null,
  category text not null,
  message text not null,
  ip_address text not null,
  "user" text not null,
  status text not null check (status in ('new', 'investigating', 'resolved', 'dismissed'))
);

create table if not exists public.recommendations (
  id text primary key,
  title text not null,
  priority text not null check (priority in ('critical', 'high', 'medium', 'low')),
  category text not null,
  description text not null,
  impact text not null,
  effort text not null check (effort in ('low', 'medium', 'high')),
  status text not null check (status in ('pending', 'in_progress', 'completed')),
  related_alerts text[] not null
);

create table if not exists public.threat_metrics (
  label text primary key,
  value numeric not null,
  change numeric not null,
  change_type text not null check (change_type in ('increase', 'decrease'))
);

create table if not exists public.alert_time_series (
  id bigserial primary key,
  time text not null,
  critical int not null,
  high int not null,
  medium int not null,
  low int not null
);

create table if not exists public.severity_distribution (
  name text primary key,
  value int not null,
  fill text not null
);

create table if not exists public.attack_sources (
  country text primary key,
  count int not null,
  percentage numeric not null
);

alter table public.alerts enable row level security;
alter table public.logs enable row level security;
alter table public.recommendations enable row level security;
alter table public.threat_metrics enable row level security;
alter table public.alert_time_series enable row level security;
alter table public.severity_distribution enable row level security;
alter table public.attack_sources enable row level security;

drop policy if exists "alerts_read_authenticated" on public.alerts;
create policy "alerts_read_authenticated"
on public.alerts
for select
using (auth.uid() is not null);

drop policy if exists "alerts_update_admin_analyst" on public.alerts;
create policy "alerts_update_admin_analyst"
on public.alerts
for update
using (public.has_role(array['admin','analyst']))
with check (public.has_role(array['admin','analyst']));

drop policy if exists "logs_read_authenticated" on public.logs;
create policy "logs_read_authenticated"
on public.logs
for select
using (auth.uid() is not null);

drop policy if exists "recommendations_read_authenticated" on public.recommendations;
create policy "recommendations_read_authenticated"
on public.recommendations
for select
using (auth.uid() is not null);

drop policy if exists "recommendations_update_admin_analyst" on public.recommendations;
create policy "recommendations_update_admin_analyst"
on public.recommendations
for update
using (public.has_role(array['admin','analyst']))
with check (public.has_role(array['admin','analyst']));

drop policy if exists "threat_metrics_read_authenticated" on public.threat_metrics;
create policy "threat_metrics_read_authenticated"
on public.threat_metrics
for select
using (auth.uid() is not null);

drop policy if exists "alert_time_series_read_authenticated" on public.alert_time_series;
create policy "alert_time_series_read_authenticated"
on public.alert_time_series
for select
using (auth.uid() is not null);

drop policy if exists "severity_distribution_read_authenticated" on public.severity_distribution;
create policy "severity_distribution_read_authenticated"
on public.severity_distribution
for select
using (auth.uid() is not null);

drop policy if exists "attack_sources_read_authenticated" on public.attack_sources;
create policy "attack_sources_read_authenticated"
on public.attack_sources
for select
using (auth.uid() is not null);

insert into public.threat_metrics (label, value, change, change_type) values
  ('Total Alerts', 1247, 12.5, 'increase'),
  ('Critical Incidents', 23, 8.3, 'increase'),
  ('Active Investigations', 47, 3.1, 'decrease'),
  ('Mean Response Time', 4.2, 15.7, 'decrease')
on conflict (label) do nothing;

insert into public.alert_time_series (time, critical, high, medium, low) values
  ('00:00', 2, 8, 15, 25),
  ('02:00', 1, 6, 12, 20),
  ('04:00', 3, 10, 18, 22),
  ('06:00', 5, 14, 22, 30),
  ('08:00', 8, 20, 35, 45),
  ('10:00', 12, 25, 40, 52),
  ('12:00', 10, 22, 38, 48),
  ('14:00', 7, 18, 30, 42),
  ('16:00', 9, 21, 34, 46),
  ('18:00', 6, 15, 28, 38),
  ('20:00', 4, 12, 22, 32),
  ('22:00', 3, 9, 16, 28)
on conflict do nothing;

insert into public.severity_distribution (name, value, fill) values
  ('Critical', 23, 'hsl(0, 72%, 51%)'),
  ('High', 156, 'hsl(38, 92%, 50%)'),
  ('Medium', 432, 'hsl(199, 89%, 48%)'),
  ('Low', 636, 'hsl(142, 71%, 45%)')
on conflict (name) do nothing;

insert into public.attack_sources (country, count, percentage) values
  ('Russia', 342, 27.4),
  ('China', 287, 23.0),
  ('North Korea', 156, 12.5),
  ('Iran', 98, 7.9),
  ('Unknown', 364, 29.2)
on conflict (country) do nothing;

insert into public.alerts (id, title, severity, status, source, timestamp, description, assignee, tactics, affected_entities, recommended_actions) values
  ('ALT-001', 'Brute Force Attack Detected on Azure AD', 'critical', 'new', 'Azure Active Directory', '2026-02-06T14:23:00Z', 'Multiple failed login attempts detected from IP 185.220.101.34 targeting admin accounts. Over 500 attempts in the last 30 minutes.', null, array['Credential Access','Initial Access'], array['admin@contoso.com','globaladmin@contoso.com'], array['Block the source IP address immediately','Reset passwords for targeted accounts','Enable MFA for all admin accounts','Review sign-in logs for successful authentications']),
  ('ALT-002', 'Suspicious PowerShell Execution on Server-DC01', 'critical', 'in_progress', 'Microsoft Defender for Endpoint', '2026-02-06T13:45:00Z', 'Encoded PowerShell command detected executing on domain controller. Command appears to be downloading and executing a remote payload.', 'Sarah Chen', array['Execution','Defense Evasion'], array['Server-DC01','SYSTEM account'], array['Isolate the affected server from the network','Capture memory dump for forensic analysis','Review scheduled tasks and startup items','Scan all domain controllers for similar activity']),
  ('ALT-003', 'Data Exfiltration Attempt via DNS Tunneling', 'high', 'in_progress', 'Azure Firewall', '2026-02-06T12:30:00Z', 'Unusual DNS query patterns detected from workstation WS-FIN-042. Large volume of DNS TXT queries to suspicious domain suggesting data exfiltration via DNS tunneling.', 'Marcus Johnson', array['Exfiltration','Command and Control'], array['WS-FIN-042','user.finance@contoso.com'], array['Block the suspicious DNS domain','Isolate the affected workstation','Investigate the user account for compromise','Deploy DNS monitoring rules']),
  ('ALT-004', 'Privilege Escalation via Service Account', 'high', 'new', 'Azure Active Directory', '2026-02-06T11:15:00Z', 'Service account svc-backup was added to Domain Admins group. This change was made outside of normal change management procedures.', null, array['Privilege Escalation','Persistence'], array['svc-backup','Domain Admins group'], array['Remove the service account from Domain Admins immediately','Audit all recent changes to privileged groups','Review the service account activity logs','Implement Just-In-Time access for admin privileges']),
  ('ALT-005', 'Malware Communication Detected', 'high', 'resolved', 'Microsoft Defender for Endpoint', '2026-02-06T09:00:00Z', 'Known command-and-control server communication detected from workstation WS-MKT-018. Matches Cobalt Strike beacon pattern.', 'Sarah Chen', array['Command and Control'], array['WS-MKT-018','user.marketing@contoso.com'], array['Isolate the affected workstation','Run full antimalware scan','Check for lateral movement to other systems','Block C2 indicators at the firewall level']),
  ('ALT-006', 'Anomalous Azure Resource Deployment', 'medium', 'new', 'Azure Activity Logs', '2026-02-06T08:20:00Z', 'Multiple virtual machines deployed in an unusual region (East Asia) by a developer account that typically operates in West US.', null, array['Resource Hijacking'], array['dev-team@contoso.com','Azure Subscription: Prod-01'], array['Verify with the developer if this deployment was intentional','Review the deployed resources for cryptomining indicators','Implement Azure Policy to restrict deployment regions','Enable cost alerts for the subscription']),
  ('ALT-007', 'Unusual Sign-in from TOR Exit Node', 'medium', 'dismissed', 'Azure Active Directory', '2026-02-06T07:10:00Z', 'Successful sign-in detected from a known TOR exit node IP address for user research@contoso.com.', 'Marcus Johnson', array['Initial Access'], array['research@contoso.com'], array['Verify with the user if the sign-in was legitimate','Implement conditional access policies blocking TOR IPs','Review the user''s recent activity for anomalies','Consider risk-based conditional access policies']),
  ('ALT-008', 'Failed Key Vault Access Attempts', 'low', 'resolved', 'Azure Key Vault', '2026-02-06T05:45:00Z', 'Multiple failed attempts to access secrets in the production Key Vault from an unrecognized application identity.', 'Sarah Chen', array['Credential Access'], array['kv-prod-secrets','app-unknown-identity'], array['Review Key Vault access policies','Identify the unrecognized application','Enable soft delete and purge protection','Set up alerts for Key Vault access patterns'])
on conflict (id) do nothing;

insert into public.logs (id, timestamp, severity, source, category, message, ip_address, "user", status) values
  ('LOG-001', '2026-02-06T14:23:15Z', 'critical', 'Azure AD', 'SignInLogs', 'Multiple failed sign-in attempts from IP 185.220.101.34 targeting admin@contoso.com', '185.220.101.34', 'admin@contoso.com', 'new'),
  ('LOG-002', '2026-02-06T14:22:45Z', 'critical', 'Defender for Endpoint', 'SecurityAlert', 'Encoded PowerShell execution detected: powershell -enc JABjAGwA...', '10.0.1.50', 'SYSTEM', 'investigating'),
  ('LOG-003', '2026-02-06T14:20:30Z', 'high', 'Azure Firewall', 'NetworkRule', 'DNS tunneling pattern detected - high volume TXT queries to susp-domain.xyz', '10.0.5.42', 'user.finance@contoso.com', 'investigating'),
  ('LOG-004', '2026-02-06T14:18:00Z', 'high', 'Azure AD', 'AuditLogs', 'Service account svc-backup added to Domain Admins group', '10.0.1.10', 'unknown', 'new'),
  ('LOG-005', '2026-02-06T14:15:22Z', 'medium', 'Azure Activity', 'Administrative', '10 virtual machines deployed in East Asia region by dev-team@contoso.com', '203.0.113.50', 'dev-team@contoso.com', 'new'),
  ('LOG-006', '2026-02-06T14:12:00Z', 'medium', 'Azure AD', 'SignInLogs', 'Successful sign-in from TOR exit node 198.51.100.23', '198.51.100.23', 'research@contoso.com', 'resolved'),
  ('LOG-007', '2026-02-06T14:10:30Z', 'low', 'Key Vault', 'AuditEvent', 'Failed GET secret attempt on kv-prod-secrets by unrecognized identity', '10.0.2.100', 'app-unknown-identity', 'resolved'),
  ('LOG-008', '2026-02-06T14:08:15Z', 'informational', 'Azure AD', 'SignInLogs', 'Successful MFA verification for globaladmin@contoso.com', '192.168.1.100', 'globaladmin@contoso.com', 'resolved'),
  ('LOG-009', '2026-02-06T14:05:00Z', 'low', 'Azure Firewall', 'ApplicationRule', 'Outbound connection to known scanning service from WS-DEV-003', '10.0.3.15', 'dev-user@contoso.com', 'new'),
  ('LOG-010', '2026-02-06T14:02:00Z', 'informational', 'Azure Activity', 'Policy', 'Azure Policy compliance check completed - 98.2% compliant', 'N/A', 'system', 'resolved')
on conflict (id) do nothing;

insert into public.recommendations (id, title, priority, category, description, impact, effort, status, related_alerts) values
  ('REC-001', 'Enable Multi-Factor Authentication for All Users', 'critical', 'Identity Protection', 'Only 67% of users have MFA enabled. This leaves accounts vulnerable to credential-based attacks, which account for 45% of current alerts.', 'Would reduce credential-based alerts by approximately 99.9%', 'medium', 'pending', array['ALT-001','ALT-007']),
  ('REC-002', 'Implement Network Segmentation for Critical Servers', 'high', 'Network Security', 'Domain controllers and key infrastructure servers are accessible from the general network. Lateral movement from compromised workstations is trivial.', 'Would contain 80% of endpoint-originating attacks to their network segment', 'high', 'in_progress', array['ALT-002','ALT-005']),
  ('REC-003', 'Deploy DNS Security Extensions (DNSSEC)', 'high', 'Network Security', 'Current DNS infrastructure lacks DNSSEC validation, making it vulnerable to DNS-based attacks including tunneling and poisoning.', 'Would detect and block 95% of DNS-based exfiltration attempts', 'medium', 'pending', array['ALT-003']),
  ('REC-004', 'Implement Privileged Access Management (PAM)', 'high', 'Identity Protection', 'Service accounts have persistent elevated privileges. Implementing PAM with just-in-time access would significantly reduce the attack surface.', 'Would eliminate 90% of privilege escalation attack vectors', 'high', 'pending', array['ALT-004']),
  ('REC-005', 'Configure Azure Policy for Region Restrictions', 'medium', 'Cloud Governance', 'Resources can be deployed in any Azure region. Restricting deployment to approved regions prevents unauthorized resource provisioning.', 'Would prevent resource hijacking and cryptomining in unauthorized regions', 'low', 'completed', array['ALT-006']),
  ('REC-006', 'Enable Advanced Threat Protection for Key Vaults', 'medium', 'Data Protection', 'Key Vaults lack advanced threat detection. Enabling ATP would provide alerts for unusual access patterns and potential credential theft.', 'Would detect unauthorized Key Vault access within minutes', 'low', 'pending', array['ALT-008'])
on conflict (id) do nothing;
