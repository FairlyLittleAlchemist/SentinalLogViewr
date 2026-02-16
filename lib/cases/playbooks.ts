export type AlertType = "incident" | "security_event" | "activity" | "firewall"

type PlaybookTemplate = {
  key: string
  label: string
  tasks: string[]
}

const PLAYBOOKS: Record<AlertType, PlaybookTemplate> = {
  incident: {
    key: "incident_response",
    label: "Incident Response",
    tasks: [
      "Validate incident scope and impact",
      "Confirm affected accounts, hosts, and resources",
      "Contain active threat paths",
      "Document root cause and resolution notes",
    ],
  },
  security_event: {
    key: "security_event_triage",
    label: "Security Event Triage",
    tasks: [
      "Verify signal fidelity and source integrity",
      "Correlate event with recent related alerts",
      "Classify as benign, suspicious, or malicious",
      "Escalate confirmed threats to incident workflow",
    ],
  },
  activity: {
    key: "activity_investigation",
    label: "Activity Investigation",
    tasks: [
      "Validate actor intent and change context",
      "Review access scope and privilege level",
      "Check for unusual geo/time/resource patterns",
      "Confirm policy compliance and closeout notes",
    ],
  },
  firewall: {
    key: "network_containment",
    label: "Network Containment",
    tasks: [
      "Identify source and destination communication path",
      "Validate protocol and port risk profile",
      "Block or restrict suspicious traffic indicators",
      "Capture IOC evidence and verify post-block behavior",
    ],
  },
}

export function getPlaybookForAlertType(alertType: string | null | undefined): PlaybookTemplate {
  const normalized = String(alertType ?? "").trim().toLowerCase() as AlertType
  return PLAYBOOKS[normalized] ?? PLAYBOOKS.security_event
}

export function listPlaybookKeys() {
  return Object.values(PLAYBOOKS).map((playbook) => ({
    key: playbook.key,
    label: playbook.label,
  }))
}
