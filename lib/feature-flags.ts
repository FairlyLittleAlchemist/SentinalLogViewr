export const EXPERIMENTAL_PLAYBOOKS_FLAG = "experimental_playbooks"

export type FeatureFlagRecord = {
  key: string
  enabled: boolean
  description?: string | null
  updated_at?: string
}

export function isPlaybooksExperimentalEnabled(flags: FeatureFlagRecord[]) {
  return flags.some((flag) => flag.key === EXPERIMENTAL_PLAYBOOKS_FLAG && flag.enabled)
}
