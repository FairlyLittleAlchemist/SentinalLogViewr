// Mock data for Azure Sentinel Log Management

export interface LogEntry {
  id: string
  timestamp: string
  severity: "critical" | "high" | "medium" | "low" | "informational"
  source: string
  category: string
  message: string
  ipAddress: string
  user: string
  status: "new" | "investigating" | "resolved" | "dismissed"
  payloadRaw?: string | null
  payloadJson?: Record<string, unknown> | null
  provider?: string | null
  eventCode?: string | null
  eventName?: string | null
  actor?: string | null
  resource?: string | null
  sourceFile?: string | null
  payloadKind?: "json" | "xml" | "kv" | "text" | "empty"
  summary?: string
  parsedFieldsPreview?: Array<{ key: string; label: string; value: string }>
}

export interface Alert {
  id: string
  title: string
  severity: "critical" | "high" | "medium" | "low"
  status: "new" | "in_progress" | "resolved" | "dismissed"
  source: string
  timestamp: string
  description: string
  assignee: string | null
  tactics: string[]
  affectedEntities: string[]
  recommendedActions: string[]
  payloadRaw?: string | null
  payloadJson?: Record<string, unknown> | null
  provider?: string | null
  category?: string | null
  eventCode?: string | null
  eventName?: string | null
  actor?: string | null
  resource?: string | null
  ipAddress?: string | null
  sourceFile?: string | null
  payloadKind?: "json" | "xml" | "kv" | "text" | "empty"
  summary?: string
  parsedFieldsPreview?: Array<{ key: string; label: string; value: string }>
}

export interface ThreatMetric {
  label: string
  value: number
  change: number
  changeType: "increase" | "decrease"
}

export interface TimeSeriesPoint {
  time: string
  critical: number
  high: number
  medium: number
  low: number
}

export type RecommendationPriority = "critical" | "high" | "medium" | "low"
export type RecommendationEffort = "low" | "medium" | "high"
export type RecommendationStatus = "pending" | "in_progress" | "completed"

export interface Recommendation {
  id: string
  title: string
  priority: RecommendationPriority
  category: string
  description: string
  impact: string
  effort: RecommendationEffort
  status: RecommendationStatus
  relatedAlerts: string[]
}

export interface SeverityDistributionEntry {
  name: string
  value: number
  fill: string
}

export interface AttackSource {
  country: string
  count: number
  percentage: number
}

export const threatMetrics: ThreatMetric[] = [
  { label: "Total Alerts", value: 1247, change: 12.5, changeType: "increase" },
  { label: "Critical Incidents", value: 23, change: 8.3, changeType: "increase" },
  { label: "Active Investigations", value: 47, change: 3.1, changeType: "decrease" },
  { label: "Mean Response Time", value: 4.2, change: 15.7, changeType: "decrease" },
]

export const alertTimeSeries: TimeSeriesPoint[] = [
  { time: "00:00", critical: 2, high: 8, medium: 15, low: 25 },
  { time: "02:00", critical: 1, high: 6, medium: 12, low: 20 },
  { time: "04:00", critical: 3, high: 10, medium: 18, low: 22 },
  { time: "06:00", critical: 5, high: 14, medium: 22, low: 30 },
  { time: "08:00", critical: 8, high: 20, medium: 35, low: 45 },
  { time: "10:00", critical: 12, high: 25, medium: 40, low: 52 },
  { time: "12:00", critical: 10, high: 22, medium: 38, low: 48 },
  { time: "14:00", critical: 7, high: 18, medium: 30, low: 42 },
  { time: "16:00", critical: 9, high: 21, medium: 34, low: 46 },
  { time: "18:00", critical: 6, high: 15, medium: 28, low: 38 },
  { time: "20:00", critical: 4, high: 12, medium: 22, low: 32 },
  { time: "22:00", critical: 3, high: 9, medium: 16, low: 28 },
]

export const severityDistribution: SeverityDistributionEntry[] = [
  { name: "Critical", value: 23, fill: "hsl(0, 72%, 51%)" },
  { name: "High", value: 156, fill: "hsl(38, 92%, 50%)" },
  { name: "Medium", value: 432, fill: "hsl(199, 89%, 48%)" },
  { name: "Low", value: 636, fill: "hsl(142, 71%, 45%)" },
]

export const topAttackSources: AttackSource[] = [
  { country: "Russia", count: 342, percentage: 27.4 },
  { country: "China", count: 287, percentage: 23.0 },
  { country: "North Korea", count: 156, percentage: 12.5 },
  { country: "Iran", count: 98, percentage: 7.9 },
  { country: "Unknown", count: 364, percentage: 29.2 },
]

export const mockAlerts: Alert[] = [
  {
    id: "ALT-001",
    title: "Brute Force Attack Detected on Azure AD",
    severity: "critical",
    status: "new",
    source: "Azure Active Directory",
    timestamp: "2026-02-06T14:23:00Z",
    description: "Multiple failed login attempts detected from IP 185.220.101.34 targeting admin accounts. Over 500 attempts in the last 30 minutes.",
    assignee: null,
    tactics: ["Credential Access", "Initial Access"],
    affectedEntities: ["admin@contoso.com", "globaladmin@contoso.com"],
    recommendedActions: [
      "Block the source IP address immediately",
      "Reset passwords for targeted accounts",
      "Enable MFA for all admin accounts",
      "Review sign-in logs for successful authentications",
    ],
  },
  {
    id: "ALT-002",
    title: "Suspicious PowerShell Execution on Server-DC01",
    severity: "critical",
    status: "in_progress",
    source: "Microsoft Defender for Endpoint",
    timestamp: "2026-02-06T13:45:00Z",
    description: "Encoded PowerShell command detected executing on domain controller. Command appears to be downloading and executing a remote payload.",
    assignee: "Sarah Chen",
    tactics: ["Execution", "Defense Evasion"],
    affectedEntities: ["Server-DC01", "SYSTEM account"],
    recommendedActions: [
      "Isolate the affected server from the network",
      "Capture memory dump for forensic analysis",
      "Review scheduled tasks and startup items",
      "Scan all domain controllers for similar activity",
    ],
  },
  {
    id: "ALT-003",
    title: "Data Exfiltration Attempt via DNS Tunneling",
    severity: "high",
    status: "in_progress",
    source: "Azure Firewall",
    timestamp: "2026-02-06T12:30:00Z",
    description: "Unusual DNS query patterns detected from workstation WS-FIN-042. Large volume of DNS TXT queries to suspicious domain suggesting data exfiltration via DNS tunneling.",
    assignee: "Marcus Johnson",
    tactics: ["Exfiltration", "Command and Control"],
    affectedEntities: ["WS-FIN-042", "user.finance@contoso.com"],
    recommendedActions: [
      "Block the suspicious DNS domain",
      "Isolate the affected workstation",
      "Investigate the user account for compromise",
      "Deploy DNS monitoring rules",
    ],
  },
  {
    id: "ALT-004",
    title: "Privilege Escalation via Service Account",
    severity: "high",
    status: "new",
    source: "Azure Active Directory",
    timestamp: "2026-02-06T11:15:00Z",
    description: "Service account svc-backup was added to Domain Admins group. This change was made outside of normal change management procedures.",
    assignee: null,
    tactics: ["Privilege Escalation", "Persistence"],
    affectedEntities: ["svc-backup", "Domain Admins group"],
    recommendedActions: [
      "Remove the service account from Domain Admins immediately",
      "Audit all recent changes to privileged groups",
      "Review the service account activity logs",
      "Implement Just-In-Time access for admin privileges",
    ],
  },
  {
    id: "ALT-005",
    title: "Malware Communication Detected",
    severity: "high",
    status: "resolved",
    source: "Microsoft Defender for Endpoint",
    timestamp: "2026-02-06T09:00:00Z",
    description: "Known command-and-control server communication detected from workstation WS-MKT-018. Matches Cobalt Strike beacon pattern.",
    assignee: "Sarah Chen",
    tactics: ["Command and Control"],
    affectedEntities: ["WS-MKT-018", "user.marketing@contoso.com"],
    recommendedActions: [
      "Isolate the affected workstation",
      "Run full antimalware scan",
      "Check for lateral movement to other systems",
      "Block C2 indicators at the firewall level",
    ],
  },
  {
    id: "ALT-006",
    title: "Anomalous Azure Resource Deployment",
    severity: "medium",
    status: "new",
    source: "Azure Activity Logs",
    timestamp: "2026-02-06T08:20:00Z",
    description: "Multiple virtual machines deployed in an unusual region (East Asia) by a developer account that typically operates in West US.",
    assignee: null,
    tactics: ["Resource Hijacking"],
    affectedEntities: ["dev-team@contoso.com", "Azure Subscription: Prod-01"],
    recommendedActions: [
      "Verify with the developer if this deployment was intentional",
      "Review the deployed resources for cryptomining indicators",
      "Implement Azure Policy to restrict deployment regions",
      "Enable cost alerts for the subscription",
    ],
  },
  {
    id: "ALT-007",
    title: "Unusual Sign-in from TOR Exit Node",
    severity: "medium",
    status: "dismissed",
    source: "Azure Active Directory",
    timestamp: "2026-02-06T07:10:00Z",
    description: "Successful sign-in detected from a known TOR exit node IP address for user research@contoso.com.",
    assignee: "Marcus Johnson",
    tactics: ["Initial Access"],
    affectedEntities: ["research@contoso.com"],
    recommendedActions: [
      "Verify with the user if the sign-in was legitimate",
      "Implement conditional access policies blocking TOR IPs",
      "Review the user's recent activity for anomalies",
      "Consider risk-based conditional access policies",
    ],
  },
  {
    id: "ALT-008",
    title: "Failed Key Vault Access Attempts",
    severity: "low",
    status: "resolved",
    source: "Azure Key Vault",
    timestamp: "2026-02-06T05:45:00Z",
    description: "Multiple failed attempts to access secrets in the production Key Vault from an unrecognized application identity.",
    assignee: "Sarah Chen",
    tactics: ["Credential Access"],
    affectedEntities: ["kv-prod-secrets", "app-unknown-identity"],
    recommendedActions: [
      "Review Key Vault access policies",
      "Identify the unrecognized application",
      "Enable soft delete and purge protection",
      "Set up alerts for Key Vault access patterns",
    ],
  },
]

export const mockLogs: LogEntry[] = [
  {
    id: "LOG-001",
    timestamp: "2026-02-06T14:23:15Z",
    severity: "critical",
    source: "Azure AD",
    category: "SignInLogs",
    message: "Multiple failed sign-in attempts from IP 185.220.101.34 targeting admin@contoso.com",
    ipAddress: "185.220.101.34",
    user: "admin@contoso.com",
    status: "new",
  },
  {
    id: "LOG-002",
    timestamp: "2026-02-06T14:22:45Z",
    severity: "critical",
    source: "Defender for Endpoint",
    category: "SecurityAlert",
    message: "Encoded PowerShell execution detected: powershell -enc JABjAGwA...",
    ipAddress: "10.0.1.50",
    user: "SYSTEM",
    status: "investigating",
  },
  {
    id: "LOG-003",
    timestamp: "2026-02-06T14:20:30Z",
    severity: "high",
    source: "Azure Firewall",
    category: "NetworkRule",
    message: "DNS tunneling pattern detected - high volume TXT queries to susp-domain.xyz",
    ipAddress: "10.0.5.42",
    user: "user.finance@contoso.com",
    status: "investigating",
  },
  {
    id: "LOG-004",
    timestamp: "2026-02-06T14:18:00Z",
    severity: "high",
    source: "Azure AD",
    category: "AuditLogs",
    message: "Service account svc-backup added to Domain Admins group",
    ipAddress: "10.0.1.10",
    user: "unknown",
    status: "new",
  },
  {
    id: "LOG-005",
    timestamp: "2026-02-06T14:15:22Z",
    severity: "medium",
    source: "Azure Activity",
    category: "Administrative",
    message: "10 virtual machines deployed in East Asia region by dev-team@contoso.com",
    ipAddress: "203.0.113.50",
    user: "dev-team@contoso.com",
    status: "new",
  },
  {
    id: "LOG-006",
    timestamp: "2026-02-06T14:12:00Z",
    severity: "medium",
    source: "Azure AD",
    category: "SignInLogs",
    message: "Successful sign-in from TOR exit node 198.51.100.23",
    ipAddress: "198.51.100.23",
    user: "research@contoso.com",
    status: "resolved",
  },
  {
    id: "LOG-007",
    timestamp: "2026-02-06T14:10:30Z",
    severity: "low",
    source: "Key Vault",
    category: "AuditEvent",
    message: "Failed GET secret attempt on kv-prod-secrets by unrecognized identity",
    ipAddress: "10.0.2.100",
    user: "app-unknown-identity",
    status: "resolved",
  },
  {
    id: "LOG-008",
    timestamp: "2026-02-06T14:08:15Z",
    severity: "informational",
    source: "Azure AD",
    category: "SignInLogs",
    message: "Successful MFA verification for globaladmin@contoso.com",
    ipAddress: "192.168.1.100",
    user: "globaladmin@contoso.com",
    status: "resolved",
  },
  {
    id: "LOG-009",
    timestamp: "2026-02-06T14:05:00Z",
    severity: "low",
    source: "Azure Firewall",
    category: "ApplicationRule",
    message: "Outbound connection to known scanning service from WS-DEV-003",
    ipAddress: "10.0.3.15",
    user: "dev-user@contoso.com",
    status: "new",
  },
  {
    id: "LOG-010",
    timestamp: "2026-02-06T14:02:00Z",
    severity: "informational",
    source: "Azure Activity",
    category: "Policy",
    message: "Azure Policy compliance check completed - 98.2% compliant",
    ipAddress: "N/A",
    user: "system",
    status: "resolved",
  },
]

export const recommendedActions: Recommendation[] = [
  {
    id: "REC-001",
    title: "Enable Multi-Factor Authentication for All Users",
    priority: "critical",
    category: "Identity Protection",
    description: "Only 67% of users have MFA enabled. This leaves accounts vulnerable to credential-based attacks, which account for 45% of current alerts.",
    impact: "Would reduce credential-based alerts by approximately 99.9%",
    effort: "medium",
    status: "pending",
    relatedAlerts: ["ALT-001", "ALT-007"],
  },
  {
    id: "REC-002",
    title: "Implement Network Segmentation for Critical Servers",
    priority: "high",
    category: "Network Security",
    description: "Domain controllers and key infrastructure servers are accessible from the general network. Lateral movement from compromised workstations is trivial.",
    impact: "Would contain 80% of endpoint-originating attacks to their network segment",
    effort: "high",
    status: "in_progress",
    relatedAlerts: ["ALT-002", "ALT-005"],
  },
  {
    id: "REC-003",
    title: "Deploy DNS Security Extensions (DNSSEC)",
    priority: "high",
    category: "Network Security",
    description: "Current DNS infrastructure lacks DNSSEC validation, making it vulnerable to DNS-based attacks including tunneling and poisoning.",
    impact: "Would detect and block 95% of DNS-based exfiltration attempts",
    effort: "medium",
    status: "pending",
    relatedAlerts: ["ALT-003"],
  },
  {
    id: "REC-004",
    title: "Implement Privileged Access Management (PAM)",
    priority: "high",
    category: "Identity Protection",
    description: "Service accounts have persistent elevated privileges. Implementing PAM with just-in-time access would significantly reduce the attack surface.",
    impact: "Would eliminate 90% of privilege escalation attack vectors",
    effort: "high",
    status: "pending",
    relatedAlerts: ["ALT-004"],
  },
  {
    id: "REC-005",
    title: "Configure Azure Policy for Region Restrictions",
    priority: "medium",
    category: "Cloud Governance",
    description: "Resources can be deployed in any Azure region. Restricting deployment to approved regions prevents unauthorized resource provisioning.",
    impact: "Would prevent resource hijacking and cryptomining in unauthorized regions",
    effort: "low",
    status: "completed",
    relatedAlerts: ["ALT-006"],
  },
  {
    id: "REC-006",
    title: "Enable Advanced Threat Protection for Key Vaults",
    priority: "medium",
    category: "Data Protection",
    description: "Key Vaults lack advanced threat detection. Enabling ATP would provide alerts for unusual access patterns and potential credential theft.",
    impact: "Would detect unauthorized Key Vault access within minutes",
    effort: "low",
    status: "pending",
    relatedAlerts: ["ALT-008"],
  },
]
